"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TaskProgress } from "@/lib/task/types";

export function useSSE(projectId?: string) {
  const [events, setEvents] = useState<TaskProgress[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    const url = projectId
      ? `/api/tasks/sse?projectId=${projectId}`
      : "/api/tasks/sse";

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TaskProgress;
        setEvents((prev) => {
          // Replace existing task progress or add new
          const idx = prev.findIndex((e) => e.taskId === data.taskId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data;
            return next;
          }
          return [...prev, data];
        });
      } catch {
        // skip
      }
    };

    es.onerror = () => {
      es.close();
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };
  }, [projectId]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  const clearEvent = useCallback((taskId: string) => {
    setEvents((prev) => prev.filter((e) => e.taskId !== taskId));
  }, []);

  return { events, clearEvent };
}
