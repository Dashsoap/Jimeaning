"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Sparkles,
  Trash2,
  Play,
  ChevronDown,
  ChevronRight,
  FileText,
  Eye,
  Zap,
  Loader2,
  RotateCcw,
  AlertCircle,
  Image as ImageIcon,
  Film,
  Upload,
  BookOpen,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { ContentRenderer, type ContentType } from "@/components/agents/ContentRenderer";

// ─── Types ───────────────────────────────────────────────────────────

interface AgentEpisode {
  id: string;
  episodeNumber: number;
  title: string | null;
  status: string;
  reviewScore: number | null;
  script: string | null;
  reviewData: unknown;
  storyboard: string | null;
  imagePrompts: string | null;
  outline: string | null;
  rewriteAttempt?: number;
  reflectionData?: unknown;
  chapterNotes?: string | null;
}

interface AgentProject {
  id: string;
  title: string;
  status: string;
  targetEpisodes: number | null;
  durationPerEp: string | null;
  autoMode: boolean;
  outputFormat: string | null;
  analysisData: unknown;
  planningData: unknown;
  rewriteStrategy: unknown;
  strategyConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
  episodes: AgentEpisode[];
}

// ─── Status helpers ──────────────────────────────────────────────────

type StatusVariant = "default" | "accent" | "success" | "danger" | "warning" | "info";

