"use client";

import { useState } from "react";
import { X, Camera, Loader2, Copy, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

interface ShotVariant {
  id: number;
  title: string;
  description: string;
  shot_type: string;
  camera_move: string;
  video_prompt: string;
  creative_score: number;
}

interface ShotVariantsPanelProps {
  panelId: string;
  projectId: string;
  onClose: () => void;
  onSelectVariant: (variant: ShotVariant) => void;
}

export function ShotVariantsPanel({
  panelId,
  projectId,
  onClose,
  onSelectVariant,
}: ShotVariantsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<ShotVariant[] | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze-shot-variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "分析失败");
        setLoading(false);
        return;
      }
      const { taskId } = await res.json();
      // Poll for result
      pollForResult(taskId, (suggestions) => {
        setVariants(suggestions);
        setLoading(false);
      }, () => setLoading(false));
    } catch {
      toast.error("提交失败");
      setLoading(false);
    }
  };

  // Auto-start analysis on mount
  if (!loading && !variants) {
    handleAnalyze();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>

        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Camera className="h-4 w-4 text-blue-500" />
          镜头方案分析
        </h3>

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500">AI 正在分析镜头方案...</p>
          </div>
        )}

        {variants && (
          <div className="space-y-3">
            {variants.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-medium">{v.title}</h4>
                  <div className="flex items-center gap-1 shrink-0">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">{v.creative_score}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-2">{v.description}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-2">
                  <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5">
                    {v.shot_type}
                  </span>
                  <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5">
                    {v.camera_move}
                  </span>
                </div>
                <button
                  onClick={() => onSelectVariant(v)}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  生成此变体
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function pollForResult(
  taskId: string,
  onSuccess: (suggestions: ShotVariant[]) => void,
  onError: () => void
) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) { clearInterval(interval); onError(); return; }
      const task = await res.json();
      if (task.status === "completed" && task.result?.suggestions) {
        clearInterval(interval);
        onSuccess(task.result.suggestions);
      } else if (task.status === "failed") {
        clearInterval(interval);
        toast.error(task.error || "分析失败");
        onError();
      }
    } catch {
      clearInterval(interval);
      onError();
    }
  }, 2000);
}
