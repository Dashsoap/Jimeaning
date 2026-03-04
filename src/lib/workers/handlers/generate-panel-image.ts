import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletion } from "@/lib/llm/client";
import {
  GENERATE_IMAGE_PROMPT_SYSTEM,
  GENERATE_IMAGE_PROMPT_USER,
} from "@/lib/llm/prompts/generate-image-prompt";
import { createImageGenerator } from "@/lib/generators/factory";
import { resolveImageConfig, resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleGeneratePanelImage = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId, data } = payload;
  const panelId = data.panelId as string;

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

  const project = panel.clip.episode.project;

  // Get character descriptions for context
  const characters = await prisma.character.findMany({
    where: { projectId },
  });
  const charDesc = characters
    .map((c) => `${c.name}: ${c.description}`)
    .join("; ");

  // Step 1: Generate optimized image prompt via LLM
  await ctx.reportProgress(30);
  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);
  const llmModel = llmCfg.model;

  const imagePrompt = await chatCompletion(client, {
    model: llmModel,
    systemPrompt: GENERATE_IMAGE_PROMPT_SYSTEM,
    userPrompt: GENERATE_IMAGE_PROMPT_USER(
      panel.sceneDescription || "",
      panel.cameraAngle || "medium",
      project.style,
      charDesc
    ),
  });

  await prisma.panel.update({
    where: { id: panelId },
    data: { imagePrompt },
  });

  // Step 2: Generate image
  await ctx.reportProgress(60);
  const { provider, config } = await resolveImageConfig(userId);
  const generator = createImageGenerator(provider, config);

  const aspectRatio = project.aspectRatio || "16:9";
  const [w, h] = aspectRatio.split(":").map(Number);
  const baseSize = 1024;
  const width = w > h ? Math.round(baseSize * (w / h)) : baseSize;
  const height = h > w ? Math.round(baseSize * (h / w)) : baseSize;

  const result = await generator.generate({
    prompt: imagePrompt,
    width,
    height,
    style: project.style,
  });

  // Save result
  const imageUrl = result.url || (result.base64 ? `data:image/png;base64,${result.base64}` : null);

  if (imageUrl) {
    await prisma.panel.update({
      where: { id: panelId },
      data: { imageUrl },
    });
  }

  return { panelId, imageUrl };
});
