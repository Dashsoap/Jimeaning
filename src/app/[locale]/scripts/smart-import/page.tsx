"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTaskTextStream } from "@/hooks/useTaskTextStream";
import {
  Upload,
  Loader2,
  ChevronRight,
  BookOpen,
  ArrowLeft,
  Check,
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

type Step = 1 | 2 | 3 | 4 | 5;

// ─── Session persistence (survives locale switch) ──────────────────────

const SESSION_KEY = "smart-import-state";

interface PersistedState {
  step: Step;
  textContent: string;
  direction: string;
  targetDuration: string;
  customDuration: string;
  targetEpisodes: string;
  analysisModelKey: string;
  rewriteModelKey: string;
  splitTaskId: string | null;
  rewriteTaskId: string | null;
  masterScriptId: string | null;
  chapters: Chapter[];
  contentType: string;
  rewritePrompt: string;
}

function saveState(state: PersistedState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch { /* quota exceeded etc */ }
}

function loadState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    // Protect against huge persisted data freezing the page
    if (raw.length > 500_000) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function clearPersistedState() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* */ }
}

// ─── Constants ─────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".doc", ".docx"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

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

/**
 * Clean decorative junk lines from the start and end of imported text.
 * Common in web novel downloads: box-drawing, stars, copyright notices, URLs.
 * Returns { cleaned, removedCount }.
 */
