"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { TaskProgress } from "@/lib/task/types";

interface TaskResult {
  scriptId?: string;
  title?: string;
  [key: string]: unknown;
}

interface UseTaskTextStreamReturn {
  streamedText: string;
  isStreaming: boolean;
  isComplete: boolean;
  isFailed: boolean;
  error: string | null;
  taskResult: TaskResult | null;
  progressPercent: number;
}

/**
 * Hook that consumes SSE text chunks for a specific task.
 * Accumulates textChunk fields into a growing string and detects completion.
 * Falls back to polling if SSE connection drops.
 */
export function useTaskTextStream(taskId: string | null): UseTaskTextStreamReturn {
  const [streamedText, setStreamedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const taskIdRef = useRef(taskId);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  // Reset when taskId changes
  useEffect(() => {
    if (taskId !== taskIdRef.current) {
      taskIdRef.current = taskId;
      doneRef.current = false;
      setStreamedText("");
      setIsComplete(false);
      setIsFailed(false);
      setError(null);
      setTaskResult(null);
      setProgressPercent(0);
    }
  }, [taskId]);

  // Fetch task result when completed
  const fetchResult = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTaskResult(data.result ?? null);
      }
    } catch {
      // ignore fetch errors
    }
  }, []);

  // Mark task as done (completed or failed) — stop all connections
  const markDone = useCallback((status: "completed" | "failed", id: string, msg?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (status === "completed") {
      setIsComplete(true);
      fetchResult(id);
    } else {
      setIsFailed(true);
      setError(msg || "Unknown error");
    }
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [fetchResult]);

  // Polling fallback — check task status via REST
  const startPolling = useCallback((id: string) => {
    if (pollTimerRef.current) return; // already polling
    pollTimerRef.current = setInterval(async () => {
      if (doneRef.current || taskIdRef.current !== id) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        return;
      }
      try {
        const res = await fetch(`/api/tasks/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.totalSteps > 0) {
          setProgressPercent(Math.round((data.progress / data.totalSteps) * 100));
        }
        if (data.status === "completed") {
          markDone("completed", id);
        } else if (data.status === "failed") {
          markDone("failed", id, data.error || data.errorCode);
        }
      } catch {
        // ignore, will retry next interval
      }
    }, 3000);
  }, [markDone]);

  // SSE connection
  useEffect(() => {
    if (!taskId) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const id = taskId;
    const es = new EventSource("/api/tasks/sse");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TaskProgress;
        if (data.taskId !== id) return;

        // Accumulate text chunks
        if (data.textChunk) {
          setStreamedText((prev) => prev + data.textChunk);
        }

        // Update progress
        if (data.totalSteps > 0) {
          setProgressPercent(Math.round((data.progress / data.totalSteps) * 100));
        }

        if (data.status === "completed") {
          markDone("completed", id);
        } else if (data.status === "failed") {
          markDone("failed", id, data.message);
        }
      } catch {
        // skip malformed
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      // Fall back to polling if task is still active
      if (!doneRef.current && taskIdRef.current === id) {
        startPolling(id);
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [taskId, fetchResult, markDone, startPolling]);

  const isStreaming = !!taskId && !isComplete && !isFailed;

  return {
    streamedText,
    isStreaming,
    isComplete,
    isFailed,
    error,
    taskResult,
    progressPercent,
  };
}
