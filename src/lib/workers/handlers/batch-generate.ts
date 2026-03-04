import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

/**
 * Batch generate an entire episode:
 * 1. Generate storyboard text for all clips
 * 2. Generate images for all panels
 * 3. Generate videos for all panels
 * 4. Generate voice lines
 * 5. Compose final video
 */
export async function handleBatchGenerate(payload: TaskPayload) {
  const { taskId, userId, projectId, data } = payload;
  const episodeId = data.episodeId as string;

  try {
    // Step 1: Generate storyboard
    await updateTaskProgress(taskId, 5);
    const storyboardTaskId = await createTask({
      userId,
      projectId,
      type: TaskType.GENERATE_STORYBOARD,
      data: {},
    });
    await waitForTask(storyboardTaskId);

    // Step 2: Generate images for all panels
    await updateTaskProgress(taskId, 20);
    const panels = await prisma.panel.findMany({
      where: {
        clip: { episode: { id: episodeId } },
        imageUrl: null,
      },
      select: { id: true },
    });

    const imageTaskIds: string[] = [];
    for (const panel of panels) {
      const tid = await createTask({
        userId,
        projectId,
        type: TaskType.GENERATE_PANEL_IMAGE,
        data: { panelId: panel.id },
      });
      imageTaskIds.push(tid);
    }
    await waitForTasks(imageTaskIds);

    // Step 3: Generate videos for all panels
    await updateTaskProgress(taskId, 50);
    const panelsWithImages = await prisma.panel.findMany({
      where: {
        clip: { episode: { id: episodeId } },
        imageUrl: { not: null },
        videoUrl: null,
      },
      select: { id: true },
    });

    const videoTaskIds: string[] = [];
    for (const panel of panelsWithImages) {
      const tid = await createTask({
        userId,
        projectId,
        type: TaskType.GENERATE_PANEL_VIDEO,
        data: { panelId: panel.id },
      });
      videoTaskIds.push(tid);
    }
    await waitForTasks(videoTaskIds);

    // Step 4: Generate voice lines
    await updateTaskProgress(taskId, 70);
    const voiceLines = await prisma.voiceLine.findMany({
      where: {
        panel: { clip: { episode: { id: episodeId } } },
        audioUrl: null,
      },
      select: { id: true },
    });

    const voiceTaskIds: string[] = [];
    for (const vl of voiceLines) {
      const tid = await createTask({
        userId,
        projectId,
        type: TaskType.GENERATE_VOICE_LINE,
        data: { voiceLineId: vl.id },
      });
      voiceTaskIds.push(tid);
    }
    await waitForTasks(voiceTaskIds);

    // Step 5: Compose video
    await updateTaskProgress(taskId, 85);
    const composeTaskId = await createTask({
      userId,
      projectId,
      type: TaskType.COMPOSE_VIDEO,
      data: { episodeId },
    });
    await waitForTask(composeTaskId);

    await completeTask(taskId, { episodeId });
  } catch (error) {
    await failTask(taskId, error instanceof Error ? error.message : String(error));
  }
}

async function waitForTask(taskId: string, timeoutMs = 600000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { status: true, error: true },
    });

    if (task?.status === "completed") return;
    if (task?.status === "failed") {
      throw new Error(`Task ${taskId} failed: ${task.error}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Task ${taskId} timed out`);
}

async function waitForTasks(taskIds: string[]): Promise<void> {
  await Promise.all(taskIds.map((id) => waitForTask(id)));
}