function cleanImportedText(text: string): { cleaned: string; removedCount: number } {
  const lines = text.split("\n");

  // A line is "junk" if it's mostly decorative/non-content
  const isJunkLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;

    // Pure decoration: lines made of stars, dashes, box chars, equals, etc.
    if (/^[★☆✦✧※●○◎◇◆□■△▽▲▼┌┐└┘├┤┬┴┼│─═║╔╗╚╝╠╣╦╩╬\-=_~*+#.·…\s]+$/.test(trimmed)) return true;

    // URLs
    if (/^https?:\/\//.test(trimmed)) return true;
    if (/^www\./.test(trimmed)) return true;

    // Common site/copyright patterns
    if (/书名[:：]/.test(trimmed) && trimmed.length < 50) return true;
    if (/作者[:：]/.test(trimmed) && trimmed.length < 50) return true;
    if (/文案[:：]?\s*$/.test(trimmed)) return true;
    if (/晋江文学城|起点中文网|纵横中文网|番茄小说|七猫/.test(trimmed)) return true;
    if (/版权所有|copyright|all rights reserved/i.test(trimmed)) return true;
    if (/请勿转载|禁止转载|谢绝转载/.test(trimmed)) return true;
    if (/手打|手动输入|校对/.test(trimmed) && trimmed.length < 30) return true;

    // Very short lines with mostly special chars (>60% non-CJK, non-alphanumeric)
    if (trimmed.length < 20) {
      const cjkCount = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
      const alphaCount = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
      const contentRatio = (cjkCount + alphaCount) / trimmed.length;
      if (contentRatio < 0.3) return true;
    }

    return false;
  };

  // Strip junk from the beginning
  let start = 0;
  while (start < lines.length && isJunkLine(lines[start])) {
    start++;
  }

  // Strip junk from the end
  let end = lines.length - 1;
  while (end > start && isJunkLine(lines[end])) {
    end--;
  }

  const removedCount = start + (lines.length - 1 - end);
  const cleaned = lines.slice(start, end + 1).join("\n").trim();

  return { cleaned, removedCount };
}

const DURATION_OPTIONS = [
  { value: "1-2min", labelKey: "shortDrama" },
  { value: "3-5min", labelKey: "mediumDrama" },
  { value: "custom", labelKey: "customDuration" },
];

// ─── Page Component ────────────────────────────────────────────────────

export default function SmartImportPage() {
  const t = useTranslations("scripts");
  const ti = useTranslations("smartImport");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split("/")[1] || "zh";

  // Restore persisted state (survives locale switch)
  const persisted = useRef(loadState());

  // Step state
  const [step, setStep] = useState<Step>(persisted.current?.step ?? 1);

  // Step 1: Text input
  const [textContent, setTextContent] = useState(persisted.current?.textContent ?? "");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Parameters
  const [direction, setDirection] = useState(persisted.current?.direction ?? "");
  const [targetDuration, setTargetDuration] = useState(persisted.current?.targetDuration ?? "1-2min");
  const [customDuration, setCustomDuration] = useState(persisted.current?.customDuration ?? "");
  const [targetEpisodes, setTargetEpisodes] = useState(persisted.current?.targetEpisodes ?? "");
  const [analysisModelKey, setAnalysisModelKey] = useState(persisted.current?.analysisModelKey ?? "");
  const [rewriteModelKey, setRewriteModelKey] = useState(persisted.current?.rewriteModelKey ?? "");
  const [llmModels, setLlmModels] = useState<LlmModel[]>([]);

  // Step 3: Smart split (task-based)
  const [splitTaskId, setSplitTaskId] = useState<string | null>(persisted.current?.splitTaskId ?? null);
  const splitStream = useTaskTextStream(splitTaskId);

  // Step 4: Chapter preview
  const [chapters, setChapters] = useState<Chapter[]>(persisted.current?.chapters ?? []);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [contentType, setContentType] = useState<string>(persisted.current?.contentType ?? "");
  const [saving, setSaving] = useState(false);

  // Step 5: Batch rewrite
  const [rewritePrompt, setRewritePrompt] = useState(persisted.current?.rewritePrompt ?? "");
  const [rewriteTaskId, setRewriteTaskId] = useState<string | null>(persisted.current?.rewriteTaskId ?? null);
  const rewriteStream = useTaskTextStream(rewriteTaskId);
  const [masterScriptId, setMasterScriptId] = useState<string | null>(persisted.current?.masterScriptId ?? null);
  const rewriteStreamRef = useRef<HTMLDivElement>(null);

  // Persist state on changes (so locale switch doesn't lose progress)
  // Debounce to avoid freezing on large textContent
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // Don't persist huge textContent — it freezes JSON.stringify + sessionStorage
      const textToSave = textContent.length > 200_000 ? "" : textContent;
      saveState({
        step, textContent: textToSave, direction, targetDuration, customDuration,
        targetEpisodes, analysisModelKey, rewriteModelKey,
        splitTaskId, rewriteTaskId, masterScriptId,
        chapters, contentType, rewritePrompt,
      });
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [
    step, textContent, direction, targetDuration, customDuration,
    targetEpisodes, analysisModelKey, rewriteModelKey,
    splitTaskId, rewriteTaskId, masterScriptId,
    chapters, contentType, rewritePrompt,
  ]);

  // Fetch LLM models
  useEffect(() => {
    fetch("/api/user/api-config")
      .then((res) => res.json())
      .then((data) => {
        const models = (data.models || []).filter(
          (m: { type: string; enabled: boolean }) => m.type === "llm" && m.enabled,
        );
        setLlmModels(models);
      })
      .catch(() => {});
  }, []);

  // Resume from DB if no sessionStorage state (e.g. tab was closed)
  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    // Only check if we're on step 1 with no content (fresh page load)
    if (persisted.current || step !== 1 || textContent) {
      setResumeChecked(true);
      return;
    }
    fetch("/api/scripts/smart-import/resume")
      .then((res) => res.json())
      .then((data) => {
        if (data.resumable) {
          setMasterScriptId(data.masterScriptId);
          setChapters(data.chapters || []);
          if (data.importMeta) {
            const meta = data.importMeta as Record<string, unknown>;
            if (meta.direction) setDirection(meta.direction as string);
            if (meta.targetDuration) setTargetDuration(meta.targetDuration as string);
          }
          if (data.activeTaskType === "SMART_SPLIT") {
            setSplitTaskId(data.activeTaskId);
            setStep(3);
          } else if (data.activeTaskType === "BATCH_REWRITE") {
            setRewriteTaskId(data.activeTaskId);
            setStep(5);
          } else {
            setStep(data.step as Step);
          }
          toast.success(
            locale === "zh"
              ? `已恢复上次导入进度 (${data.totalChapters} 章, ${data.rewrittenCount} 已改写)`
              : `Resumed previous import (${data.totalChapters} chapters, ${data.rewrittenCount} rewritten)`,
          );
        }
      })
      .catch(() => {})
      .finally(() => setResumeChecked(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const goBack = () => {
    clearPersistedState();
    router.push(`/${locale}/scripts`);
  };

  const handleFileImport = useCallback(async (file: File) => {
    if (!isAcceptedFile(file)) {
      toast.error(t("unsupportedImportType"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(ti("fileTooLarge"));
      return;
    }

    setImporting(true);
    // Yield to event loop so loading spinner renders before heavy work
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

      // Auto-clean junk lines
      const { cleaned, removedCount } = cleanImportedText(text);
      setTextContent(cleaned);
      if (removedCount > 0) {
        toast.success(ti("cleanedLines", { count: removedCount }));
      } else {
        toast.success(t("importSuccess"));
      }
    } catch {
      toast.error(t("importFailed"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [t, ti]);

  const handleCleanText = () => {
    const { cleaned, removedCount } = cleanImportedText(textContent);
    if (removedCount > 0) {
      setTextContent(cleaned);
      toast.success(ti("cleanedLines", { count: removedCount }));
    } else {
      toast.success(ti("alreadyClean"));
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
    clearPersistedState();
    router.push(`/${locale}/scripts`);
  };

  // ─── Render ──────────────────────────────────────────────────────────

  const stepLabels = [ti("step1"), ti("step2"), ti("step3"), ti("step4"), ti("step5")];
  const isBusy = splitStream.isStreaming || rewriteStream.isStreaming || importing || saving;
  const charCount = textContent.length;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={isBusy ? undefined : goBack}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 disabled:opacity-50"
            disabled={isBusy}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">{ti("title")}</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`w-8 h-px ${isDone ? "bg-green-400" : "bg-gray-200 dark:bg-gray-700"}`} />
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : isDone
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                    }`}
                  >
                    {isDone ? <Check size={14} /> : stepNum}
                  </div>
                  <span
                    className={`text-sm hidden sm:inline ${
                      isActive ? "font-medium text-gray-900 dark:text-gray-100" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Step 1: Import Text ──────────────────────────────────── */}
        {step === 1 && (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{ti("inputText")}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{charCount.toLocaleString()} {ti("chars")}</span>
                  {charCount > 0 && (
                    <button
                      type="button"
                      onClick={handleCleanText}
                      className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                    >
                      {ti("cleanText")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                    disabled={importing}
                  >
                    {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {t("importFile")}
                  </button>
                </div>
              </div>
              <textarea
                className="flex w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 min-h-[400px]"
                style={{ minHeight: "400px" }}
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
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{ti("fileFormats")}</p>
                <Button onClick={() => setStep(2)} disabled={charCount < 100}>
                  {ti("next")}
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ─── Step 2: Set Parameters ──────────────────────────────── */}
        {step === 2 && (
          <Card className="p-6">
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">{ti("step2")}</h2>

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
                <div className="flex gap-2 flex-wrap">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`px-4 py-2.5 rounded-lg text-sm border transition-colors ${
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
                  className="flex h-10 w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                  placeholder={ti("targetEpisodesPlaceholder")}
                  value={targetEpisodes}
                  onChange={(e) => setTargetEpisodes(e.target.value)}
                />
              </div>

              {/* Model selectors */}
              {llmModels.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} className="mr-1" />
                  {ti("back")}
                </Button>
                <Button onClick={handleStartSplit}>
                  {ti("startAnalysis")}
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ─── Step 3: Smart Split (streaming) ─────────────────────── */}
        {step === 3 && (
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-600">
                <Loader2 size={20} className="animate-spin" />
                <h2 className="text-lg font-semibold">
                  {ti("analyzing")}... {splitStream.progressPercent > 0 ? `${splitStream.progressPercent}%` : ""}
                </h2>
              </div>
              <div className="overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm whitespace-pre-wrap font-mono dark:bg-gray-800" style={{ maxHeight: "400px" }}>
                {splitStream.streamedText || ti("waitingForAnalysis")}
                {splitStream.isStreaming && (
                  <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </div>
              {splitStream.progressPercent > 0 && (
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${splitStream.progressPercent}%` }}
                  />
                </div>
              )}
              <div className="flex justify-start pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSplitTaskId(null);
                    setStep(2);
                  }}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ─── Step 4: Preview & Adjust Chapters ───────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Script type detection hint */}
            {contentType === "script" && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                <BookOpen size={18} />
                <span>{ti("detectedScript")}</span>
              </div>
            )}

            <div className="flex gap-4" style={{ minHeight: "500px" }}>
              {/* Left: Chapter list */}
              <div className="w-72 shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-sm font-medium text-gray-500">{ti("chapterCount", { count: chapters.length })}</span>
                </div>
                {chapters.map((ch, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-2.5 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors ${
                      selectedChapterIdx === idx
                        ? "bg-blue-50 border-l-2 border-l-blue-500 dark:bg-blue-900/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => setSelectedChapterIdx(idx)}
                  >
                    <div className="text-sm font-medium truncate">{ch.index}. {ch.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {ch.content.length.toLocaleString()} {ti("chars")}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Content preview + actions */}
              <div className="flex-1 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                {chapters[selectedChapterIdx] && (
                  <>
                    {/* Chapter title + action buttons */}
                    <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                      <input
                        type="text"
                        className="w-full text-lg font-semibold bg-transparent focus:outline-none dark:text-gray-100"
                        value={chapters[selectedChapterIdx].title}
                        onChange={(e) => {
                          setChapters((prev) =>
                            prev.map((ch, i) =>
                              i === selectedChapterIdx ? { ...ch, title: e.target.value } : ch,
                            ),
                          );
                        }}
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleMergeChapter(selectedChapterIdx)}
                          disabled={selectedChapterIdx >= chapters.length - 1}
                          className="px-2.5 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          {ti("mergeWithNext")}
                        </button>
                        <button
                          onClick={() => handleSplitChapter(selectedChapterIdx)}
                          className="px-2.5 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                        >
                          {ti("splitInTwo")}
                        </button>
                        <button
                          onClick={() => handleDeleteChapter(selectedChapterIdx)}
                          disabled={chapters.length <= 1}
                          className="px-2.5 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          {ti("deleteChapter")}
                        </button>
                      </div>
                    </div>
                    {/* Chapter content */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-400 leading-relaxed">
                      {chapters[selectedChapterIdx].content.substring(0, 5000)}
                      {chapters[selectedChapterIdx].content.length > 5000 && (
                        <span className="text-gray-400 italic">
                          {"\n\n"}... ({(chapters[selectedChapterIdx].content.length - 5000).toLocaleString()} {ti("moreChars")})
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => { setSplitTaskId(null); setStep(2); }}>
                <ArrowLeft size={16} className="mr-1" />
                {ti("back")}
              </Button>
              <Button onClick={handleConfirmChapters} disabled={saving || chapters.length === 0}>
                {saving && <Loader2 size={16} className="animate-spin mr-1" />}
                {ti("confirmChapters")}
                <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 5: Batch Rewrite ───────────────────────────────── */}
        {step === 5 && (
          <Card className="p-6">
            <div className="space-y-4">
              {!rewriteTaskId ? (
                <>
                  <h2 className="text-lg font-semibold">{ti("step5")}</h2>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {ti("rewriteRequirement")}
                    </label>
                    <textarea
                      className="flex w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                      rows={5}
                      placeholder={ti("rewriteRequirementPlaceholder")}
                      value={rewritePrompt}
                      onChange={(e) => setRewritePrompt(e.target.value)}
                    />
                  </div>
                  <p className="text-sm text-gray-500">
                    {ti("rewriteHint", { count: chapters.length })}
                  </p>
                  <div className="flex justify-between pt-2">
                    <Button variant="secondary" onClick={handleFinish}>
                      {ti("skipRewrite")}
                    </Button>
                    <Button onClick={handleStartRewrite} disabled={!rewritePrompt.trim()}>
                      {ti("startRewrite")}
                      <ChevronRight size={16} className="ml-1" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-blue-600">
                    {rewriteStream.isStreaming ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        <h2 className="text-lg font-semibold">
                          {ti("rewriting")}... {rewriteStream.progressPercent > 0 ? `${rewriteStream.progressPercent}%` : ""}
                        </h2>
                      </>
                    ) : rewriteStream.isComplete ? (
                      <h2 className="text-lg font-semibold text-green-600">
                        <Check size={20} className="inline mr-1" />
                        {ti("batchRewriteComplete")}
                      </h2>
                    ) : null}
                  </div>
                  <div
                    ref={rewriteStreamRef}
                    className="overflow-y-auto rounded-lg bg-gray-50 p-4 text-sm whitespace-pre-wrap font-mono dark:bg-gray-800"
                    style={{ maxHeight: "400px" }}
                  >
                    {rewriteStream.streamedText}
                    {rewriteStream.isStreaming && (
                      <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </div>
                  {rewriteStream.progressPercent > 0 && (
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${rewriteStream.progressPercent}%` }}
                      />
                    </div>
                  )}
                  {rewriteStream.isComplete && (
                    <div className="flex justify-end pt-2">
                      <Button onClick={handleFinish}>
                        {ti("finish")}
                        <Check size={16} className="ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
