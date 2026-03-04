"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Script {
  id: string;
  title: string;
  content: string;
}

interface RewriteScriptDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  scripts: Script[];
  preSelectedId?: string;
}

export function RewriteScriptDialog({
  open,
  onClose,
  onSuccess,
  scripts,
  preSelectedId,
}: RewriteScriptDialogProps) {
  const t = useTranslations("scripts");
  const tc = useTranslations("common");
  const [selectedId, setSelectedId] = useState(preSelectedId || "");
  const [prompt, setPrompt] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { polling, progressPercent, isRunning } = useTaskPolling(taskId, {
    onComplete: () => {
      toast.success(t("rewriteSuccess"));
      resetAndClose();
      onSuccess();
    },
    onFailed: (error) => {
      toast.error(error);
      setTaskId(null);
    },
  });

  const resetAndClose = () => {
    setSelectedId("");
    setPrompt("");
    setTaskId(null);
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedId || !prompt.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/scripts/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: selectedId, prompt: prompt.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tc("error"));
        setSubmitting(false);
        return;
      }

      setTaskId(data.taskId);
    } catch {
      toast.error(tc("error"));
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = submitting || polling || isRunning;

  // Update selectedId when preSelectedId changes
  if (preSelectedId && preSelectedId !== selectedId && !isBusy) {
    setSelectedId(preSelectedId);
  }

  return (
    <Modal open={open} onClose={isBusy ? () => {} : resetAndClose} title={t("rewriteScript")} className="max-w-xl">
      <div className="space-y-4">
        {/* Script selection */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("selectScript")}
          </label>
          <select
            className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={isBusy}
          >
            <option value="">{t("selectScriptPlaceholder")}</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Rewrite prompt */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("rewritePrompt")}
          </label>
          <textarea
            className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            rows={4}
            placeholder={t("rewritePromptPlaceholder")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isBusy}
          />
        </div>

        {/* Progress */}
        {(polling || isRunning) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 size={16} className="animate-spin" />
              <span>{t("rewriting")}... {progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={resetAndClose} disabled={isBusy}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedId || !prompt.trim() || isBusy}>
            {t("startRewrite")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
