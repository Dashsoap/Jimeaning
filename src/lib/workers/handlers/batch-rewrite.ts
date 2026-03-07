import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionStream } from "@/lib/llm/client";
import { BATCH_REWRITE_SYSTEM, BATCH_REWRITE_USER } from "@/lib/llm/prompts/smart-split";
import { resolveLlmConfig, resolveProviderConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleBatchRewrite = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const masterScriptId = data.masterScriptId as string;
  const rewritePrompt = data.rewritePrompt as string;
  const modelKey = data.modelKey as string | undefined;

  if (!masterScriptId || !rewritePrompt) {
    throw new Error("Missing required fields: masterScriptId, rewritePrompt");
  }

  // 1. Fetch master script and its chapters
  const masterScript = await prisma.script.findFirst({
    where: { id: masterScriptId, userId },
  });

  if (!masterScript) {
    throw new Error("Master script not found");
  }

  const chapters = await prisma.script.findMany({
    where: { masterScriptId, userId },
    orderBy: { chapterIndex: "asc" },
  });

  if (chapters.length === 0) {
    throw new Error("No chapters found for this master script");
  }

  await ctx.reportProgress(5);

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

  await ctx.reportProgress(10);

  // 3. Rewrite each chapter sequentially with streaming output
  let rewrittenCount = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];

    if (i > 0) {
      ctx.publishText("\n---CHAPTER_BREAK---\n");
    }

    ctx.publishText(`\n## 第 ${i + 1}/${chapters.length} 章: ${chapter.title}\n\n`);

    const rewrittenText = await chatCompletionStream(client, {
      model: llmCfg.model,
      systemPrompt: BATCH_REWRITE_SYSTEM,
      userPrompt: BATCH_REWRITE_USER(chapter.content, rewritePrompt, i, chapters.length),
      temperature: 0.7,
      onChunk: (delta) => ctx.publishText(delta),
    });

    // Extract title and content from rewritten text
    const lines = rewrittenText.trim().split("\n");
    const rewrittenTitle = lines[0].replace(/^[#\s*]+/, "").trim() || `${chapter.title} (改写)`;
    const rewrittenContent = lines.slice(1).join("\n").trim() || rewrittenText.trim();

    // Save rewritten script as child of chapter
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

    const progress = 10 + Math.round(((i + 1) / chapters.length) * 85);
    await ctx.reportProgress(progress);
  }

  await ctx.flushText();
  await ctx.reportProgress(100);

  return { rewrittenCount, totalChapters: chapters.length };
});
