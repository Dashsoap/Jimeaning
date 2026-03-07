import { UnrecoverableError } from "bullmq";
import { updateTaskProgress, completeTask, failTask, touchTaskHeartbeat, publishTextChunk } from "@/lib/task/service";
import { createScopedLogger } from "@/lib/logging";
import { normalizeAnyError } from "@/lib/errors";
import type { TaskPayload } from "@/lib/task/types";

type TaskHandler = (
  payload: TaskPayload,
  ctx: TaskContext
) => Promise<Record<string, unknown> | void>;

export interface TaskContext {
  reportProgress: (progress: number, totalSteps?: number) => Promise<void>;
  /** Publish a text chunk to SSE consumers (buffered, ~50ms) */
  publishText: (chunk: string) => void;
  /** Flush any remaining buffered text immediately */
  flushText: () => Promise<void>;
}

const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Wraps a worker handler with lifecycle management:
 * - Starts heartbeat timer (10s)
 * - Provides progress reporting via ctx
 * - Classifies errors: retryable → rethrow for BullMQ, non-retryable → UnrecoverableError
 * - On success, marks task as completed with result
 */
export function withTaskLifecycle(handler: TaskHandler) {
  return async (payload: TaskPayload): Promise<void> => {
    const { taskId } = payload;
    const logger = createScopedLogger({
      module: "worker",
      taskId,
      action: payload.type,
    });

    // Start heartbeat
    const heartbeatTimer = setInterval(() => {
      touchTaskHeartbeat(taskId).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // Text chunk buffer (~50ms batching to avoid flooding Redis)
    let textBuffer = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const TEXT_BUFFER_MS = 50;

    const flushText = async () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (textBuffer) {
        const chunk = textBuffer;
        textBuffer = "";
        await publishTextChunk(taskId, chunk, payload.projectId);
      }
    };

    const ctx: TaskContext = {
      reportProgress: (progress: number, totalSteps?: number) =>
        updateTaskProgress(taskId, progress, totalSteps),
      publishText: (chunk: string) => {
        textBuffer += chunk;
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flushText().catch(() => {});
          }, TEXT_BUFFER_MS);
        }
      },
      flushText,
    };

    try {
      const result = await handler(payload, ctx);
      await flushText();
      await completeTask(taskId, result ?? undefined);
    } catch (error) {
      const normalized = normalizeAnyError(error, { context: "worker" });
      const message = error instanceof Error ? error.message : String(error);

      logger.error({
        message: `Task ${taskId} failed: ${message}`,
        errorCode: normalized.code,
        retryable: normalized.retryable,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : undefined,
      });

      await failTask(taskId, message, normalized.code);

      if (normalized.retryable) {
        // Rethrow original error so BullMQ retries
        throw error;
      } else {
        // Non-retryable: tell BullMQ to stop retrying
        throw new UnrecoverableError(message);
      }
    } finally {
      clearInterval(heartbeatTimer);
      if (flushTimer) clearTimeout(flushTimer);
      await flushText().catch(() => {});
    }
  };
}
