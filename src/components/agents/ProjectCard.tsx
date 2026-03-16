"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Trash2,
  Play,
  ChevronDown,
  ChevronRight,
  Eye,
  Zap,
  Loader2,
  RotateCcw,
  AlertCircle,
  Upload,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EpisodeRow } from "./EpisodeRow";
import { PublishPreviewModal } from "./PublishPreviewModal";
import { StrategyPanel } from "./StrategyPanel";
import { PipelineStepper } from "./PipelineStepper";
import { statusVariant, type AgentProject, type ViewContentPayload } from "./types";

interface ProjectCardProps {
  project: AgentProject;
  expanded: boolean;
  onToggle: () => void;
  onTrigger: (url: string, body?: object) => Promise<unknown>;
  onDelete: () => void;
  onReset: () => void;
  onPublish: (episodeNumbers?: number[]) => void;
  isPublishing: boolean;
  onViewContent: (v: ViewContentPayload) => void;
  t: (key: string) => string;
  tc: (key: string) => string;
  isWorking: boolean;
  globalBusy: boolean;
}

export function ProjectCard({
  project,
  expanded,
  onToggle,
  onTrigger,
  onDelete,
  onReset,
  onPublish,
  isPublishing,
  onViewContent,
  t,
  tc,
  isWorking,
  globalBusy,
}: ProjectCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [showPublishPreview, setShowPublishPreview] = useState(false);
  const locale = pathname.split("/")[1] || "zh";
  const isNovelFormat = project.outputFormat === "novel" || project.outputFormat === "same";
  const busyStatuses = ["analyzing", "planning", "writing", "reviewing", "storyboarding", "imaging"];
  const isBusy = busyStatuses.includes(project.status);
  const staleMs = Date.now() - new Date(project.updatedAt).getTime();
  const isStuck = isBusy && !isWorking && staleMs > 2 * 60 * 1000;
  const canAct = !globalBusy;

  return (
    <Card className="overflow-hidden">
      {/* Stuck warning */}
      {isStuck && (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
          <AlertCircle size={14} />
          {t("taskStuck")}
          <button
            onClick={onReset}
            className="ml-auto flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-error)]/10 px-2 py-0.5 text-xs font-medium hover:bg-[var(--color-error)]/20 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} /> {t("resetStatus")}
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-3">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-medium text-[var(--color-text-primary)] truncate">
            {project.title}
          </span>
          <Badge variant={statusVariant(isStuck ? "failed" : project.status)}>
            {isStuck ? t("status.failed") : t(`status.${project.status}`)}
          </Badge>
          {project.outputFormat && project.outputFormat !== "script" && (
            <Badge variant="warning">
              {project.outputFormat === "novel" ? t("formatNovel") : t("formatSame")}
            </Badge>
          )}
          {project.episodes?.length > 0 && (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {project.episodes.length} {t("episodes")}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Reader */}
          {project.episodes?.some((ep) => ["drafted", "reviewed", "review-failed", "storyboarded", "completed"].includes(ep.status)) && (
            <Button size="sm" variant="secondary"
              onClick={() => router.push(`/${locale}/agents/${project.id}/reader`)}>
              <BookOpen size={14} className="mr-1" /> {t("readFull")}
            </Button>
          )}
          {/* Publish */}
          {project.status === "completed" && (
            <Button size="sm"
              onClick={() => setShowPublishPreview(true)}>
              <Upload size={14} className="mr-1" />
              {t("publish")}
            </Button>
          )}
          {/* Step-by-step actions */}
          {!project.analysisData && (
            <Button size="sm" variant="secondary" disabled={!canAct}
              onClick={() => onTrigger(`/api/agent-projects/${project.id}/analyze`)}>
              <Play size={14} className="mr-1" /> {t("steps.analyze")}
            </Button>
          )}
          {!!project.analysisData && !project.planningData && (
            <Button size="sm" variant="secondary" disabled={!canAct}
              onClick={() => onTrigger(`/api/agent-projects/${project.id}/plan`)}>
              <Play size={14} className="mr-1" /> {t("steps.plan")}
            </Button>
          )}
          {!!project.analysisData && !!project.planningData && isNovelFormat && !project.rewriteStrategy && (
            <Button size="sm" variant="secondary" disabled={!canAct}
              onClick={() => onTrigger(`/api/agent-projects/${project.id}/strategy`)}>
              <Play size={14} className="mr-1" /> {t("steps.strategy")}
            </Button>
          )}
          {project.status === "strategy-designed" && isNovelFormat && (
            <Button size="sm" disabled={!canAct}
              onClick={async () => {
                await fetch(`/api/agent-projects/${project.id}/strategy`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ confirmed: true }),
                });
                onTrigger(`/api/agent-projects/${project.id}/execute`);
              }}>
              <Zap size={14} className="mr-1" /> {t("steps.confirmStrategy")}
            </Button>
          )}
          {!!project.analysisData && !!project.planningData && (!isNovelFormat || project.strategyConfirmed) && (
            <Button size="sm" disabled={!canAct}
              onClick={() => onTrigger(`/api/agent-projects/${project.id}/auto`)}>
              <Zap size={14} className="mr-1" /> {t("steps.auto")}
            </Button>
          )}
          {isBusy && !isStuck && (
            <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />
          )}
          <button
            onClick={onDelete}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors cursor-pointer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Pipeline progress stepper */}
      {expanded && (
        <PipelineStepper project={project} onViewContent={onViewContent} />
      )}

      {/* Expanded episode list */}
      {expanded && project.episodes?.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-border-default)] pt-4 space-y-2">
          {project.episodes.map((ep) => (
            <EpisodeRow
              key={ep.id}
              project={project}
              episode={ep}
              onTrigger={onTrigger}
              onViewContent={onViewContent}
              t={t}
              isWorking={globalBusy || (isBusy && !isStuck)}
            />
          ))}
        </div>
      )}

      {/* Strategy review panel */}
      {expanded && !!project.rewriteStrategy && isNovelFormat && (
        <StrategyPanel
          project={project}
          onViewContent={onViewContent}
          t={t}
        />
      )}

      {/* Analysis data preview */}
      {expanded && !!project.analysisData && !project.episodes?.length && (
        <div className="mt-4 border-t border-[var(--color-border-default)] pt-4">
          <button
            onClick={() =>
              onViewContent({
                title: t("steps.analyze"),
                content: JSON.stringify(project.analysisData, null, 2),
                type: "raw",
              })
            }
            className="text-sm text-[var(--color-accent)] hover:underline cursor-pointer"
          >
            <Eye size={14} className="inline mr-1" />
            {t("steps.analyze")} — {t("status.analyzed")}
          </button>
        </div>
      )}

      {/* Publish preview modal */}
      <PublishPreviewModal
        open={showPublishPreview}
        onClose={() => setShowPublishPreview(false)}
        onPublish={(episodeNumbers) => {
          setShowPublishPreview(false);
          onPublish(episodeNumbers);
        }}
        project={project}
        isPublishing={isPublishing}
        t={t}
        tc={tc}
      />
    </Card>
  );
}
