"use client";

import { useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Ban,
  Square,
} from "lucide-react";

interface TaskProgressPanelProps {
  projectId: string;
}

export function TaskProgressPanel({ projectId }: TaskProgressPanelProps) {
  const { events, clearEvent } = useSSE(projectId);
  const t = useTranslations();

  const handleCancel = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
        if (res.ok) {
          toast.success(t("errors.taskCancelled"));
        } else {
          const data = await res.json();
          toast.error(data.error || t("errors.cancelFailed"));
        }
      } catch {
        toast.error(t("errors.cancelFailed"));
      }
    },
    [t]
  );

  const handleDismiss = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch("/api/tasks/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskIds: [taskId] }),
        });
        if (res.ok) {
          clearEvent(taskId);
        } else {
          toast.error(t("errors.dismissFailed"));
        }
      } catch {
        toast.error(t("errors.dismissFailed"));
      }
    },
    [t, clearEvent]
  );

  if (events.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 space-y-2">
      {events.map((event) => {
        const isCancelled = event.errorCode === "TASK_CANCELLED";
        const isRunning =
          event.status === "running" ||
          (!event.status && event.progress < event.totalSteps);
        const isFailed = event.status === "failed" && !isCancelled;
        const isCompleted = event.status === "completed";

        return (
          <div
            key={event.taskId}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white shadow-lg p-3 animate-in slide-in-from-right"
          >
            <div className="flex items-center gap-2">
              {isRunning && (
                <Loader2 className="h-4 w-4 text-[var(--color-accent)] animate-spin shrink-0" />
              )}
              {isCompleted && (
                <CheckCircle className="h-4 w-4 text-[var(--color-success)] shrink-0" />
              )}
              {isFailed && (
                <AlertCircle className="h-4 w-4 text-[var(--color-danger)] shrink-0" />
              )}
              {isCancelled && (
                <Ban className="h-4 w-4 text-[var(--color-text-tertiary)] shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--color-text)] truncate">
                  {isCancelled
                    ? t("taskStatus.cancelled")
                    : isRunning
                      ? t("taskStatus.running")
                      : isFailed
                        ? event.message || t("taskStatus.failed")
                        : isCompleted
                          ? t("taskStatus.completed")
                          : event.message || event.taskId.slice(0, 12)}
                </p>
                {isRunning && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500"
                        style={{
                          width: `${
                            event.totalSteps > 1
                              ? Math.min((event.progress / event.totalSteps) * 100, 100)
                              : Math.min(event.progress, 100)
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--color-text-tertiary)] shrink-0">
                      {event.totalSteps > 1
                        ? `${event.progress}/${event.totalSteps}`
                        : `${Math.min(event.progress, 100)}%`}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {isRunning && (
                  <button
                    onClick={() => handleCancel(event.taskId)}
                    className="cursor-pointer rounded p-0.5 hover:bg-[var(--color-danger-light)] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
                    title={t("common.cancelTask")}
                  >
                    <Square className="h-3 w-3" />
                  </button>
                )}
                {(isFailed || isCancelled) && (
                  <button
                    onClick={() => handleDismiss(event.taskId)}
                    className="cursor-pointer rounded p-0.5 hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                    title={t("common.dismiss")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                {isCompleted && (
                  <button
                    onClick={() => clearEvent(event.taskId)}
                    className="cursor-pointer rounded p-0.5 hover:bg-[var(--color-bg-secondary)] shrink-0"
                  >
                    <X className="h-3 w-3 text-[var(--color-text-tertiary)]" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
