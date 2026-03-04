"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface TaskStatus {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  totalSteps: number;
  error?: string;
  result?: Record<string, unknown>;
}

interface UseTaskPollingOptions {
  interval?: number;
  onComplete?: (task: TaskStatus) => void;
  onFailed?: (error: string) => void;
  onProgress?: (progress: number, totalSteps: number) => void;
}

export function useTaskPolling(
  taskId: string | null,
  options: UseTaskPollingOptions = {}
) {
  const { interval = 2000, onComplete, onFailed, onProgress } = options;
  const [task, setTask] = useState<TaskStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbacksRef = useRef({ onComplete, onFailed, onProgress });

  // Keep callbacks fresh without restarting polling
  useEffect(() => {
    callbacksRef.current = { onComplete, onFailed, onProgress };
  }, [onComplete, onFailed, onProgress]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPolling(false);
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/tasks/${id}`);
        if (!res.ok) return;
        const data: TaskStatus = await res.json();
        setTask(data);

        callbacksRef.current.onProgress?.(data.progress, data.totalSteps);

        if (data.status === "completed") {
          stopPolling();
          callbacksRef.current.onComplete?.(data);
        } else if (data.status === "failed") {
          stopPolling();
          callbacksRef.current.onFailed?.(data.error || "Unknown error");
        }
      } catch {
        // Network error, keep polling
      }
    },
    [stopPolling]
  );

  // Start/stop polling when taskId changes
  useEffect(() => {
    stopPolling();
    setTask(null);

    if (!taskId) return;

    setPolling(true);
    // Poll immediately
    poll(taskId);
    // Then poll on interval
    intervalRef.current = setInterval(() => poll(taskId), interval);

    return stopPolling;
  }, [taskId, interval, poll, stopPolling]);

  const progressPercent =
    task && task.totalSteps > 0
      ? Math.round((task.progress / task.totalSteps) * 100)
      : 0;

  return {
    task,
    polling,
    progressPercent,
    isRunning: task?.status === "running" || task?.status === "pending",
    isCompleted: task?.status === "completed",
    isFailed: task?.status === "failed",
    stopPolling,
  };
}
