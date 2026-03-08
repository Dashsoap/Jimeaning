"use client";

import { Loader2, CheckCircle, AlertCircle, Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  resolveTaskPresentationState,
  type PresentationState,
} from "@/lib/task/presentation";
import type { TaskProgress } from "@/lib/task/types";

interface TaskStatusInlineProps {
  task: Pick<TaskProgress, "status" | "progress" | "totalSteps" | "message"> & {
    errorCode?: string | null;
  };
  className?: string;
}

const stateIcons: Record<PresentationState, React.ReactNode> = {
  idle: null,
  pending: <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <AlertCircle className="h-4 w-4 text-red-500" />,
  cancelled: <Ban className="h-4 w-4 text-gray-400" />,
};

export function TaskStatusInline({ task, className = "" }: TaskStatusInlineProps) {
  const t = useTranslations();
  const presentation = resolveTaskPresentationState(task);

  if (presentation.state === "idle") return null;

  const percent =
    presentation.totalSteps > 1
      ? Math.min(Math.round((presentation.progress / presentation.totalSteps) * 100), 100)
      : Math.min(presentation.progress, 100);

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      {stateIcons[presentation.state]}
      <span className="text-gray-600 dark:text-gray-400">
        {t(presentation.labelKey)}
      </span>
      {presentation.state === "running" && (
        <>
          <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">{percent}%</span>
        </>
      )}
      {presentation.state === "failed" && presentation.errorMessage && (
        <span className="text-xs text-red-500 truncate max-w-[200px]">
          {presentation.errorMessage}
        </span>
      )}
    </div>
  );
}
