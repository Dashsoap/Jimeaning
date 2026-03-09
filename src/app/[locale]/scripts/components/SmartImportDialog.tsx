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

  const handleClose = () => {
    if (splitStream.isStreaming || rewriteStream.isStreaming) return;
    resetAll();
    onClose();
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

      if (name.endsWith(".doc") || name.endsWith(".docx")) {
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
      onClose={isBusy ? () => {} : handleClose}
      title={ti("title")}
      className="max-w-3xl max-h-[85vh] overflow-y-auto"
    >
      <div className="space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
              <span
                className={`px-2 py-1 rounded-full ${
                  step === i + 1
                    ? "bg-blue-100 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : step > i + 1
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "text-gray-400"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {ti("inputText")}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{charCount.toLocaleString()} {ti("chars")}</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    disabled={importing}
                  >
                    <Upload size={12} />
                    {t("importFile")}
                  </button>
                </div>
              </div>
              <textarea
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
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
              <p className="text-xs text-gray-400 mt-1">{ti("fileFormats")}</p>
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {ti("direction")}
              </label>
              <input
                type="text"
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                placeholder={ti("directionPlaceholder")}
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              />
            </div>

            {/* Target Duration */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {ti("targetDuration")}
              </label>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                      targetDuration === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
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
                  className="mt-2 flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                  placeholder={ti("customDurationPlaceholder")}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                />
              )}
            </div>

            {/* Target Episodes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {ti("targetEpisodes")}
              </label>
              <input
                type="number"
                min={1}
                max={500}
                className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                placeholder={ti("targetEpisodesPlaceholder")}
                value={targetEpisodes}
                onChange={(e) => setTargetEpisodes(e.target.value)}
              />
            </div>

            {/* Model selectors */}
            {llmModels.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {ti("analysisModel")}
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {ti("rewriteModel")}
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
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
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 size={16} className="animate-spin" />
              <span>{ti("analyzing")}... {splitStream.progressPercent > 0 ? `${splitStream.progressPercent}%` : ""}</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm whitespace-pre-wrap font-mono dark:bg-gray-800">
              {splitStream.streamedText}
              {splitStream.isStreaming && (
                <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
            {splitStream.progressPercent > 0 && (
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
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
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                <BookOpen size={16} />
                <span>{ti("detectedScript")}</span>
              </div>
            )}

            <div className="flex gap-3" style={{ minHeight: "350px" }}>
              {/* Left: Chapter list */}
              <div className="w-1/3 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {chapters.map((ch, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-1 px-2 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-800 ${
                      selectedChapterIdx === idx
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => setSelectedChapterIdx(idx)}
                  >
                    <GripVertical size={14} className="text-gray-300 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ch.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {ch.content.length.toLocaleString()} {ti("chars")}
                      </div>
                      {ch.summary && (
                        <div className="text-xs text-gray-500 line-clamp-2 mt-0.5">{ch.summary}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMergeChapter(idx); }}
                        className="p-0.5 text-gray-400 hover:text-blue-600 rounded"
                        title={ti("mergeChapter")}
                        disabled={idx >= chapters.length - 1}
                      >
                        <Merge size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSplitChapter(idx); }}
                        className="p-0.5 text-gray-400 hover:text-blue-600 rounded"
                        title={ti("splitChapter")}
                      >
                        <Scissors size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteChapter(idx); }}
                        className="p-0.5 text-gray-400 hover:text-red-600 rounded"
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
              <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                {chapters[selectedChapterIdx] && (
                  <>
                    <input
                      type="text"
                      className="w-full text-sm font-semibold mb-2 bg-transparent border-b border-gray-200 pb-1 focus:outline-none focus:border-blue-500 dark:border-gray-700"
                      value={chapters[selectedChapterIdx].title}
                      onChange={(e) => {
                        setChapters((prev) =>
                          prev.map((ch, i) =>
                            i === selectedChapterIdx ? { ...ch, title: e.target.value } : ch,
                          ),
                        );
                      }}
                    />
                    <div className="text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-72 overflow-y-auto">
                      {chapters[selectedChapterIdx].content.substring(0, 3000)}
                      {chapters[selectedChapterIdx].content.length > 3000 && (
                        <span className="text-gray-400">... ({(chapters[selectedChapterIdx].content.length - 3000).toLocaleString()} {ti("moreChars")})</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {ti("rewriteRequirement")}
                  </label>
                  <textarea
                    className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                    rows={4}
                    placeholder={ti("rewriteRequirementPlaceholder")}
                    value={rewritePrompt}
                    onChange={(e) => setRewritePrompt(e.target.value)}
                  />
                </div>
                <div className="text-sm text-gray-500">
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
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  {rewriteStream.isStreaming ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{ti("rewriting")}... {rewriteStream.progressPercent > 0 ? `${rewriteStream.progressPercent}%` : ""}</span>
                    </>
                  ) : rewriteStream.isComplete ? (
                    <span className="text-green-600">{ti("batchRewriteComplete")}</span>
                  ) : null}
                </div>
                <div
                  ref={rewriteStreamRef}
                  className="max-h-80 overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm whitespace-pre-wrap font-mono dark:bg-gray-800"
                >
                  {rewriteStream.streamedText}
                  {rewriteStream.isStreaming && (
                    <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
                {rewriteStream.progressPercent > 0 && (
                  <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${rewriteStream.progressPercent}%` }}
                    />
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
      </div>
    </Modal>
  );
}
