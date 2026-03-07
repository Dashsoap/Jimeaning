import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionJson } from "@/lib/llm/client";
import { MODIFY_PROMPT_SYSTEM, MODIFY_PROMPT_USER } from "@/lib/llm/prompts/modify-prompt";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

interface ModifyPromptResult {
  image_prompt: string;
}

export const handleAiModifyPrompt = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId, data } = payload;
  const panelId = data.panelId as string;
  const currentPrompt = data.currentPrompt as string;
  const modifyInstruction = data.modifyInstruction as string;

  if (!panelId || !currentPrompt || !modifyInstruction) {
    throw new Error("Missing required fields: panelId, currentPrompt, modifyInstruction");
  }

  // Gather context: characters + location
  await ctx.reportProgress(10);
  let charDesc: string | undefined;
  let locationDesc: string | undefined;

  if (projectId) {
    const characters = await prisma.character.findMany({ where: { projectId } });
    if (characters.length > 0) {
      charDesc = characters.map((c) => `${c.name}: ${c.description}`).join("; ");
    }

    const panel = await prisma.panel.findUnique({
      where: { id: panelId },
      include: { clip: true },
    });
    if (panel?.clip) {
      locationDesc = panel.clip.description ?? undefined;
    }
  }

  // Call LLM to modify the prompt
  await ctx.reportProgress(30);
  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);

  const result = await chatCompletionJson<ModifyPromptResult>(client, {
    model: llmCfg.model,
    systemPrompt: MODIFY_PROMPT_SYSTEM,
    userPrompt: MODIFY_PROMPT_USER(currentPrompt, modifyInstruction, charDesc, locationDesc),
  });

  const modifiedPrompt = result.image_prompt?.trim();
  if (!modifiedPrompt) {
    throw new Error("LLM returned empty image_prompt");
  }

  // Persist the updated prompt
  await ctx.reportProgress(80);
  await prisma.panel.update({
    where: { id: panelId },
    data: { imagePrompt: modifiedPrompt },
  });

  return { panelId, modifiedPrompt };
});