function statusVariant(status: string): StatusVariant {
  switch (status) {
    case "completed": return "success";
    case "failed": case "review-failed": return "danger";
    case "analyzing": case "planning": case "writing":
    case "reviewing": case "storyboarding": case "imaging":
      return "accent";
    case "analyzed": case "planned": case "drafted":
    case "reviewed": case "storyboarded":
      return "info";
    case "strategy-designed": return "warning";
    case "strategy-confirmed": return "info";
    default: return "default";
  }
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function AgentsPage() {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split("/")[1] || "zh";
  const { status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<{ title: string; content: string; type: ContentType } | null>(null);

  // ─── Queries ─────────────────────────────────────────────────────

  const { data: projects = [], isLoading } = useQuery<AgentProject[]>({
    queryKey: ["agent-projects"],
    queryFn: () => fetch("/api/agent-projects").then((r) => r.json()),
    enabled: sessionStatus === "authenticated",
    refetchInterval: (query) => {
      // Always poll at 3s if we have an activeTaskId
      if (activeTaskId) return 3000;
      // Poll at 5s if any project has a busy status (backend still running after page refresh)
      const data = query.state.data as AgentProject[] | undefined;
      const busyStatuses = ["created", "analyzing", "planning", "writing", "reviewing", "storyboarding", "imaging", "strategy-designed"];
      if (data?.some((p) => busyStatuses.includes(p.status))) return 5000;
      return false;
    },
  });

  // ─── Task polling ────────────────────────────────────────────────

  useTaskPolling(activeTaskId, {
    onComplete: () => {
      setActiveTaskId(null);
      setActiveProjectId(null);
      queryClient.invalidateQueries({ queryKey: ["agent-projects"] });
    },
    onFailed: () => {
      setActiveTaskId(null);
      setActiveProjectId(null);
      queryClient.invalidateQueries({ queryKey: ["agent-projects"] });
    },
  });

  // ─── Mutations ───────────────────────────────────────────────────

  const triggerAction = useCallback(
    async (url: string, body?: object) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setActiveTaskId(data.taskId);
      // Extract project ID from URL: /api/agent-projects/{id}/...
      const match = url.match(/\/agent-projects\/([^/]+)/);
      if (match) setActiveProjectId(match[1]);
      queryClient.invalidateQueries({ queryKey: ["agent-projects"] });
      return data;
    },
    [queryClient],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/agent-projects/${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed");
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-projects"] }),
  });

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      setPublishingId(id);
      const res = await fetch(`/api/agent-projects/${id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ projectId: string }>;
    },
    onSuccess: (data) => {
      setPublishingId(null);
      router.push(`/${locale}/projects/${data.projectId}`);
    },
    onError: () => setPublishingId(null),
  });

  // ─── Render ──────────────────────────────────────────────────────

  void locale; // used for future routing

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              {t("subtitle")}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-1.5" />
            {t("createProject")}
          </Button>
        </div>

        {/* Active task indicator */}
        {activeTaskId && (
          <div className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-accent-bg)] px-4 py-2.5 text-sm text-[var(--color-accent)]">
            <Loader2 size={16} className="animate-spin" />
            {t("taskStarted")}...
          </div>
        )}

        {/* Project list */}
        {isLoading ? (
          <div className="py-20 text-center text-sm text-[var(--color-text-tertiary)]">
            {tc("loading")}
          </div>
        ) : projects.length === 0 ? (
          <div className="py-20 text-center">
            <Sparkles size={40} className="mx-auto mb-3 text-[var(--color-text-tertiary)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">{t("noProjects")}</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t("noProjectsHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                expanded={expandedId === project.id}
                onToggle={() => setExpandedId(expandedId === project.id ? null : project.id)}
                onTrigger={triggerAction}
                onDelete={() => {
                  if (confirm(t("deleteConfirm", { title: project.title }))) {
                    deleteMutation.mutate(project.id);
                  }
                }}
                onReset={async () => {
                  await fetch(`/api/agent-projects/${project.id}`, { method: "PATCH" });
                  queryClient.invalidateQueries({ queryKey: ["agent-projects"] });
                }}
                onPublish={() => publishMutation.mutate(project.id)}
                isPublishing={publishingId === project.id}
                onViewContent={setViewContent}
                t={t}
                isWorking={!!activeTaskId && activeProjectId === project.id}
                globalBusy={!!activeTaskId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create project modal */}
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async (id, autoMode) => {
          setShowCreate(false);
          // Always start analysis; autoMode runs the full pipeline
          await triggerAction(
            autoMode
              ? `/api/agent-projects/${id}/auto`
              : `/api/agent-projects/${id}/analyze`,
          );
        }}
        t={t}
        tc={tc}
      />

      {/* Content viewer modal */}
      <Modal
        open={!!viewContent}
        onClose={() => setViewContent(null)}
        title={viewContent?.title}
        className="max-w-3xl max-h-[80vh] overflow-y-auto"
      >
        {viewContent && (
          <ContentRenderer content={viewContent.content} type={viewContent.type} />
        )}
      </Modal>
    </AppShell>
  );
}

// ─── Project Card ────────────────────────────────────────────────────

function ProjectCard({
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
  isWorking,
  globalBusy,
}: {
  project: AgentProject;
  expanded: boolean;
  onToggle: () => void;
  onTrigger: (url: string, body?: object) => Promise<unknown>;
  onDelete: () => void;
  onReset: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  onViewContent: (v: { title: string; content: string; type: ContentType }) => void;
  t: ReturnType<typeof useTranslations<"agents">>;
  isWorking: boolean; // this project has an active task
  globalBusy: boolean; // any project has an active task
}) {
  const isNovelFormat = project.outputFormat === "novel" || project.outputFormat === "same";
  const busyStatuses = ["analyzing", "planning", "writing", "reviewing", "storyboarding", "imaging"];
  const isBusy = busyStatuses.includes(project.status);
  // A project is "stuck" only if status says busy, no active task, AND updatedAt is stale (>2min)
  const staleMs = Date.now() - new Date(project.updatedAt).getTime();
  const isStuck = isBusy && !isWorking && staleMs > 2 * 60 * 1000;
  // Disable actions if this project is busy, or any task is running globally
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
            {isStuck ? t("status.failed") : t(`status.${project.status}` as Parameters<typeof t>[0])}
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
          {/* Publish to project — show when completed */}
          {project.status === "completed" && (
            <Button size="sm" disabled={isPublishing}
              onClick={onPublish}>
              {isPublishing
                ? <Loader2 size={14} className="mr-1 animate-spin" />
                : <Upload size={14} className="mr-1" />}
              {t("publish")}
            </Button>
          )}
          {/* Step-by-step actions — show based on actual data, not just project status */}
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

      {/* Strategy review panel — show when strategy is designed */}
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
    </Card>
  );
}

// ─── Episode Row ─────────────────────────────────────────────────────

interface EpisodeDetail {
  script?: string | null;
  reviewData?: unknown;
  storyboard?: string | null;
  imagePrompts?: string | null;
  outline?: string | null;
}

function EpisodeRow({
  project,
  episode: ep,
  onTrigger,
  onViewContent,
  t,
  isWorking,
}: {
  project: AgentProject;
  episode: AgentEpisode;
  onTrigger: (url: string) => Promise<unknown>;
  onViewContent: (v: { title: string; content: string; type: ContentType }) => void;
  t: ReturnType<typeof useTranslations<"agents">>;
  isWorking: boolean;
}) {
  const base = `/api/agent-projects/${project.id}/episodes/${ep.episodeNumber}`;
  const isVisualFormat = !project.outputFormat || project.outputFormat === "script";
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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
          {t(`epStatus.${ep.status}` as Parameters<typeof t>[0])}
        </Badge>
        {ep.reviewScore !== null && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t("score")}: {ep.reviewScore}/50
          </span>
        )}
        {!!ep.rewriteAttempt && ep.rewriteAttempt > 0 && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t("attempt")}: {ep.rewriteAttempt}
          </span>
        )}
        {!!(ep.reflectionData as { totalScore?: number } | null)?.totalScore && (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {t("reflectScore")}: {(ep.reflectionData as { totalScore: number }).totalScore}/50
          </span>
        )}

        {/* Action buttons — show next step */}
        <div className="flex items-center gap-1 shrink-0">
          {(ep.status === "planned" || ep.status === "pending") && (
            <Button size="sm" variant="ghost" disabled={isWorking}
              onClick={() => onTrigger(`${base}/write`)}>
              {t("steps.write")}
            </Button>
          )}
          {ep.status === "drafted" && (
            <Button size="sm" variant="ghost" disabled={isWorking}
              onClick={() => onTrigger(`${base}/review`)}>
              {t("steps.review")}
            </Button>
          )}
          {(ep.status === "reviewed" || ep.status === "review-failed") && isVisualFormat && (
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
            <div className="flex flex-wrap gap-2">
              {detail.script && (
                <button
                  onClick={() => viewSection(t("viewScript"), detail.script!, "script")}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                >
                  <FileText size={14} /> {t("viewScript")}
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {detail.script.length.toLocaleString()}字
                  </span>
                </button>
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
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                >
                  <ImageIcon size={14} /> {t("viewImagePrompts")}
                </button>
              )}
              {!detail.script && !detail.reviewData && !detail.storyboard && !detail.imagePrompts && (
                <span className="text-sm text-[var(--color-text-tertiary)]">{t("noContent")}</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Strategy Panel ──────────────────────────────────────────────────

interface StrategyData {
  globalStyle?: {
    narrativeVoice: string;
    toneAndRegister: string;
    sentenceRhythm: string;
    dialogueApproach: string;
    tabooPatterns: string[];
  };
  characterVoices?: Record<string, {
    speechStyle: string;
    innerWorld: string;
    uniqueMarkers: string;
  }>;
  chapterPlans?: Array<{
    episodeNumber: number;
    focusPoints: string[];
    emotionalArc: string;
  }>;
  coherenceRules?: {
    recurringMotifs: string[];
    timelineConsistency: string;
    characterArcProgression: string;
    foreshadowingNotes: string[];
  };
  humanReadableSummary?: string;
}

function StrategyPanel({
  project,
  onViewContent,
  t,
}: {
  project: AgentProject;
  onViewContent: (v: { title: string; content: string; type: ContentType }) => void;
  t: ReturnType<typeof useTranslations<"agents">>;
}) {
  const strategy = project.rewriteStrategy as StrategyData | null;
  if (!strategy) return null;

  return (
    <div className="mt-4 border-t border-[var(--color-border-default)] pt-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={16} className="text-[var(--color-accent)]" />
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {t("strategyTitle")}
        </span>
        {project.strategyConfirmed && (
          <Badge variant="success">{t("strategyConfirmed")}</Badge>
        )}
        <button
          onClick={() => onViewContent({
            title: t("strategyTitle"),
            content: JSON.stringify(strategy, null, 2),
            type: "raw",
          })}
          className="ml-auto text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
        >
          {t("viewStrategy")}
        </button>
      </div>

      {/* Summary */}
      {strategy.humanReadableSummary && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-3 leading-relaxed">
          {strategy.humanReadableSummary}
        </p>
      )}

      {/* Global style */}
      {strategy.globalStyle && (
        <div className="mb-3 space-y-1">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase">
            {t("strategyStyle")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="default">{t("narrativeVoice")}: {strategy.globalStyle.narrativeVoice}</Badge>
            <Badge variant="default">{t("toneAndRegister")}: {strategy.globalStyle.toneAndRegister}</Badge>
            <Badge variant="default">{t("sentenceRhythm")}: {strategy.globalStyle.sentenceRhythm}</Badge>
          </div>
          {strategy.globalStyle.tabooPatterns?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {strategy.globalStyle.tabooPatterns.slice(0, 5).map((p, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)]">
                  {p}
                </span>
              ))}
              {strategy.globalStyle.tabooPatterns.length > 5 && (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  +{strategy.globalStyle.tabooPatterns.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Character voices */}
      {strategy.characterVoices && Object.keys(strategy.characterVoices).length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase mb-1">
            {t("strategyCharacters")}
          </p>
          <div className="grid gap-1.5">
            {Object.entries(strategy.characterVoices).slice(0, 4).map(([name, voice]) => (
              <div key={name} className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-surface)] rounded-[var(--radius-sm)] px-2 py-1.5">
                <span className="font-medium">{name}</span>: {voice.speechStyle}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Project Modal ────────────────────────────────────────────

function CreateProjectModal({
  open,
  onClose,
  onCreated,
  t,
  tc,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, autoMode: boolean) => void;
  t: ReturnType<typeof useTranslations<"agents">>;
  tc: ReturnType<typeof useTranslations<"common">>;
}) {
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [durationPerEp, setDurationPerEp] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"script" | "novel" | "same">("script");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sourceText.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/agent-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          sourceText: sourceText.trim(),
          durationPerEp: durationPerEp.trim() || null,
          autoMode,
          outputFormat,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTitle("");
      setSourceText("");
      setDurationPerEp("");
      setAutoMode(false);
      setOutputFormat("script");
      onCreated(data.id, autoMode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("createProject")} className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="title"
          label={t("projectTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
            {t("sourceText")}
          </label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={t("sourceTextPlaceholder")}
            rows={10}
            required
            className="flex w-full rounded-[var(--radius-lg)] border border-transparent bg-[var(--color-bg-surface)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[rgba(245,166,35,0.3)] focus:border-[var(--color-border-default)] transition-colors resize-y"
          />
          {sourceText.length > 0 && (
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              {sourceText.length.toLocaleString()} 字
            </p>
          )}
        </div>
        {/* Output format selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
            {t("outputFormat")}
          </label>
          <div className="flex gap-2">
            {(["script", "novel", "same"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setOutputFormat(fmt)}
                className={`flex-1 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  outputFormat === fmt
                    ? "bg-[var(--color-btn-primary)] text-white"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-hover)]"
                }`}
              >
                {t(`format_${fmt}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
            {t(`formatHint_${outputFormat}` as Parameters<typeof t>[0])}
          </p>
        </div>
        <Input
          id="duration"
          label={t("durationPerEp")}
          value={durationPerEp}
          onChange={(e) => setDurationPerEp(e.target.value)}
          placeholder={t("durationHint")}
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoMode}
            onChange={(e) => setAutoMode(e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-text-primary)]">{t("autoMode")}</span>
          <span className="text-xs text-[var(--color-text-tertiary)]">— {t("autoModeHint")}</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={submitting || !title.trim() || !sourceText.trim()}>
            {submitting ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
            {tc("create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
