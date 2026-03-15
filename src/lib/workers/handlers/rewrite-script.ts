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
  REWRITE_SYSTEM,
  REWRITE_USER,
  REWRITE_CHUNK_USER,
  OutputFormat,
  StyleFingerprint,
} from "@/lib/llm/prompts/rewrite-script";
import {
  buildReflectSystemPrompt,
  buildReflectUserPrompt,
  buildImproveSystemPrompt,
  buildImproveUserPrompt,
} from "@/lib/agents/definitions";
import { resolveLlmConfig, resolveProviderConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

const CHUNK_THRESHOLD = 3000;

/**
 * Split content into chunks by double-newline paragraphs,
 * merging adjacent paragraphs so each chunk stays under the threshold.
 */
function splitIntoChunks(content: string, threshold: number): string[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > threshold) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [content];
}

/** Get last N characters of text as transition context */
function getTail(text: string, maxLen = 300): string {
  if (text.length <= maxLen) return text;
  return text.slice(-maxLen);
}

export const handleRewriteScript = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const scriptId = data.scriptId as string;
  const rewritePrompt = data.rewritePrompt as string;
  const modelKey = data.modelKey as string | undefined;
  const outputFormat = (data.outputFormat as OutputFormat) || "same";

  // 1. Read original script
  const originalScript = await prisma.script.findUnique({
    where: { id: scriptId },
  });

  if (!originalScript) throw new Error("Original script not found");
  if (originalScript.userId !== userId) throw new Error("Script does not belong to this user");

  await ctx.reportProgress(5);

  // 2. Get LLM config
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

  // 3. Style analysis — extract fingerprint from source text
  ctx.publishText("📋 分析原文风格...\n\n");
  let styleFingerprint: StyleFingerprint | undefined;
  try {
    styleFingerprint = await chatCompletionJson<StyleFingerprint>(client, {
      model: llmCfg.model,
      systemPrompt: STYLE_ANALYSIS_SYSTEM,
      userPrompt: STYLE_ANALYSIS_USER(originalScript.content),
      temperature: 0.3,
    });
  } catch {
    // Style analysis is optional — continue without it
    ctx.publishText("⚠️ 风格分析跳过\n\n");
  }

  await ctx.reportProgress(15);

  // 4. Rewrite with style-aware prompt
  ctx.publishText("✍️ 开始改写...\n\n");
  const content = originalScript.content;
  let result: string;

  if (content.length <= CHUNK_THRESHOLD) {
    result = await chatCompletionStream(client, {
      model: llmCfg.model,
      systemPrompt: REWRITE_SYSTEM(outputFormat, styleFingerprint),
      userPrompt: REWRITE_USER(content, rewritePrompt),
      temperature: 0.7,
      onChunk: (delta) => ctx.publishText(delta),
    });
  } else {
    const chunks = splitIntoChunks(content, CHUNK_THRESHOLD);
    const rewrittenParts: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) ctx.publishText("\n\n");

      const prevTail = i > 0 ? getTail(rewrittenParts[i - 1]) : undefined;

      const chunkResult = await chatCompletionStream(client, {
        model: llmCfg.model,
        systemPrompt: REWRITE_SYSTEM(outputFormat, styleFingerprint),
        userPrompt: REWRITE_CHUNK_USER(chunks[i], rewritePrompt, i, chunks.length, prevTail),
        temperature: 0.7,
        onChunk: (delta) => ctx.publishText(delta),
      });

      rewrittenParts.push(chunkResult.trim());

      const chunkProgress = 15 + Math.round(((i + 1) / chunks.length) * 45);
      await ctx.reportProgress(chunkProgress);
    }

    result = rewrittenParts.join("\n\n");
  }

  if (!result.trim()) throw new Error("LLM returned empty response");
  await ctx.reportProgress(65);

  // 5. Reflect — diagnose AI traces and quality issues
  ctx.publishText("\n\n🔍 质量检查...\n");
  let reflectionText = "";
  let totalScore = 80; // default if reflection fails
  try {
    const reflectInput = { originalText: content, rewrittenText: result };
    const reflection = await chatCompletionJson<{
      scores: Record<string, { score: number; issue: string }>;
      totalScore: number;
      aiPatterns: string[];
      suggestions: string[];
    }>(client, {
      model: llmCfg.model,
      systemPrompt: buildReflectSystemPrompt(reflectInput),
      userPrompt: buildReflectUserPrompt(reflectInput),
      temperature: 0.3,
    });

    totalScore = reflection.totalScore;
    const patternList = reflection.aiPatterns.length > 0
      ? reflection.aiPatterns.map((p) => `- ${p}`).join("\n")
      : "无明显AI痕迹";
    const suggestionList = reflection.suggestions.map((s) => `- ${s}`).join("\n");

    reflectionText = `质量评分: ${totalScore}/80\nAI痕迹:\n${patternList}\n改进建议:\n${suggestionList}`;
    ctx.publishText(`\n评分: ${totalScore}/80\n`);
  } catch {
    ctx.publishText("\n⚠️ 质量检查跳过\n");
  }

  await ctx.reportProgress(75);

  // 6. Improve — if score is below threshold, apply reflection feedback
  if (totalScore < 56 && reflectionText) {
    ctx.publishText("\n✨ 润色改进中...\n\n");
    const improveInput = { rewrittenText: result, reflectionFeedback: reflectionText };
    const improved = await chatCompletionStream(client, {
      model: llmCfg.model,
      systemPrompt: buildImproveSystemPrompt(improveInput),
      userPrompt: buildImproveUserPrompt(improveInput),
      temperature: 0.6,
      onChunk: (delta) => ctx.publishText(delta),
    });

    if (improved.trim()) {
      result = improved;
    }
  }

  await ctx.flushText();
  await ctx.reportProgress(90);

  // 7. Save
  const lines = result.trim().split("\n");
  const title = lines[0].replace(/^[#\s*]+/, "").trim() || `${originalScript.title} (改写)`;
  const content2 = lines.slice(1).join("\n").trim() || result.trim();

  const newScript = await prisma.script.create({
    data: {
      userId,
      title,
      content: content2,
      sourceType: "rewrite",
      prompt: rewritePrompt,
      parentId: scriptId,
    },
  });

  return { scriptId: newScript.id, title: newScript.title };
});
