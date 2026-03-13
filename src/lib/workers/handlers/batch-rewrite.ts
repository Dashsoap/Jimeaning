import { prisma } from "@/lib/prisma";
import {
  createLLMClient,
  chatCompletion,
  chatCompletionStream,
  chatCompletionJson,
} from "@/lib/llm/client";
import {
  STYLE_ANALYSIS_SYSTEM,
  STYLE_ANALYSIS_USER,
  BATCH_REWRITE_SYSTEM,
  BATCH_REWRITE_USER,
  CHAPTER_SUMMARY_SYSTEM,
  CHAPTER_SUMMARY_USER,
  OutputFormat,
  StyleFingerprint,
} from "@/lib/llm/prompts/rewrite-script";
import { resolveLlmConfig, resolveProviderConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

/** Get last N characters of text as transition context */
function getTail(text: string, maxLen = 300): string {
  if (text.length <= maxLen) return text;
  return text.slice(-maxLen);
}

export const handleBatchRewrite = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const masterScriptId = data.masterScriptId as string;
  const rewritePrompt = data.rewritePrompt as string;
  const modelKey = data.modelKey as string | undefined;
  const outputFormat = (data.outputFormat as OutputFormat) || "same";

  if (!masterScriptId || !rewritePrompt) {
    throw new Error("Missing required fields: masterScriptId, rewritePrompt");
  }

  // 1. Fetch master script and its chapters
  const masterScript = await prisma.script.findFirst({
    where: { id: masterScriptId, userId },
  });

  if (!masterScript) throw new Error("Master script not found");

  const chapters = await prisma.script.findMany({
    where: { masterScriptId, userId },
    orderBy: { chapterIndex: "asc" },
  });

  if (chapters.length === 0) throw new Error("No chapters found for this master script");

  await ctx.reportProgress(3);

  // 2. Resolve LLM config
  let llmCfg: { apiKey: string; baseUrl?: string; model: string };
  if (modelKey) {
    const resolved = await resolveProviderConfig(userId, "llm", modelKey);
    llmCfg = {
      apiKey: resolved.config.apiKey,
      baseUrl: resolved.config.baseUrl,
      model: resolved.config.model || "",
    };
  } else {
    llmCfg = await resolveLlmConfig(userId);
  }
  const client = createLLMClient(llmCfg);

  await ctx.reportProgress(5);

  // 3. Style analysis — extract fingerprint from first few chapters
  ctx.publishText("📋 分析原文风格...\n\n");
  let styleFingerprint: StyleFingerprint | undefined;
  try {
    // Combine first 2 chapters (or all if fewer) for style sampling
    const sampleText = chapters
      .slice(0, 2)
      .map((c) => c.content)
      .join("\n\n")
      .slice(0, 6000);

    styleFingerprint = await chatCompletionJson<StyleFingerprint>(client, {
      model: llmCfg.model,
      systemPrompt: STYLE_ANALYSIS_SYSTEM,
      userPrompt: STYLE_ANALYSIS_USER(sampleText),
      temperature: 0.3,
    });

    ctx.publishText(
      `风格: ${styleFingerprint.contentType} | ${styleFingerprint.emotionalTone} | ${styleFingerprint.sentenceStyle}\n\n`,
    );
  } catch {
    ctx.publishText("⚠️ 风格分析跳过\n\n");
  }

  await ctx.reportProgress(10);

  // 4. Build system prompt once (shared across all chapters)
  const systemPrompt = BATCH_REWRITE_SYSTEM(outputFormat, styleFingerprint);

  // 5. Rewrite each chapter sequentially with cross-chapter context
  let rewrittenCount = 0;
  let prevChapterSummary: string | undefined;
  let prevChapterTail: string | undefined;

  // Skip chapters that already have a rewrite (resume after partial failure)
  const existingRewrites = await prisma.script.findMany({
    where: { parentId: { in: chapters.map((c) => c.id) }, sourceType: "rewrite", userId },
    select: { parentId: true, content: true },
  });
  const alreadyRewrittenMap = new Map(
    existingRewrites.map((r) => [r.parentId, r.content]),
  );

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];

    if (alreadyRewrittenMap.has(chapter.id)) {
      ctx.publishText(`\n## 第 ${i + 1}/${chapters.length} 章: ${chapter.title} ✓ (已完成)\n`);
      rewrittenCount++;

      // Still need context from already-rewritten chapters for continuity
      const existingContent = alreadyRewrittenMap.get(chapter.id) || chapter.content;
      prevChapterTail = getTail(existingContent);
      // Generate summary for next chapter context
      try {
        prevChapterSummary = await chatCompletion(client, {
          model: llmCfg.model,
          systemPrompt: CHAPTER_SUMMARY_SYSTEM,
          userPrompt: CHAPTER_SUMMARY_USER(existingContent),
          temperature: 0.3,
        });
      } catch {
        prevChapterSummary = undefined;
      }

      const progress = 10 + Math.round(((i + 1) / chapters.length) * 85);
      await ctx.reportProgress(progress);
      continue;
    }

    if (i > 0) {
      ctx.publishText("\n---CHAPTER_BREAK---\n");
    }

    ctx.publishText(`\n## 第 ${i + 1}/${chapters.length} 章: ${chapter.title}\n\n`);

    const rewrittenText = await chatCompletionStream(client, {
      model: llmCfg.model,
      systemPrompt,
      userPrompt: BATCH_REWRITE_USER(
        chapter.content,
        rewritePrompt,
        i,
        chapters.length,
        prevChapterSummary,
        prevChapterTail,
      ),
      temperature: 0.7,
      onChunk: (delta) => ctx.publishText(delta),
    });

    // Extract title and content
    const lines = rewrittenText.trim().split("\n");
    const rewrittenTitle = lines[0].replace(/^[#\s*]+/, "").trim() || `${chapter.title} (改写)`;
    const rewrittenContent = lines.slice(1).join("\n").trim() || rewrittenText.trim();

    // Save rewritten script
    await prisma.script.create({
      data: {
        userId,
        title: rewrittenTitle,
        content: rewrittenContent,
        sourceType: "rewrite",
        prompt: rewritePrompt,
        parentId: chapter.id,
      },
    });

    rewrittenCount++;

    // Generate cross-chapter context for next chapter
    prevChapterTail = getTail(rewrittenContent);
    try {
      prevChapterSummary = await chatCompletion(client, {
        model: llmCfg.model,
        systemPrompt: CHAPTER_SUMMARY_SYSTEM,
        userPrompt: CHAPTER_SUMMARY_USER(rewrittenContent),
        temperature: 0.3,
      });
    } catch {
      prevChapterSummary = undefined;
    }

    const progress = 10 + Math.round(((i + 1) / chapters.length) * 85);
    await ctx.reportProgress(progress);
  }

  await ctx.flushText();
  await ctx.reportProgress(100);

  return { rewrittenCount, totalChapters: chapters.length };
});
