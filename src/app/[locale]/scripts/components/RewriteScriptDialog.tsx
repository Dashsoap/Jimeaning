"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Script {
  id: string;
  title: string;
  content: string;
}

interface LlmModel {
  modelId: string;
  name: string;
  provider: string;
}

interface RewriteScriptDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  scripts: Script[];
  preSelectedId?: string;
}

type SourceTab = "library" | "upload";

const ACCEPTED_TEXT_EXTENSIONS = ".txt,.md,.srt";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function isAcceptedTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".srt");
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
  const [sourceTab, setSourceTab] = useState<SourceTab>("library");
  const [selectedId, setSelectedId] = useState(preSelectedId || "");
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [llmModels, setLlmModels] = useState<LlmModel[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available LLM models
  useEffect(() => {
    if (!open) return;
    fetch("/api/user/api-config")
      .then((res) => res.json())
      .then((data) => {
        const models = (data.models || []).filter(
          (m: { type: string; enabled: boolean }) => m.type === "llm" && m.enabled,
        );
        setLlmModels(models);
      })
      .catch(() => {
        // Silently fail — user can still use default model
      });
  }, [open]);

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
    setFile(null);
    setPrompt("");
    setModelKey("");
    setTaskId(null);
    setSubmitting(false);
    setSourceTab("library");
    onClose();
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!isAcceptedTextFile(selectedFile)) {
      toast.error(t("unsupportedTextType"));
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error(t("textFileTooLarge"));
      return;
    }
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    const isLibrary = sourceTab === "library";
    if (isLibrary && !selectedId) return;
    if (!isLibrary && !file) return;

    setSubmitting(true);
    try {
      let res: Response;

      if (isLibrary) {
        // Use JSON for library selection (avoids proxy Content-Type issues)
        res = await fetch("/api/scripts/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scriptId: selectedId,
            prompt: prompt.trim(),
            ...(modelKey ? { modelKey } : {}),
          }),
        });
      } else {
        // Use FormData for file upload
        const formData = new FormData();
        formData.append("prompt", prompt.trim());
        formData.append("file", file!);
        if (modelKey) formData.append("modelKey", modelKey);
        res = await fetch("/api/scripts/rewrite", {
          method: "POST",
          body: formData,
        });
      }

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
    setSourceTab("library");
  }

  const canSubmit =
    prompt.trim() &&
    ((sourceTab === "library" && selectedId) || (sourceTab === "upload" && file)) &&
    !isBusy;

  return (
    <Modal open={open} onClose={isBusy ? () => {} : resetAndClose} title={t("rewriteScript")} className="max-w-xl">
      <div className="space-y-4">
        {/* Source tabs */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              sourceTab === "library"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
            onClick={() => setSourceTab("library")}
            disabled={isBusy}
          >
            {t("selectFromLibrary")}
          </button>
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
              sourceTab === "upload"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
            onClick={() => setSourceTab("upload")}
            disabled={isBusy}
          >
            {t("uploadFile")}
          </button>
        </div>

        {/* Source content */}
        {sourceTab === "library" ? (
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
        ) : (
          <div>
            {!file ? (
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors dark:border-gray-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/10"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <Upload size={36} className="text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-400">{t("uploadTextHint")}</p>
                <p className="text-xs text-gray-400 mt-1">{t("supportedTextFormats")}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={ACCEPTED_TEXT_EXTENSIONS}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <FileText size={40} className="text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                {!isBusy && (
                  <button
                    onClick={() => setFile(null)}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Model selection */}
        {llmModels.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("selectModel")}
            </label>
            <select
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              value={modelKey}
              onChange={(e) => setModelKey(e.target.value)}
              disabled={isBusy}
            >
              <option value="">{t("useDefaultModel")}</option>
              {llmModels.map((m) => (
                <option key={`${m.provider}::${m.modelId}`} value={`${m.provider}::${m.modelId}`}>
                  {m.name || m.modelId}
                </option>
              ))}
            </select>
          </div>
        )}

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
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {t("startRewrite")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
