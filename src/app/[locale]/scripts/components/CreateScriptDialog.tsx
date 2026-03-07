"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Upload, FileText, X } from "lucide-react";
import toast from "react-hot-toast";

interface CreateScriptDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; content: string }) => void;
  isPending: boolean;
}

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".srt", ".docx"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Read a text file, trying UTF-8 first.
 * If UTF-8 produces replacement characters (U+FFFD), retry with GBK.
 */
async function readTextFileWithEncoding(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  // Try UTF-8
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  // If no replacement chars, it's valid UTF-8
  if (!utf8.includes("\uFFFD")) return utf8;

  // Fall back to GBK (covers GB2312, GB18030 subset)
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    // GBK decoder not available, return UTF-8 result as-is
    return utf8;
  }
}

function countParagraphs(text: string): number {
  if (!text.trim()) return 0;
  return text.split(/\n\s*\n/).filter((p) => p.trim()).length;
}

export function CreateScriptDialog({ open, onClose, onSubmit, isPending }: CreateScriptDialogProps) {
  const t = useTranslations("scripts");
  const tc = useTranslations("common");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAndClose = () => {
    setTitle("");
    setContent("");
    setImporting(false);
    onClose();
  };

  const handleImportFile = useCallback(async (file: File) => {
    if (!isAcceptedFile(file)) {
      toast.error(t("unsupportedImportType"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("importFileTooLarge"));
      return;
    }

    setImporting(true);
    try {
      let text: string;
      const name = file.name.toLowerCase();

      if (name.endsWith(".docx")) {
        // Parse Word document using mammoth
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        // Plain text files: TXT, MD, SRT
        // Try UTF-8 first, fall back to GBK for Chinese text files
        text = await readTextFileWithEncoding(file);
      }

      if (!text.trim()) {
        toast.error(t("fileEmpty"));
        return;
      }

      setContent(text);

      // Auto-fill title from filename if title is empty
      if (!title.trim()) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        setTitle(baseName);
      }

      toast.success(t("importSuccess"));
    } catch (err) {
      console.error("Import failed:", err);
      toast.error(t("importFailed"));
    } finally {
      setImporting(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [t, title]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  }, [handleImportFile]);

  const charCount = content.length;
  const paraCount = countParagraphs(content);

  return (
    <Modal open={open} onClose={isPending ? () => {} : resetAndClose} title={t("createScript")} className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ title, content });
        }}
        className="space-y-4"
      >
        <Input
          id="title"
          label={t("scriptTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("scriptContent")}
            </label>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors dark:text-blue-400 dark:hover:bg-blue-900/20"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title={t("importFileHint")}
            >
              <Upload size={13} />
              {importing ? tc("loading") : t("importFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.srt,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
              }}
            />
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <textarea
              id="content"
              className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("contentPlaceholder")}
              required
            />
          </div>

          {/* Stats bar */}
          <div className="flex items-center justify-between mt-1.5 text-xs text-gray-400">
            <span>{t("importFileHint")}</span>
            <div className="flex gap-3">
              <span>{t("charCount", { count: charCount })}</span>
              <span>{t("paragraphCount", { count: paraCount })}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={resetAndClose} disabled={isPending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={isPending || importing}>
            {tc("create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
