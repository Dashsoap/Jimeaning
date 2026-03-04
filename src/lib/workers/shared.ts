import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

type TaskHandler = (
  payload: TaskPayload,
  ctx: TaskContext
) => Promise<Record<string, unknown> | void>;

export interface TaskContext {
  reportProgress: (progress: number, totalSteps?: number) => Promise<void>;
}

/**
 * Wraps a worker handler with lifecycle management:
 * - Marks task as running
 * - Provides progress reporting via ctx
 * - Catches errors and marks task as failed
 * - On success, marks task as completed with result
 */
export function withTaskLifecycle(handler: TaskHandler) {
  return async (payload: TaskPayload): Promise<void> => {
    const { taskId } = payload;

    const ctx: TaskContext = {
      reportProgress: (progress: number, totalSteps?: number) =>
        updateTaskProgress(taskId, progress, totalSteps),
    };

    try {
      const result = await handler(payload, ctx);
      await completeTask(taskId, result ?? undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Task ${taskId} failed:`, message);
      await failTask(taskId, message);
    }
  };
}
