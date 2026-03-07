"use client";

import { useState } from "react";
import { X, Wand2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface AiModifyPromptDialogProps {
  panelId: string;
  currentPrompt: string;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AiModifyPromptDialog({
  panelId,
  currentPrompt,
  projectId,
  onClose,
  onSuccess,
}: AiModifyPromptDialogProps) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-modify-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panelId,
          currentPrompt,
          modifyInstruction: instruction.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        setLoading(false);
        return;
      }
      const { taskId } = await res.json();
      toast.success("AI 正在改写提示词...");
      // Poll for completion
      pollUntilDone(taskId, () => {
        toast.success("提示词改写完成");
        onSuccess();
        onClose();
      });
    } catch {
      toast.error("提交失败");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X className="h-4 w-4 text-gray-400" />
        </button>

        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-blue-500" />
          AI 改写提示词
        </h3>

        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">当前提示词</label>
          <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-2 line-clamp-4">
            {currentPrompt || "暂无提示词"}
          </p>
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-500 mb-1 block">修改指令</label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="如：换成俯拍角度，增加暖色调灯光"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !instruction.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            改写
          </button>
        </div>
      </div>
    </div>
  );
}

function pollUntilDone(taskId: string, onDone: () => void) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) { clearInterval(interval); onDone(); return; }
      const task = await res.json();
      if (task.status === "completed") {
        clearInterval(interval);
        onDone();
      } else if (task.status === "failed") {
        clearInterval(interval);
        toast.error(task.error || "改写失败");
      }
    } catch {
      clearInterval(interval);
    }
  }, 2000);
}
