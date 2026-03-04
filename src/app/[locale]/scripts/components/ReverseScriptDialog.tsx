"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { Upload, FileVideo, FileAudio, Image as ImageIcon, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface ReverseScriptDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ACCEPTED_TYPES = [
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
  "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/flac",
  "image/jpeg", "image/png", "image/gif", "image/webp",
];

export function ReverseScriptDialog({ open, onClose, onSuccess }: ReverseScriptDialogProps) {
  const t = useTranslations("scripts");
  const tc = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { polling, progressPercent, isRunning } = useTaskPolling(taskId, {
    onComplete: () => {
      toast.success(t("reverseSuccess"));
      resetAndClose();
      onSuccess();
    },
    onFailed: (error) => {
      toast.error(error);
      setTaskId(null);
    },
  });

  const resetAndClose = () => {
    setFile(null);
    setCustomPrompt("");
    setTaskId(null);
    setUploading(false);
    onClose();
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      toast.error(t("unsupportedFileType"));
      return;
    }
    if (selectedFile.size > 500 * 1024 * 1024) {
      toast.error(t("fileTooLarge"));
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
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (customPrompt.trim()) {
        formData.append("customPrompt", customPrompt.trim());
      }

      const res = await fetch("/api/scripts/reverse", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tc("error"));
        setUploading(false);
        return;
      }

      setTaskId(data.taskId);
    } catch {
      toast.error(tc("error"));
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = () => {
    if (!file) return null;
    if (file.type.startsWith("video/")) return <FileVideo size={40} className="text-blue-500" />;
    if (file.type.startsWith("audio/")) return <FileAudio size={40} className="text-green-500" />;
    return <ImageIcon size={40} className="text-purple-500" />;
  };

  const isBusy = uploading || polling || isRunning;

  return (
    <Modal open={open} onClose={isBusy ? () => {} : resetAndClose} title={t("reverseScript")} className="max-w-xl">
      <div className="space-y-4">
        {/* File upload area */}
        {!file ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors dark:border-gray-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/10"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload size={36} className="text-gray-400 mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">{t("uploadHint")}</p>
            <p className="text-xs text-gray-400 mt-1">{t("supportedFormats")}</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            {getFileIcon()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-gray-400">
                {(file.size / 1024 / 1024).toFixed(1)} MB
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

        {/* Custom prompt (optional) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("customPrompt")}
          </label>
          <textarea
            className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            rows={2}
            placeholder={t("customPromptPlaceholder")}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            disabled={isBusy}
          />
        </div>

        {/* Progress */}
        {(polling || isRunning) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 size={16} className="animate-spin" />
              <span>{t("analyzing")}... {progressPercent}%</span>
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
          <Button onClick={handleSubmit} disabled={!file || isBusy}>
            {uploading ? t("uploading") : t("startReverse")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
