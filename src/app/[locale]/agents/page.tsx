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
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useTaskPolling } from "@/hooks/useTaskPolling";

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
  const [viewContent, setViewContent] = useState<{ title: string; content: string } | null>(null);

  // ─── Queries ─────────────────────────────────────────────────────

  const { data: projects = [], isLoading } = useQuery<AgentProject[]>({
    queryKey: ["agent-projects"],
    queryFn: () => fetch("/api/agent-projects").then((r) => r.json()),
    enabled: sessionStatus === "authenticated",
    refetchInterval: activeTaskId ? 3000 : false,
  });

  // ─── Task polling ────────────────────────────────────────────────

  useTaskPolling(activeTaskId, {
    onComplete: () => {
      setActiveTaskId(null);
      queryClient.invalidateQueries({ queryKey: ["agent-projects"] });
    },
    onFailed: () => {
      setActiveTaskId(null);
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
                onViewContent={setViewContent}
                t={t}
                isWorking={!!activeTaskId}
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
        <pre className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)] leading-relaxed">
          {viewContent?.content}
        </pre>
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
  onViewContent,
  t,
  isWorking,
}: {
  project: AgentProject;
  expanded: boolean;
  onToggle: () => void;
  onTrigger: (url: string, body?: object) => Promise<unknown>;
  onDelete: () => void;
  onViewContent: (v: { title: string; content: string }) => void;
  t: ReturnType<typeof useTranslations<"agents">>;
  isWorking: boolean;
}) {
  const isBusy = ["analyzing", "planning", "writing", "reviewing", "storyboarding", "imaging"].includes(project.status);

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="font-medium text-[var(--color-text-primary)] truncate">
            {project.title}
          </span>
          <Badge variant={statusVariant(project.status)}>
            {t(`status.${project.status}` as Parameters<typeof t>[0])}
          </Badge>
          {project.targetEpisodes && (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {project.targetEpisodes} {t("episodes")}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Step-by-step actions */}
          {project.status === "created" && (
            <Button size="sm" variant="secondary" disabled={isWorking || isBusy}
              onClick={() => onTrigger(`/api/agent-projects/${project.id}/analyze`)}>
              <Play size={14} className="mr-1" /> {t("steps.analyze")}
            </Button>
          )}
          {project.status === "analyzed" && !project.planningData && (
            <Button size="sm" variant="secondary" disabled={isWorking || isBusy}
              onClick={() => onTrigger(`/api/agent-projects/${project.id}/plan`)}>
              <Play size={14} className="mr-1" /> {t("steps.plan")}
            </Button>
          )}
          {(project.status === "planned" || project.status === "analyzed") && !!project.analysisData && (
            <Button size="sm" disabled={isWorking || isBusy}
              onClick={() => onTrigger(`/api/agent-projects/${project.id}/auto`)}>
              <Zap size={14} className="mr-1" /> {t("steps.auto")}
            </Button>
          )}
          {isBusy && (
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
              isWorking={isWorking || isBusy}
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
  onViewContent: (v: { title: string; content: string }) => void;
  t: ReturnType<typeof useTranslations<"agents">>;
  isWorking: boolean;
}) {
  const base = `/api/agent-projects/${project.id}/episodes/${ep.episodeNumber}`;

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] px-3 py-2">
      <span className="text-sm font-medium text-[var(--color-text-secondary)] w-16 shrink-0">
        EP{ep.episodeNumber}
      </span>
      <span className="text-sm text-[var(--color-text-primary)] truncate flex-1">
        {ep.title || "—"}
      </span>
      <Badge variant={statusVariant(ep.status)}>
        {t(`epStatus.${ep.status}` as Parameters<typeof t>[0])}
      </Badge>
      {ep.reviewScore !== null && (
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {t("score")}: {ep.reviewScore}/50
        </span>
      )}

      {/* View buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {ep.script && (
          <button
            onClick={() => onViewContent({ title: `EP${ep.episodeNumber} ${t("viewScript")}`, content: ep.script! })}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] cursor-pointer"
            title={t("viewScript")}
          >
            <FileText size={14} />
          </button>
        )}
        {!!ep.reviewData && (
          <button
            onClick={() => onViewContent({ title: `EP${ep.episodeNumber} ${t("viewReview")}`, content: JSON.stringify(ep.reviewData, null, 2) })}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] cursor-pointer"
            title={t("viewReview")}
          >
            <Eye size={14} />
          </button>
        )}
      </div>

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
