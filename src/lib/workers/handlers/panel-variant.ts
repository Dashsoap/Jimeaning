import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionJson } from "@/lib/llm/client";
import { PANEL_VARIANT_SYSTEM, PANEL_VARIANT_USER } from "@/lib/llm/prompts/panel-variant";
import { createImageGenerator } from "@/lib/generators/factory";
import { resolveImageConfig, resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

interface VariantPromptResult {
  image_prompt: string;
}

export const handlePanelVariant = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId, data } = payload;
  const newPanelId = data.newPanelId as string;
  const sourcePanelId = data.sourcePanelId as string;
  const variant = data.variant as {
    description: string;
    shot_type: string;
    camera_move: string;
  };

  if (!newPanelId || !sourcePanelId || !variant) {
    throw new Error("Missing required fields: newPanelId, sourcePanelId, variant");
  }

  // Fetch panels and project context
  await ctx.reportProgress(10);
  const sourcePanel = await prisma.panel.findUniqueOrThrow({
    where: { id: sourcePanelId },
    include: {
      clip: { include: { episode: { include: { project: true } } } },
    },
  });

  const project = sourcePanel.clip.episode.project;

  // Gather character descriptions
  let charDesc = "Not specified";
  if (projectId) {
    const characters = await prisma.character.findMany({ where: { projectId } });
    if (characters.length > 0) {
      charDesc = characters.map((c) => `${c.name}: ${c.description}`).join("; ");
    }
  }

  // Step 1: LLM generates new image prompt for the variant
  await ctx.reportProgress(20);
  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);

  const result = await chatCompletionJson<VariantPromptResult>(client, {
    model: llmCfg.model,
    systemPrompt: PANEL_VARIANT_SYSTEM,
    userPrompt: PANEL_VARIANT_USER(
      sourcePanel.sceneDescription || "",
      sourcePanel.cameraAngle || "medium",
      variant.description,
      variant.shot_type,
      variant.camera_move,
      charDesc,
      project.style
    ),
  });

  const imagePrompt = result.image_prompt?.trim();
  if (!imagePrompt) {
    throw new Error("LLM returned empty image_prompt for variant");
  }

  // Save the prompt to the new panel
  await prisma.panel.update({
    where: { id: newPanelId },
    data: {
      imagePrompt,
      sceneDescription: variant.description || sourcePanel.sceneDescription,
      cameraAngle: variant.shot_type || sourcePanel.cameraAngle,
    },
  });

  // Step 2: Generate image
  await ctx.reportProgress(50);
  const { provider, config } = await resolveImageConfig(userId);
  const generator = createImageGenerator(provider, config);

  const aspectRatio = project.aspectRatio || "16:9";
  const [w, h] = aspectRatio.split(":").map(Number);
  const baseSize = 1024;
  const width = w > h ? Math.round(baseSize * (w / h)) : baseSize;
  const height = h > w ? Math.round(baseSize * (h / w)) : baseSize;

  const genResult = await generator.generate({
    prompt: imagePrompt,
    width,
    height,
    style: project.style,
  });

  const imageUrl = genResult.url || (genResult.base64 ? `data:image/png;base64,${genResult.base64}` : null);

  if (imageUrl) {
    await prisma.panel.update({
      where: { id: newPanelId },
      data: { imageUrl },
    });
  }

  return { panelId: newPanelId, sourcePanelId, imageUrl, imagePrompt };
});
