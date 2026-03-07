import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionStream } from "@/lib/llm/client";
import {
  REWRITE_SCRIPT_SYSTEM,
  REWRITE_SCRIPT_USER,
  REWRITE_SCRIPT_CHUNK_USER,
} from "@/lib/llm/prompts/rewrite-script";
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

export const handleRewriteScript = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const scriptId = data.scriptId as string;
  const rewritePrompt = data.rewritePrompt as string;
  const modelKey = data.modelKey as string | undefined;

  // 1. Read original script
  const originalScript = await prisma.script.findUnique({
    where: { id: scriptId },
  });

  if (!originalScript) {
    throw new Error("Original script not found");
  }

  if (originalScript.userId !== userId) {
    throw new Error("Script does not belong to this user");
  }

  await ctx.reportProgress(10);

  // 2. Get LLM config (with optional model key)
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

  await ctx.reportProgress(20);

  // 3. Rewrite — smart chunking for long scripts (streaming)
  const content = originalScript.content;
  let result: string;

  if (content.length <= CHUNK_THRESHOLD) {
    // Short script: single streaming call
    result = await chatCompletionStream(client, {
      model: llmCfg.model,
      systemPrompt: REWRITE_SCRIPT_SYSTEM,
      userPrompt: REWRITE_SCRIPT_USER(content, rewritePrompt),
      temperature: 0.7,
      onChunk: (delta) => ctx.publishText(delta),
    });
  } else {
    // Long script: chunk and rewrite each part with streaming
    const chunks = splitIntoChunks(content, CHUNK_THRESHOLD);
    const rewrittenParts: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        ctx.publishText("\n\n");
      }

      const chunkResult = await chatCompletionStream(client, {
        model: llmCfg.model,
        systemPrompt: REWRITE_SCRIPT_SYSTEM,
        userPrompt: REWRITE_SCRIPT_CHUNK_USER(chunks[i], rewritePrompt, i, chunks.length),
        temperature: 0.7,
        onChunk: (delta) => ctx.publishText(delta),
      });

      rewrittenParts.push(chunkResult.trim());

      // Progress: 20% to 70% distributed across chunks
      const chunkProgress = 20 + Math.round(((i + 1) / chunks.length) * 50);
      await ctx.reportProgress(chunkProgress);
    }

    result = rewrittenParts.join("\n\n");
  }
  await ctx.flushText();

  if (!result.trim()) {
    throw new Error("LLM returned empty response");
  }

  await ctx.reportProgress(80);

  // 4. Extract title and content
  const lines = result.trim().split("\n");
  const title = lines[0].replace(/^[#\s*]+/, "").trim() || `${originalScript.title} (改写)`;
  const content2 = lines.slice(1).join("\n").trim() || result.trim();

  // 5. Save new script with parentId
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
