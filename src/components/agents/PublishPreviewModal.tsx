"use client";

import { useState, useMemo } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { statusVariant, type AgentProject } from "./types";

interface PublishPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onPublish: (episodeNumbers: number[]) => void;
  project: AgentProject;
  isPublishing: boolean;
  t: (key: string) => string;
  tc: (key: string) => string;
}

export function PublishPreviewModal({
  open,
  onClose,
  onPublish,
  project,
  isPublishing,
  t,
  tc,
}: PublishPreviewModalProps) {
  const publishableEpisodes = useMemo(
    () => project.episodes.filter((ep) => ep.status === "completed"),
    [project.episodes],
  );

  const [selected, setSelected] = useState<Set<number>>(() =>
    new Set(publishableEpisodes.map((ep) => ep.episodeNumber)),
  );

  const toggleEpisode = (epNum: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(epNum)) next.delete(epNum);
      else next.add(epNum);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === publishableEpisodes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(publishableEpisodes.map((ep) => ep.episodeNumber)));
    }
  };

  // Count characters from analysis
  const characterCount = useMemo(() => {
    if (!project.analysisData) return 0;
    const analysis = project.analysisData as { characters?: unknown[] };
    return analysis.characters?.length ?? 0;
  }, [project.analysisData]);

  const isVisual = !project.outputFormat || project.outputFormat === "script";
  const selectedEpisodes = publishableEpisodes.filter((ep) => selected.has(ep.episodeNumber));

  // Estimate panel count from storyboard data
  const panelCount = useMemo(() => {
    if (!isVisual) return 0;
    let count = 0;
    for (const ep of selectedEpisodes) {
      if (ep.storyboard) {
        try {
          const parsed = JSON.parse(ep.storyboard);
          const sb = parsed.storyboard ?? parsed;
          if (sb.scenes) {
            for (const scene of sb.scenes) {
              count += scene.shots?.length ?? 0;
            }
          }
        } catch { /* skip */ }
      }
    }
    return count;
  }, [selectedEpisodes, isVisual]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("publishPreview")}
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-3 text-sm">
          <p className="text-[var(--color-text-primary)] font-medium mb-2">
            {t("publishSummary")}
          </p>
          <div className="space-y-1 text-[var(--color-text-secondary)]">
            <p>{selected.size} {t("episodes")} {t("publishWillCreate")}</p>
            {characterCount > 0 && <p>{characterCount} {t("publishCharacters")}</p>}
            {isVisual && panelCount > 0 && <p>{panelCount} {t("publishPanels")}</p>}
            {!isVisual && <p className="text-xs text-[var(--color-text-tertiary)]">{t("publishNovelNote")}</p>}
          </div>
        </div>

        {/* Episode checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {t("publishSelectEpisodes")}
            </span>
            <button
              onClick={toggleAll}
              className="text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
            >
              {selected.size === publishableEpisodes.length ? tc("deselectAll") : tc("selectAll")}
            </button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {project.episodes.map((ep) => {
              const isPublishable = ep.status === "completed";
              const isChecked = selected.has(ep.episodeNumber);
              return (
                <label
                  key={ep.id}
                  className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors ${
                    isPublishable ? "cursor-pointer hover:bg-[var(--color-bg-surface)]" : "opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!isPublishable}
                    onChange={() => toggleEpisode(ep.episodeNumber)}
                    className="h-4 w-4 rounded accent-[var(--color-accent)]"
                  />
                  <span className="text-[var(--color-text-secondary)] w-10 shrink-0">
                    EP{ep.episodeNumber}
                  </span>
                  <span className="text-[var(--color-text-primary)] truncate flex-1">
                    {ep.title || "—"}
                  </span>
                  <Badge variant={statusVariant(ep.status)}>
                    {t(`epStatus.${ep.status}`)}
                  </Badge>
                  {ep.reviewScore !== null && (
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {ep.reviewScore}/70
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-default)]">
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={isPublishing || selected.size === 0}
            onClick={() => onPublish(Array.from(selected).sort((a, b) => a - b))}
          >
            {isPublishing ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Upload size={14} className="mr-1.5" />
            )}
            {t("publish")} ({selected.size})
          </Button>
        </div>
      </div>
    </Modal>
  );
}
