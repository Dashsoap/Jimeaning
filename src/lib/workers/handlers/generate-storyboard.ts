import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletion } from "@/lib/llm/client";
import {
  GENERATE_STORYBOARD_SYSTEM,
  GENERATE_STORYBOARD_USER,
} from "@/lib/llm/prompts/generate-storyboard-text";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

export async function handleGenerateStoryboard(payload: TaskPayload) {
  const { taskId, userId, projectId } = payload;

  try {
    const llmCfg = await resolveLlmConfig(userId);
    const client = createLLMClient(llmCfg);
    const model = llmCfg.model;

    // Get all clips for the project
    const episodes = await prisma.episode.findMany({
      where: { projectId },
      include: { clips: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });

    const characters = await prisma.character.findMany({
      where: { projectId },
    });
    const locations = await prisma.location.findMany({
      where: { projectId },
    });

    const charDescriptions = characters
      .map((c) => `${c.name}: ${c.description}`)
      .join("\n");
    const locDescriptions = locations
      .map((l) => `${l.name}: ${l.description}`)
      .join("\n");

    let totalClips = 0;
    let processedClips = 0;
    for (const ep of episodes) {
      totalClips += ep.clips.length;
    }

    await updateTaskProgress(taskId, 0, totalClips);

    for (const episode of episodes) {
      for (const clip of episode.clips) {
        const result = await chatCompletion(client, {
          model,
          systemPrompt: GENERATE_STORYBOARD_SYSTEM,
          userPrompt: GENERATE_STORYBOARD_USER(
            clip.description || clip.title || "",
            charDescriptions,
            locDescriptions
          ),
          responseFormat: "json",
        });

        const parsed = JSON.parse(result);

        for (let i = 0; i < (parsed.panels || []).length; i++) {
          const panel = parsed.panels[i];
          await prisma.panel.create({
            data: {
              clipId: clip.id,
              sceneDescription: panel.sceneDescription,
              cameraAngle: panel.cameraAngle,
              durationMs: panel.durationMs || 3000,
              sortOrder: i,
            },
          });
        }

        processedClips++;
        await updateTaskProgress(taskId, processedClips, totalClips);
      }

      await prisma.episode.update({
        where: { id: episode.id },
        data: { status: "storyboarded" },
      });
    }

    await completeTask(taskId, { totalClips, totalPanels: totalClips });
  } catch (error) {
    await failTask(taskId, error instanceof Error ? error.message : String(error));
  }
}
