"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { useSSE } from "@/hooks/useSSE";
import { ContentRenderer, type ContentType } from "@/components/agents/ContentRenderer";
import { AgentTerminal } from "@/components/agents/AgentTerminal";
import { ProjectCard } from "@/components/agents/ProjectCard";
import { CreateProjectModal } from "@/components/agents/CreateProjectModal";
import type { AgentProject, ViewContentPayload } from "@/components/agents/types";

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
  const [viewContent, setViewContent] = useState<ViewContentPayload | null>(null);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);

  // ─── SSE for real-time terminal ────────────────────────────────
  const { events: sseEvents } = useSSE();

  // ─── Queries ─────────────────────────────────────────────────────
  const { data: projects = [], isLoading } = useQuery<AgentProject[]>({
    queryKey: ["agent-projects"],
    queryFn: () => fetch("/api/agent-projects").then((r) => r.json()),
    enabled: sessionStatus === "authenticated",
    refetchInterval: (query) => {
      if (activeTaskId) return 3000;
      const data = query.state.data as AgentProject[] | undefined;
      const busyStatuses = ["created", "analyzing", "planning", "writing", "reviewing", "storyboarding", "imaging", "strategy-designed"];
      if (data?.some((p) => busyStatuses.includes(p.status))) return 5000;
      return false;
    },
  });

  // ─── Task polling ────────────────────────────────────────────────
  useTaskPolling(activeTaskId, {
    onComplete: () => {
      setActiveProjectId(null);
      queryClient.invalidateQueries({ queryKey: ["agent-projects"] });
    },
    onFailed: () => {
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
      setTerminalCollapsed(false);
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
    mutationFn: async ({ id, episodeNumbers }: { id: string; episodeNumbers?: number[] }) => {
      setPublishingId(id);
      const res = await fetch(`/api/agent-projects/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeNumbers }),
      });
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
  void locale;

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

        {/* Real-time terminal */}
        {activeTaskId && (
          <AgentTerminal
            taskId={activeTaskId}
            events={sseEvents}
            collapsed={terminalCollapsed}
            onToggleCollapse={() => setTerminalCollapsed((c) => !c)}
            onDismiss={() => {
              setActiveTaskId(null);
              setActiveProjectId(null);
            }}
          />
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
                onPublish={(episodeNumbers) => publishMutation.mutate({ id: project.id, episodeNumbers })}
                isPublishing={publishingId === project.id}
                onViewContent={setViewContent}
                t={(key: string) => t(key as Parameters<typeof t>[0])}
                tc={(key: string) => tc(key as Parameters<typeof tc>[0])}
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
          await triggerAction(
            autoMode
              ? `/api/agent-projects/${id}/auto`
              : `/api/agent-projects/${id}/analyze`,
          );
        }}
        t={(key: string) => t(key as Parameters<typeof t>[0])}
        tc={(key: string) => tc(key as Parameters<typeof tc>[0])}
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
