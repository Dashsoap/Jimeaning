import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletion } from "@/lib/llm/client";
import { REWRITE_SCRIPT_SYSTEM, REWRITE_SCRIPT_USER } from "@/lib/llm/prompts/rewrite-script";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleRewriteScript = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const scriptId = data.scriptId as string;
  const rewritePrompt = data.rewritePrompt as string;

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

  await ctx.reportProgress(20);

  // 2. Get LLM config
  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);

  await ctx.reportProgress(40);

  // 3. Rewrite script
  const result = await chatCompletion(client, {
    model: llmCfg.model,
    systemPrompt: REWRITE_SCRIPT_SYSTEM,
    userPrompt: REWRITE_SCRIPT_USER(originalScript.content, rewritePrompt),
    temperature: 0.7,
  });

  if (!result.trim()) {
    throw new Error("LLM returned empty response");
  }

  await ctx.reportProgress(70);

  // 4. Extract title and content
  const lines = result.trim().split("\n");
  const title = lines[0].replace(/^[#\s*]+/, "").trim() || `${originalScript.title} (改写)`;
  const content = lines.slice(1).join("\n").trim() || result.trim();

  // 5. Save new script with parentId
  const newScript = await prisma.script.create({
    data: {
      userId,
      title,
      content,
      sourceType: "rewrite",
      prompt: rewritePrompt,
      parentId: scriptId,
    },
  });

  return { scriptId: newScript.id, title: newScript.title };
});
