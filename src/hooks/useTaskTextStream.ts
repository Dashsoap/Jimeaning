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

  // Reset when taskId changes
  useEffect(() => {
    if (taskId !== taskIdRef.current) {
      taskIdRef.current = taskId;
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

  useEffect(() => {
    if (!taskId) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const es = new EventSource("/api/tasks/sse");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TaskProgress;
        if (data.taskId !== taskId) return;

        // Accumulate text chunks
        if (data.textChunk) {
          setStreamedText((prev) => prev + data.textChunk);
        }

        // Update progress
        if (data.totalSteps > 0) {
          setProgressPercent(Math.round((data.progress / data.totalSteps) * 100));
        }

        if (data.status === "completed") {
          setIsComplete(true);
          fetchResult(taskId);
          es.close();
        } else if (data.status === "failed") {
          setIsFailed(true);
          setError(data.message || "Unknown error");
          es.close();
        }
      } catch {
        // skip malformed
      }
    };

    es.onerror = () => {
      // Reconnect after 3s if still active
      es.close();
      setTimeout(() => {
        if (taskIdRef.current === taskId && !eventSourceRef.current) {
          // Don't reconnect if already complete/failed
        }
      }, 3000);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [taskId, fetchResult]);

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
