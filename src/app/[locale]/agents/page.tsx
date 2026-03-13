"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
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
}

interface AgentProject {
  id: string;
  title: string;
  status: string;
  targetEpisodes: number | null;
  durationPerEp: string | null;
  autoMode: boolean;
  analysisData: unknown;
  planningData: unknown;
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
    default: return "default";
  }
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function AgentsPage() {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const pathname = usePathname();
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
      const busyStatuses = ["analyzing", "planning", "writing", "reviewing", "storyboarding", "imaging"];
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
        onCreated={(id, autoMode) => {
          setShowCreate(false);
          queryClient.invalidateQueries({ queryKey: ["agent-projects"] });
          if (autoMode) {
            triggerAction(`/api/agent-projects/${id}/auto`);
          }
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
  onViewContent: (v: { title: string; content: string; type: ContentType }) => void;
  t: ReturnType<typeof useTranslations<"agents">>;
  isWorking: boolean; // this project has an active task
  globalBusy: boolean; // any project has an active task
}) {
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
          {project.episodes?.length > 0 && (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {project.episodes.length} {t("episodes")}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
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
          {!!project.analysisData && !!project.planningData && (
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
          {(ep.status === "reviewed" || ep.status === "review-failed") && (
            <Button size="sm" variant="ghost" disabled={isWorking}
              onClick={() => onTrigger(`${base}/storyboard`)}>
              {t("steps.storyboard")}
            </Button>
          )}
          {ep.status === "storyboarded" && (
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
              {detail.storyboard && (
                <button
                  onClick={() => viewSection(t("viewStoryboard"), detail.storyboard!, "storyboard")}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] transition-colors cursor-pointer"
                >
                  <Film size={14} /> {t("viewStoryboard")}
                </button>
              )}
              {detail.imagePrompts && (
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
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTitle("");
      setSourceText("");
      setDurationPerEp("");
      setAutoMode(false);
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
