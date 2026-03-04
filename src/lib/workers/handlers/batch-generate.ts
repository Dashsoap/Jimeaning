import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

/**
 * Batch generate an entire episode:
 * 1. Generate storyboard text for all clips
 * 2. Generate images for all panels
 * 3. Generate videos for all panels
 * 4. Generate voice lines
 * 5. Compose final video
 */
export const handleBatchGenerate = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId, data } = payload;
  const episodeId = data.episodeId as string;

  // Step 1: Generate storyboard
  await ctx.reportProgress(5);
  const storyboardTaskId = await createTask({
    userId,
    projectId,
    type: TaskType.GENERATE_STORYBOARD,
    data: {},
  });
  await waitForTask(storyboardTaskId);

  // Step 2: Generate images for all panels
  await ctx.reportProgress(20);
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
  await ctx.reportProgress(50);
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
  await ctx.reportProgress(70);
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
  await ctx.reportProgress(85);
  const composeTaskId = await createTask({
    userId,
    projectId,
    type: TaskType.COMPOSE_VIDEO,
    data: { episodeId },
  });
  await waitForTask(composeTaskId);

  return { episodeId };
});

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
