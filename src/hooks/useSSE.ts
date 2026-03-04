"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TaskProgress } from "@/lib/task/types";

/**
 * SSE hook for real-time task updates.
 * Connects to /api/tasks/sse, maintains a map of task progress by taskId.
 * Auto-reconnects on connection failure.
 */
export function useSSE(projectId?: string) {
  const [events, setEvents] = useState<TaskProgress[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    eventSourceRef.current?.close();

    const url = projectId
      ? `/api/tasks/sse?projectId=${projectId}`
      : "/api/tasks/sse";

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TaskProgress;
        setEvents((prev) => {
          const idx = prev.findIndex((e) => e.taskId === data.taskId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data;
            return next;
          }
          return [...prev, data];
        });
      } catch {
        // skip malformed messages
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 5s
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          connect();
        }
      }, 5000);
    };
  }, [projectId]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [connect]);

  const clearEvent = useCallback((taskId: string) => {
    setEvents((prev) => prev.filter((e) => e.taskId !== taskId));
  }, []);

  return { events, connected, clearEvent };
}
