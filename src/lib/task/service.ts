import { prisma } from "@/lib/prisma";
import { getQueueByType } from "./queues";
import { publishTaskProgress } from "./publisher";
import type { TaskType, TaskPayload } from "./types";

export async function createTask(params: {
  userId: string;
  projectId?: string;
  type: TaskType;
  data: Record<string, unknown>;
  totalSteps?: number;
}): Promise<string> {
  const task = await prisma.task.create({
    data: {
      userId: params.userId,
      projectId: params.projectId,
      type: params.type,
      status: "pending",
      payload: params.data as object,
      totalSteps: params.totalSteps ?? 1,
    },
  });

  const queue = getQueueByType(params.type);
  const job = await queue.add(params.type, {
    taskId: task.id,
    userId: params.userId,
    projectId: params.projectId,
    type: params.type,
    data: params.data,
  } satisfies TaskPayload);

  await prisma.task.update({
    where: { id: task.id },
    data: { bullJobId: job.id, status: "running" },
  });

  return task.id;
}

export async function updateTaskProgress(
  taskId: string,
  progress: number,
  totalSteps?: number
) {
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { progress, ...(totalSteps !== undefined && { totalSteps }) },
  });

  await publishTaskProgress({
    taskId,
    projectId: task.projectId ?? undefined,
    progress,
    totalSteps: task.totalSteps,
    status: "running",
  });
}

export async function completeTask(
  taskId: string,
  result?: Record<string, unknown>
) {
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "completed",
      result: (result ?? undefined) as object | undefined,
      progress: 100,
      completedAt: new Date(),
    },
  });

  await publishTaskProgress({
    taskId,
    projectId: task.projectId ?? undefined,
    progress: task.totalSteps,
    totalSteps: task.totalSteps,
    status: "completed",
  });
}

export async function failTask(taskId: string, error: string) {
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "failed", error },
  });

  const task = await prisma.task.findUnique({ where: { id: taskId } });

  await publishTaskProgress({
    taskId,
    projectId: task?.projectId ?? undefined,
    progress: task?.progress ?? 0,
    totalSteps: task?.totalSteps ?? 1,
    status: "failed",
    message: error,
  });
}
