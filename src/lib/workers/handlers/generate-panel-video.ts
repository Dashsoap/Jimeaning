import { prisma } from "@/lib/prisma";
import { createVideoGenerator } from "@/lib/generators/factory";
import { resolveVideoConfig } from "@/lib/providers/resolve";
import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

export async function handleGeneratePanelVideo(payload: TaskPayload) {
  const { taskId, userId, data } = payload;
  const panelId = data.panelId as string;

  try {
    const panel = await prisma.panel.findUniqueOrThrow({
      where: { id: panelId },
    });

    if (!panel.imageUrl) {
      throw new Error("Panel has no image — generate image first");
    }

    await updateTaskProgress(taskId, 20);

    const { provider, config } = await resolveVideoConfig(userId);
    const generator = createVideoGenerator(provider, config);

    await updateTaskProgress(taskId, 40);

    const result = await generator.generate({
      imageUrl: panel.imageUrl,
      prompt: panel.sceneDescription || undefined,
      durationMs: panel.durationMs,
    });

    const videoUrl = result.url;
    if (videoUrl) {
      await prisma.panel.update({
        where: { id: panelId },
        data: { videoUrl },
      });
    }

    await completeTask(taskId, { panelId, videoUrl, externalId: result.externalId });
  } catch (error) {
    await failTask(taskId, error instanceof Error ? error.message : String(error));
  }
}
