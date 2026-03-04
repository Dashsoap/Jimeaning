import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletion } from "@/lib/llm/client";
import {
  GENERATE_IMAGE_PROMPT_SYSTEM,
  GENERATE_IMAGE_PROMPT_USER,
} from "@/lib/llm/prompts/generate-image-prompt";
import { createImageGenerator } from "@/lib/generators/factory";
import { resolveProviderConfig, resolveImageConfig } from "@/lib/providers/resolve";
import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

export async function handleGeneratePanelImage(payload: TaskPayload) {
  const { taskId, userId, projectId, data } = payload;
  const panelId = data.panelId as string;

  try {
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
    await updateTaskProgress(taskId, 30);
    const llmConfig = await resolveProviderConfig(userId, "openai");
    const pref = await prisma.userPreference.findUnique({
      where: { userId },
    });
    const llmModel = pref?.llmModel || "gpt-4o";
    const client = createLLMClient(llmConfig);

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
    await updateTaskProgress(taskId, 60);
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

    await completeTask(taskId, { panelId, imageUrl });
  } catch (error) {
    await failTask(taskId, error instanceof Error ? error.message : String(error));
  }
}
