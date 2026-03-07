import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionJson } from "@/lib/llm/client";
import { ANALYZE_SHOTS_SYSTEM, ANALYZE_SHOTS_USER } from "@/lib/llm/prompts/analyze-shots";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

interface ShotVariant {
  id: number;
  title: string;
  description: string;
  shot_type: string;
  camera_move: string;
  video_prompt: string;
  creative_score: number;
}

export const handleAnalyzeShotVariants = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId, data } = payload;
  const panelId = data.panelId as string;

  if (!panelId) {
    throw new Error("Missing required field: panelId");
  }

  // Fetch panel with context
  await ctx.reportProgress(10);
  const panel = await prisma.panel.findUniqueOrThrow({
    where: { id: panelId },
    include: {
      clip: {
        include: {
          episode: { include: { project: true } },
        },
      },
    },
  });

  // Gather character descriptions
  let charDesc = "No characters specified";
  if (projectId) {
    const characters = await prisma.character.findMany({ where: { projectId } });
    if (characters.length > 0) {
      charDesc = characters.map((c) => `${c.name}: ${c.description}`).join("\n");
    }
  }

  const locationContext = panel.clip.description || "";

  // Call LLM for shot analysis
  await ctx.reportProgress(30);
  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);

  const suggestions = await chatCompletionJson<ShotVariant[]>(client, {
    model: llmCfg.model,
    systemPrompt: ANALYZE_SHOTS_SYSTEM,
    userPrompt: ANALYZE_SHOTS_USER(
      panel.sceneDescription || "",
      panel.cameraAngle || "medium",
      locationContext,
      charDesc
    ),
  });

  if (!Array.isArray(suggestions) || suggestions.length < 3) {
    throw new Error("LLM returned insufficient variant suggestions");
  }

  return {
    panelId,
    suggestions,
    panelInfo: {
      sceneDescription: panel.sceneDescription,
      cameraAngle: panel.cameraAngle,
      imageUrl: panel.imageUrl,
    },
  };
});
