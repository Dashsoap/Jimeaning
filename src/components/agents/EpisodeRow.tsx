"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Eye,
  Loader2,
  Film,
  Image as ImageIcon,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { ContentType } from "./ContentRenderer";
import { statusVariant, type AgentProject, type AgentEpisode, type ViewContentPayload } from "./types";

interface EpisodeDetail {
  script?: string | null;
  reviewData?: unknown;
  storyboard?: string | null;
  imagePrompts?: string | null;
  outline?: string | null;
  sourceTextSection?: string | null;
}

interface EpisodeRowProps {
  project: AgentProject;
  episode: AgentEpisode;
  onTrigger: (url: string, body?: object) => Promise<unknown>;
  onViewContent: (v: ViewContentPayload) => void;
  t: (key: string) => string;
  isWorking: boolean;
}

export function EpisodeRow({
  project,
  episode: ep,
  onTrigger,
  onViewContent,
  t,
  isWorking,
}: EpisodeRowProps) {
  const base = `/api/agent-projects/${project.id}/episodes/${ep.episodeNumber}`;
  const isVisualFormat = !project.outputFormat || project.outputFormat === "script";
  const isNovelFormat = project.outputFormat === "novel" || project.outputFormat === "same";
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Determine which content types exist based on status progression
  const hasScript = ["drafted", "reviewed", "review-failed", "storyboarded", "completed"].includes(ep.status);
  const hasReview = ep.reviewScore !== null;
  const hasStoryboard = ["storyboarded", "completed"].includes(ep.status);
  const hasImagePrompts = ep.status === "completed";
  const hasAnyContent = hasScript || hasReview || hasStoryboard || hasImagePrompts;

  const toggleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/agent-projects/${project.id}/episodes`);
        const eps = await res.json();
        const full = eps.find((e: { episodeNumber: number }) => e.episodeNumber === ep.episodeNumber);
        if (full) setDetail(full);
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const viewSection = (title: string, content: string, type: ContentType) => {
    onViewContent({ title: `EP${ep.episodeNumber} ${title}`, content, type });
  };

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2">
        {/* Clickable area for expand */}
        <button
          onClick={hasAnyContent ? toggleExpand : undefined}
          className={`flex items-center gap-3 flex-1 min-w-0 ${hasAnyContent ? "cursor-pointer" : ""}`}
        >
          {hasAnyContent && (
            expanded ? <ChevronDown size={14} className="text-[var(--color-text-tertiary)] shrink-0" /> : <ChevronRight size={14} className="text-[var(--color-text-tertiary)] shrink-0" />
          )}
          <span className="text-sm font-medium text-[var(--color-text-secondary)] w-12 shrink-0">
            EP{ep.episodeNumber}
          </span>
          <span className="text-sm text-[var(--color-text-primary)] truncate">
            {ep.title || "—"}
          </span>
        </button>

        <Badge variant={statusVariant(ep.status)}>
          {t(`epStatus.${ep.status}`)}
        </Badge>
        {ep.reviewScore !== null && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t("score")}: {ep.reviewScore}/70
          </span>
        )}
        {!!ep.rewriteAttempt && ep.rewriteAttempt > 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t("attempt")}: {ep.rewriteAttempt}
          </span>
        )}
        {!!(ep.reflectionData as { totalScore?: number } | null)?.totalScore && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t("reflectScore")}: {(ep.reflectionData as { totalScore: number }).totalScore}/90
          </span>
        )}

        {/* Action buttons — show next step + retry */}
        <div className="flex items-center gap-1 shrink-0">
          {(ep.status === "planned" || ep.status === "pending") && (
            <Button size="sm" variant="ghost" disabled={isWorking}
              onClick={() => onTrigger(`${base}/write`)}>
              {t("steps.write")}
            </Button>
          )}
          {ep.status === "drafted" && (
            <>
              <Button size="sm" variant="ghost" disabled={isWorking}
                onClick={() => onTrigger(`${base}/review`)}>
                {t("steps.review")}
              </Button>
              <Button size="sm" variant="ghost" disabled={isWorking}
                onClick={() => onTrigger(`${base}/write`)}
                title={t("rewriteWithFeedback")}>
                <RotateCcw size={12} />
              </Button>
            </>
          )}
          {ep.status === "review-failed" && (
            <>
              <Button size="sm" variant="ghost" disabled={isWorking}
                onClick={() => onTrigger(`${base}/write`)}
                className="text-[var(--color-error)]">
                <RotateCcw size={12} className="mr-1" /> {t("retry")}
              </Button>
              {isVisualFormat && (
                <Button size="sm" variant="ghost" disabled={isWorking}
                  onClick={() => onTrigger(`${base}/storyboard`)}>
                  {t("steps.storyboard")}
                </Button>
              )}
            </>
          )}
          {ep.status === "reviewed" && isVisualFormat && (
            <Button size="sm" variant="ghost" disabled={isWorking}
              onClick={() => onTrigger(`${base}/storyboard`)}>
              {t("steps.storyboard")}
            </Button>
          )}
          {ep.status === "storyboarded" && isVisualFormat && (
            <Button size="sm" variant="ghost" disabled={isWorking}
              onClick={() => onTrigger(`${base}/image-prompts`)}>
              {t("steps.imagePrompts")}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded content panel */}
      {expanded && (
        <div className="border-t border-[var(--color-border-default)] px-4 py-3">
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
              <Loader2 size={14} className="animate-spin" /> {t("loadingDetail")}
            </div>
          ) : detail ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {detail.script && (
                  <>
                    <button
                      onClick={() => viewSection(t("viewScript"), detail.script!, "script")}
                      className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                    >
                      <FileText size={14} /> {t("viewScript")}
                      <span className="text-xs text-[var(--color-text-tertiary)]">
                        {detail.script.length.toLocaleString()}字
                      </span>
                    </button>
                    {isNovelFormat && detail.sourceTextSection && (
                      <button
                        onClick={() => {
                          viewSection(
                            t("compare"),
                            JSON.stringify({ original: detail.sourceTextSection!, rewritten: detail.script! }),
                            "comparison",
                          );
                        }}
                        className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                      >
                        <Eye size={14} /> {t("compare")}
                      </button>
                    )}
                  </>
                )}
                {!!detail.reviewData && (
                  <button
                    onClick={() => viewSection(t("viewReview"), JSON.stringify(detail.reviewData), "review")}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                  >
                    <Eye size={14} /> {t("viewReview")}
                  </button>
                )}
                {isVisualFormat && detail.storyboard && (
                  <button
                    onClick={() => viewSection(t("viewStoryboard"), detail.storyboard!, "storyboard")}
                    className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                  >
                    <Film size={14} /> {t("viewStoryboard")}
                  </button>
                )}
                {isVisualFormat && detail.imagePrompts && (
                  <button
                    onClick={() => viewSection(t("viewImagePrompts"), detail.imagePrompts!, "imagePrompts")}
                    className="flex items-center gap-1.5 rounded-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                  >
                    <ImageIcon size={14} /> {t("viewImagePrompts")}
                  </button>
                )}
                {!detail.script && !detail.reviewData && !detail.storyboard && !detail.imagePrompts && (
                  <span className="text-sm text-[var(--color-text-tertiary)]">{t("noContent")}</span>
                )}
              </div>
              {detail.script && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={t("feedbackPlaceholder")}
                    className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[rgba(245,166,35,0.3)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && feedback.trim() && !isWorking) {
                        onTrigger(`${base}/write`, { feedback: feedback.trim() });
                        setFeedback("");
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={isWorking || !feedback.trim()}
                    onClick={() => {
                      onTrigger(`${base}/write`, { feedback: feedback.trim() });
                      setFeedback("");
                    }}
                  >
                    {t("rewriteWithFeedback")}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
