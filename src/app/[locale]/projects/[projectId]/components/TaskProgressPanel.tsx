"use client";

import { useSSE } from "@/hooks/useSSE";
import { Loader2, CheckCircle, AlertCircle, X } from "lucide-react";

interface TaskProgressPanelProps {
  projectId: string;
}

export function TaskProgressPanel({ projectId }: TaskProgressPanelProps) {
  const { events, clearEvent } = useSSE(projectId);

  if (events.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 space-y-2">
      {events.map((event) => (
        <div
          key={event.taskId}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 animate-in slide-in-from-right"
        >
          <div className="flex items-center gap-2">
            {event.status === "running" && (
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
            )}
            {event.status === "completed" && (
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            )}
            {event.status === "failed" && (
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                {event.message || event.taskId.slice(0, 12)}
              </p>
              {event.status === "running" && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{
                        width: `${
                          event.totalSteps > 0
                            ? (event.progress / event.totalSteps) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {event.progress}/{event.totalSteps}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => clearEvent(event.taskId)}
              className="rounded p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
            >
              <X className="h-3 w-3 text-gray-400" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
