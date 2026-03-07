"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import {
  Loader2,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";

interface SmartImportWizardProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

type Stage = "source" | "parsing" | "preview";

interface EpisodeEntry {
  number: number;
  title: string;
  summary: string;
  content: string;
}

/**
 * Detect common chapter/episode markers in text.
 * Returns split episodes if markers found, null otherwise.
 */
function detectMarkers(text: string): EpisodeEntry[] | null {
  // Common Chinese chapter patterns
  const patterns = [
    /^第[一二三四五六七八九十百千\d]+[章节集回幕]/gm,
    /^Chapter\s+\d+/gim,
    /^Episode\s+\d+/gim,
    /^#{1,3}\s+.+/gm, // Markdown headers
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length >= 2) {
      const episodes: EpisodeEntry[] = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index!;
        const end = i < matches.length - 1 ? matches[i + 1].index! : text.length;
        const content = text.substring(start, end).trim();
        const firstLine = content.split("\n")[0].trim();
        episodes.push({
          number: i + 1,
          title: firstLine.replace(/^#+\s*/, ""),
          summary: "",
          content,
        });
      }
      return episodes;
    }
  }
  return null;
}

export function SmartImportWizard({ open, onClose, projectId }: SmartImportWizardProps) {
  const t = useTranslations("import");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>("source");
  const [rawContent, setRawContent] = useState("");
  const [episodes, setEpisodes] = useState<EpisodeEntry[]>([]);
  const [splitTaskId, setSplitTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Poll episode split task
  const { isRunning: isSplitting, progressPercent } = useTaskPolling(splitTaskId, {
    interval: 2000,
    onComplete: useCallback(
      (task: { result?: Record<string, unknown> }) => {
        const result = task.result as { episodes?: EpisodeEntry[] } | undefined;
        if (result?.episodes?.length) {
          setEpisodes(result.episodes);
        }
        setSplitTaskId(null);
        setStage("preview");
      },
      []
    ),
    onFailed: useCallback((error: string) => {
      toast.error(`${error || "Split failed"}`);
      setSplitTaskId(null);
      setStage("source");
    }, []),
  });

  const handleAnalyze = async () => {
    if (!rawContent.trim()) return;

    // Try fast marker detection first
    const markerResult = detectMarkers(rawContent);
    if (markerResult && markerResult.length >= 2) {
      setEpisodes(markerResult);
      setStage("preview");
      toast.success(t("markersDetected", { count: markerResult.length }));
      return;
    }

    // Fall back to AI split
    setStage("parsing");
    try {
      const res = await fetch(`/api/projects/${projectId}/split-episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: rawContent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || tc("error"));
        setStage("source");
        return;
      }
      const { taskId } = await res.json();
      setSplitTaskId(taskId);
    } catch {
      toast.error(tc("error"));
      setStage("source");
    }
  };

  const handleSave = async () => {
    if (!episodes.length) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/episodes/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodes: episodes.map((ep) => ({
            title: ep.title,
            synopsis: ep.summary || ep.content.substring(0, 200),
            sortOrder: ep.number - 1,
          })),
          clearExisting: true,
        }),
      });
      if (!res.ok) throw new Error("Save failed");

      // Also save the full text as sourceText
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: rawContent }),
      });

      toast.success(t("importSuccess"));
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
      resetState();
    } catch {
      toast.error(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  const resetState = () => {
    setStage("source");
    setRawContent("");
    setEpisodes([]);
    setSplitTaskId(null);
    setEditingIdx(null);
  };

  const removeEpisode = (idx: number) => {
    setEpisodes((prev) => prev.filter((_, i) => i !== idx).map((ep, i) => ({ ...ep, number: i + 1 })));
  };

  const updateEpisode = (idx: number, field: keyof EpisodeEntry, value: string) => {
    setEpisodes((prev) =>
      prev.map((ep, i) => (i === idx ? { ...ep, [field]: value } : ep))
    );
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!isSplitting && !saving) {
          onClose();
          resetState();
        }
      }}
      title={t("title")}
      className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
    >
      <div className="flex-1 overflow-y-auto">
        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          {(["source", "parsing", "preview"] as Stage[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  stage === s
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-400"
                }`}
              >
                {t(`step${i + 1}`)}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Source */}
        {stage === "source" && (
          <div className="space-y-4">
            <textarea
              className="w-full h-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder={t("pasteHint")}
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {rawContent.length} {t("characters")}
              </span>
              <Button onClick={handleAnalyze} disabled={!rawContent.trim()}>
                <Sparkles size={16} className="mr-1" />
                {t("analyze")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Parsing */}
        {stage === "parsing" && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t("analyzing")}
            </p>
            <div className="w-64 mx-auto h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-700"
                style={{ width: `${Math.max(progressPercent, 5)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">{progressPercent}%</p>
          </div>
        )}

        {/* Step 3: Preview */}
        {stage === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("episodesFound", { count: episodes.length })}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStage("source")}
              >
                <ChevronLeft size={14} className="mr-1" />
                {t("backToEdit")}
              </Button>
            </div>

            {episodes.map((ep, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-gray-400">#{ep.number}</span>
                  {editingIdx === idx ? (
                    <input
                      className="flex-1 text-sm font-medium border-b border-blue-400 bg-transparent outline-none"
                      value={ep.title}
                      onChange={(e) => updateEpisode(idx, "title", e.target.value)}
                      onBlur={() => setEditingIdx(null)}
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium truncate">
                      {ep.title}
                    </span>
                  )}
                  <button
                    onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                    className="p-1 text-gray-400 hover:text-blue-500"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => removeEpisode(idx)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {ep.summary && (
                  <p className="text-xs text-gray-500 line-clamp-2">{ep.summary}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {ep.content.length} {t("characters")}
                </p>
              </div>
            ))}

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
              <Button variant="secondary" onClick={() => { onClose(); resetState(); }}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving || !episodes.length}>
                {saving ? (
                  <Loader2 size={16} className="mr-1 animate-spin" />
                ) : (
                  <CheckCircle size={16} className="mr-1" />
                )}
                {t("confirmImport")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
