"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTaskTextStream } from "@/hooks/useTaskTextStream";
import {
  Upload,
  FileText,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  Merge,
  Scissors,
  BookOpen,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ─────────────────────────────────────────────────────────────

interface LlmModel {
  modelId: string;
  name: string;
  provider: string;
}

interface Chapter {
  index: number;
  title: string;
  summary: string;
  content: string;
  startPos: number;
  endPos: number;
}

interface SmartImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

// ─── Constants ─────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".doc", ".docx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB for long novels

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

async function readTextFileWithEncoding(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    return utf8;
  }
}

const DURATION_OPTIONS = [
  { value: "1-2min", labelKey: "shortDrama" },
  { value: "3-5min", labelKey: "mediumDrama" },
  { value: "custom", labelKey: "customDuration" },
];

// ─── Component ─────────────────────────────────────────────────────────

export function SmartImportDialog({ open, onClose, onSuccess }: SmartImportDialogProps) {
  const t = useTranslations("scripts");
  const ti = useTranslations("smartImport");
  const tc = useTranslations("common");

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1: Text input
  const [textContent, setTextContent] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Parameters
  const [direction, setDirection] = useState("");
  const [targetDuration, setTargetDuration] = useState("1-2min");
  const [customDuration, setCustomDuration] = useState("");
  const [targetEpisodes, setTargetEpisodes] = useState("");
  const [analysisModelKey, setAnalysisModelKey] = useState("");
  const [rewriteModelKey, setRewriteModelKey] = useState("");
  const [llmModels, setLlmModels] = useState<LlmModel[]>([]);

  // Step 3: Smart split (task-based)
  const [splitTaskId, setSplitTaskId] = useState<string | null>(null);
  const splitStream = useTaskTextStream(splitTaskId);

  // Step 4: Chapter preview
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [contentType, setContentType] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Step 5: Batch rewrite
  const [rewritePrompt, setRewritePrompt] = useState("");
  const [rewriteTaskId, setRewriteTaskId] = useState<string | null>(null);
  const rewriteStream = useTaskTextStream(rewriteTaskId);
  const [masterScriptId, setMasterScriptId] = useState<string | null>(null);
  const rewriteStreamRef = useRef<HTMLDivElement>(null);

  // Fetch LLM models
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
      .catch(() => {});
  }, [open]);

  // When split task completes, extract chapters from result
  useEffect(() => {
    if (splitStream.isComplete && splitStream.taskResult) {
      const result = splitStream.taskResult as {
        contentType?: string;
        chapters?: Chapter[];
      };
      if (result.chapters?.length) {
        setChapters(result.chapters);
        setContentType(result.contentType || "novel");
        setStep(4);
      }
    }
  }, [splitStream.isComplete, splitStream.taskResult]);

  // Handle split failure
  useEffect(() => {
    if (splitStream.isFailed && splitStream.error) {
      toast.error(splitStream.error);
      setSplitTaskId(null);
      setStep(2);
    }
  }, [splitStream.isFailed, splitStream.error]);

  // Auto-scroll rewrite stream
  useEffect(() => {
    if (rewriteStream.isStreaming && rewriteStreamRef.current) {
      rewriteStreamRef.current.scrollTop = rewriteStreamRef.current.scrollHeight;
    }
  }, [rewriteStream.streamedText, rewriteStream.isStreaming]);

  // Handle rewrite completion
  useEffect(() => {
    if (rewriteStream.isComplete) {
      toast.success(ti("batchRewriteComplete"));
    }
  }, [rewriteStream.isComplete, ti]);

  // Handle rewrite failure
  useEffect(() => {
    if (rewriteStream.isFailed && rewriteStream.error) {
      toast.error(rewriteStream.error);
      setRewriteTaskId(null);
    }
  }, [rewriteStream.isFailed, rewriteStream.error]);

  // ─── Handlers ────────────────────────────────────────────────────────

  const resetAll = useCallback(() => {
    setStep(1);
    setTextContent("");
    setImporting(false);
    setDirection("");
    setTargetDuration("1-2min");
    setCustomDuration("");
    setTargetEpisodes("");
    setAnalysisModelKey("");
    setRewriteModelKey("");
    setSplitTaskId(null);
    setChapters([]);
    setSelectedChapterIdx(0);
    setContentType("");
    setSaving(false);
    setRewritePrompt("");
    setRewriteTaskId(null);
    setMasterScriptId(null);
  }, []);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const handleClose = () => {
    if (splitStream.isStreaming || rewriteStream.isStreaming) {
      setShowCloseConfirm(true);
      return;
    }
    resetAll();
    onClose();
  };

  const forceClose = async () => {
    if (splitTaskId) {
      try { await fetch(`/api/tasks/${splitTaskId}`, { method: "DELETE" }); } catch {}
    }
    if (rewriteTaskId) {
      try { await fetch(`/api/tasks/${rewriteTaskId}`, { method: "DELETE" }); } catch {}
    }
    setShowCloseConfirm(false);
    resetAll();
    onClose();
  };

  const handleCancelRewrite = async () => {
    if (rewriteTaskId) {
      try { await fetch(`/api/tasks/${rewriteTaskId}`, { method: "DELETE" }); } catch {}
    }
    setRewriteTaskId(null);
  };

  const handleFileImport = async (file: File) => {
    if (!isAcceptedFile(file)) {
      toast.error(t("unsupportedImportType"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(ti("fileTooLarge"));
      return;
    }

    setImporting(true);
    // Yield to the event loop so the loading state renders before heavy work
    await new Promise((r) => setTimeout(r, 50));

    try {
      let text: string;
      const name = file.name.toLowerCase();

      if (name.endsWith(".doc") && !name.endsWith(".docx")) {
        // Old .doc (OLE binary) — mammoth can't handle it, use server-side parser
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/scripts/parse-doc", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to parse .doc file");
        }
        const data = await res.json();
        text = data.text;
      } else if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        text = await readTextFileWithEncoding(file);
      }

      if (!text.trim()) {
        toast.error(t("fileEmpty"));
        return;
      }
      setTextContent(text);
      toast.success(t("importSuccess"));
    } catch (err) {
      console.error("File import failed:", err);
      toast.error(t("importFailed"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleStartSplit = async () => {
    try {
      const duration = targetDuration === "custom" ? customDuration : targetDuration;
      const res = await fetch("/api/scripts/smart-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: textContent,
          ...(direction ? { direction } : {}),
          ...(duration ? { targetDuration: duration } : {}),
          ...(targetEpisodes ? { targetEpisodes: Number(targetEpisodes) } : {}),
          ...(analysisModelKey ? { analysisModelKey } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tc("error"));
        return;
      }

      setSplitTaskId(data.taskId);
      setStep(3);
    } catch {
      toast.error(tc("error"));
    }
  };

  const handleDeleteChapter = (idx: number) => {
    setChapters((prev) => {
      const next = prev.filter((_, i) => i !== idx).map((ch, i) => ({ ...ch, index: i + 1 }));
      return next;
    });
    if (selectedChapterIdx >= chapters.length - 1) {
      setSelectedChapterIdx(Math.max(0, chapters.length - 2));
    }
  };

  const handleMergeChapter = (idx: number) => {
    if (idx >= chapters.length - 1) return;
    setChapters((prev) => {
      const merged = [...prev];
      const a = merged[idx];
      const b = merged[idx + 1];
      merged[idx] = {
        ...a,
        content: a.content + "\n\n" + b.content,
        endPos: b.endPos,
        summary: a.summary + " " + b.summary,
      };
      merged.splice(idx + 1, 1);
      return merged.map((ch, i) => ({ ...ch, index: i + 1 }));
    });
  };

  const handleSplitChapter = (idx: number) => {
    const ch = chapters[idx];
    const mid = Math.floor(ch.content.length / 2);
    // Find nearest newline to split at
    let splitPos = ch.content.indexOf("\n", mid);
    if (splitPos === -1 || splitPos > mid + 500) {
      splitPos = mid;
    }

    setChapters((prev) => {
      const next = [...prev];
      next.splice(
        idx,
        1,
        {
          ...ch,
          content: ch.content.substring(0, splitPos),
          endPos: ch.startPos + splitPos,
          title: ch.title + " (上)",
          index: idx + 1,
        },
        {
          index: idx + 2,
          title: ch.title + " (下)",
          summary: "",
          content: ch.content.substring(splitPos).trimStart(),
          startPos: ch.startPos + splitPos,
          endPos: ch.endPos,
        },
      );
      return next.map((c, i) => ({ ...c, index: i + 1 }));
    });
  };

  const handleConfirmChapters = async () => {
    if (chapters.length === 0) return;
    setSaving(true);

    try {
      // Create master script
      const masterRes = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${direction || ti("importedNovel")} (${chapters.length} ${ti("chaptersLabel")})`,
          content: textContent,
          sourceType: "import",
          importMeta: {
            targetDuration,
            targetEpisodes: targetEpisodes ? Number(targetEpisodes) : null,
            direction: direction || null,
            contentType,
          },
        }),
      });

      const masterData = await masterRes.json();
      if (!masterRes.ok) {
        toast.error(masterData.error || tc("error"));
        setSaving(false);
        return;
      }

      const scriptId = masterData.id;
      setMasterScriptId(scriptId);

      // Save chapters
      const chaptersRes = await fetch(`/api/scripts/${scriptId}/chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapters: chapters.map((ch) => ({
            title: ch.title,
            content: ch.content,
            summary: ch.summary,
          })),
        }),
      });

      if (!chaptersRes.ok) {
        const errData = await chaptersRes.json();
        toast.error(errData.error || tc("error"));
        setSaving(false);
        return;
      }

      toast.success(ti("chaptersConfirmed"));
      setStep(5);
    } catch {
      toast.error(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  const handleStartRewrite = async () => {
    if (!masterScriptId || !rewritePrompt.trim()) return;

    try {
      const res = await fetch("/api/scripts/batch-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterScriptId,
          rewritePrompt: rewritePrompt.trim(),
          ...(rewriteModelKey ? { modelKey: rewriteModelKey } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tc("error"));
        return;
      }

      setRewriteTaskId(data.taskId);
    } catch {
      toast.error(tc("error"));
    }
  };

  const handleFinish = () => {
    onSuccess();
    handleClose();
  };

  const handleSkipRewrite = () => {
    onSuccess();
    handleClose();
  };

  // ─── Step indicators ─────────────────────────────────────────────────

  const stepLabels = [
    ti("step1"),
    ti("step2"),
    ti("step3"),
    ti("step4"),
    ti("step5"),
  ];

  const isBusy = splitStream.isStreaming || rewriteStream.isStreaming || importing || saving;
  const charCount = textContent.length;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={ti("title")}
      className="max-w-3xl max-h-[85vh] overflow-y-auto"
    >
      <div className="space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-[var(--color-text-tertiary)]" />}
              <span
                className={`px-2 py-1 rounded-full ${
                  step === i + 1
                    ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-medium"
                    : step > i + 1
                      ? "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                      : "text-[var(--color-text-tertiary)]"
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* ─── Step 1: Import Text ──────────────────────────────────── */}
        {step === 1 && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                  {ti("inputText")}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-text-tertiary)]">{charCount.toLocaleString()} {ti("chars")}</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:text-[var(--color-btn-primary-hover)] cursor-pointer"
                    disabled={importing}
                  >
                    <Upload size={12} />
                    {t("importFile")}
                  </button>
                </div>
              </div>
              <textarea
                className="flex w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                rows={12}
                placeholder={ti("textPlaceholder")}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileImport(f);
                }}
              />
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{ti("fileFormats")}</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={charCount < 100}>
                {ti("next")}
              </Button>
            </div>
          </>
        )}

        {/* ─── Step 2: Set Parameters ──────────────────────────────── */}
        {step === 2 && (
          <>
            {/* Direction */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                {ti("direction")}
              </label>
              <input
                type="text"
                className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                placeholder={ti("directionPlaceholder")}
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              />
            </div>

            {/* Target Duration */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                {ti("targetDuration")}
              </label>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`px-3 py-2 rounded-[var(--radius-md)] text-sm border transition-colors cursor-pointer ${
                      targetDuration === opt.value
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                        : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                    }`}
                    onClick={() => setTargetDuration(opt.value)}
                  >
                    {ti(opt.labelKey)}
                  </button>
                ))}
              </div>
              {targetDuration === "custom" && (
                <input
                  type="text"
                  className="mt-2 flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                  placeholder={ti("customDurationPlaceholder")}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                />
              )}
            </div>

            {/* Target Episodes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                {ti("targetEpisodes")}
              </label>
              <input
                type="number"
                min={1}
                max={500}
                className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                placeholder={ti("targetEpisodesPlaceholder")}
                value={targetEpisodes}
                onChange={(e) => setTargetEpisodes(e.target.value)}
              />
            </div>

            {/* Model selectors */}
            {llmModels.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                    {ti("analysisModel")}
                  </label>
                  <select
                    className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    value={analysisModelKey}
                    onChange={(e) => setAnalysisModelKey(e.target.value)}
                  >
                    <option value="">{t("useDefaultModel")}</option>
                    {llmModels.map((m) => (
                      <option key={`a-${m.provider}::${m.modelId}`} value={`${m.provider}::${m.modelId}`}>
                        {m.name || m.modelId}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                    {ti("rewriteModel")}
                  </label>
                  <select
                    className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    value={rewriteModelKey}
                    onChange={(e) => setRewriteModelKey(e.target.value)}
                  >
                    <option value="">{t("useDefaultModel")}</option>
                    {llmModels.map((m) => (
                      <option key={`r-${m.provider}::${m.modelId}`} value={`${m.provider}::${m.modelId}`}>
                        {m.name || m.modelId}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>
                {ti("back")}
              </Button>
              <Button onClick={handleStartSplit}>
                {ti("startAnalysis")}
              </Button>
            </div>
          </>
        )}

        {/* ─── Step 3: Smart Split (streaming) ─────────────────────── */}
        {step === 3 && (
          <>
            <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
              <Loader2 size={16} className="animate-spin" />
              <span>{ti("analyzing")}... {splitStream.progressPercent > 0 ? `${splitStream.progressPercent}%` : ""}</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4 text-sm whitespace-pre-wrap font-mono">
              {splitStream.streamedText}
              {splitStream.isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-[var(--color-accent)] animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
            {splitStream.progressPercent > 0 && (
              <div className="h-1.5 rounded-full bg-[var(--color-bg-surface)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{ width: `${splitStream.progressPercent}%` }}
                />
              </div>
            )}
          </>
        )}

        {/* ─── Step 4: Preview & Adjust Chapters ───────────────────── */}
        {step === 4 && (
          <>
            {/* Script type detection hint */}
            {contentType === "script" && (
              <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-warning-bg)] p-3 text-sm text-[var(--color-warning)]">
                <BookOpen size={16} />
                <span>{ti("detectedScript")}</span>
              </div>
            )}

            <div className="flex gap-3" style={{ minHeight: "350px" }}>
              {/* Left: Chapter list */}
              <div className="w-1/3 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)]">
                {chapters.map((ch, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-1 px-2 py-2 cursor-pointer border-b border-[var(--color-border-light)] ${
                      selectedChapterIdx === idx
                        ? "bg-[var(--color-accent-bg)]"
                        : "hover:bg-[var(--color-bg-secondary)]"
                    }`}
                    onClick={() => setSelectedChapterIdx(idx)}
                  >
                    <GripVertical size={14} className="text-[var(--color-text-tertiary)] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ch.title}</div>
                      <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                        {ch.content.length.toLocaleString()} {ti("chars")}
                      </div>
                      {ch.summary && (
                        <div className="text-xs text-[var(--color-text-secondary)] line-clamp-2 mt-0.5">{ch.summary}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMergeChapter(idx); }}
                        className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] rounded cursor-pointer"
                        title={ti("mergeChapter")}
                        disabled={idx >= chapters.length - 1}
                      >
                        <Merge size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSplitChapter(idx); }}
                        className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] rounded cursor-pointer"
                        title={ti("splitChapter")}
                      >
                        <Scissors size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteChapter(idx); }}
                        className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] rounded cursor-pointer"
                        title={tc("delete")}
                        disabled={chapters.length <= 1}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Content preview */}
              <div className="flex-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
                {chapters[selectedChapterIdx] && (
                  <>
                    <input
                      type="text"
                      className="w-full text-sm font-semibold mb-2 bg-transparent border-b border-[var(--color-border-default)] pb-1 focus:outline-none focus:border-[var(--color-accent)]"
                      value={chapters[selectedChapterIdx].title}
                      onChange={(e) => {
                        setChapters((prev) =>
                          prev.map((ch, i) =>
                            i === selectedChapterIdx ? { ...ch, title: e.target.value } : ch,
                          ),
                        );
                      }}
                    />
                    <div className="text-sm whitespace-pre-wrap text-[var(--color-text-secondary)] max-h-72 overflow-y-auto">
                      {chapters[selectedChapterIdx].content.substring(0, 3000)}
                      {chapters[selectedChapterIdx].content.length > 3000 && (
                        <span className="text-[var(--color-text-tertiary)]">... ({(chapters[selectedChapterIdx].content.length - 3000).toLocaleString()} {ti("moreChars")})</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                {ti("chapterCount", { count: chapters.length })}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setSplitTaskId(null); setStep(2); }}>
                  {ti("back")}
                </Button>
                <Button onClick={handleConfirmChapters} disabled={saving || chapters.length === 0}>
                  {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : null}
                  {ti("confirmChapters")}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ─── Step 5: Batch Rewrite ───────────────────────────────── */}
        {step === 5 && (
          <>
            {!rewriteTaskId ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                    {ti("rewriteRequirement")}
                  </label>
                  <textarea
                    className="flex w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                    rows={4}
                    placeholder={ti("rewriteRequirementPlaceholder")}
                    value={rewritePrompt}
                    onChange={(e) => setRewritePrompt(e.target.value)}
                  />
                </div>
                <div className="text-sm text-[var(--color-text-secondary)]">
                  {ti("rewriteHint", { count: chapters.length })}
                </div>
                <div className="flex justify-between">
                  <Button variant="secondary" onClick={handleSkipRewrite}>
                    {ti("skipRewrite")}
                  </Button>
                  <Button onClick={handleStartRewrite} disabled={!rewritePrompt.trim()}>
                    {ti("startRewrite")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
                  {rewriteStream.isStreaming ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{ti("rewriting")}... {rewriteStream.progressPercent > 0 ? `${rewriteStream.progressPercent}%` : ""}</span>
                    </>
                  ) : rewriteStream.isComplete ? (
                    <span className="text-[var(--color-success)]">{ti("batchRewriteComplete")}</span>
                  ) : null}
                </div>
                <div
                  ref={rewriteStreamRef}
                  className="max-h-80 overflow-y-auto rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4 text-sm whitespace-pre-wrap font-mono"
                >
                  {rewriteStream.streamedText}
                  {rewriteStream.isStreaming && (
                    <span className="inline-block w-0.5 h-4 bg-[var(--color-accent)] animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
                {rewriteStream.progressPercent > 0 && (
                  <div className="h-1.5 rounded-full bg-[var(--color-bg-surface)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                      style={{ width: `${rewriteStream.progressPercent}%` }}
                    />
                  </div>
                )}
                {rewriteStream.isStreaming && (
                  <div className="flex justify-start">
                    <Button variant="secondary" onClick={handleCancelRewrite}>
                      {tc("cancel")}
                    </Button>
                  </div>
                )}
                {rewriteStream.isComplete && (
                  <div className="flex justify-end">
                    <Button onClick={handleFinish}>{ti("finish")}</Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {/* Close confirmation */}
        {showCloseConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-[var(--radius-lg)] p-6 shadow-xl max-w-sm mx-4">
              <p className="text-sm text-[var(--color-text-primary)] mb-4">
                {ti("cancelConfirm") || "取消当前任务并关闭？"}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowCloseConfirm(false)}>
                  {tc("cancel")}
                </Button>
                <Button onClick={forceClose}>
                  {tc("confirm") || "确认"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
