"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Image as ImageIcon,
  LayoutPanelTop,
  Mic,
  Film,
  Loader2,
  ArrowLeft,
  MoreHorizontal,
  Copy,
  Trash2,
  LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import toast from "react-hot-toast";

import { ScriptTab } from "./components/ScriptTab";
import { AssetsTab } from "./components/AssetsTab";
import { StoryboardTab } from "./components/StoryboardTab";
import { VoiceTab } from "./components/VoiceTab";
import { ComposeTab } from "./components/ComposeTab";
import { TaskProgressPanel } from "./components/TaskProgressPanel";
import type { ProjectData } from "./components/types";

const TABS: Array<{ key: string; icon: LucideIcon }> = [
  { key: "script", icon: FileText },
  { key: "assets", icon: ImageIcon },
  { key: "storyboard", icon: LayoutPanelTop },
  { key: "voice", icon: Mic },
  { key: "compose", icon: Film },
];

type TabKey = "script" | "assets" | "storyboard" | "voice" | "compose";

function getTabStatus(
  project: ProjectData,
  tab: string,
): "empty" | "ready" {
  switch (tab) {
    case "script":
      return project.sourceText && project.status !== "draft"
        ? "ready"
        : "empty";
    case "assets":
      return (project.characters?.length ?? 0) > 0 || (project.locations?.length ?? 0) > 0
        ? "ready"
        : "empty";
    case "storyboard":
      return (project.episodes ?? []).some((ep) =>
        ep.clips.some((c) => c.panels.length > 0),
      )
        ? "ready"
        : "empty";
    case "voice":
      return (project.episodes ?? []).some((ep) =>
        ep.clips.some((c) =>
          c.panels.some((p) => p.voiceLines.some((vl) => vl.audioUrl)),
        ),
      )
        ? "ready"
        : "empty";
    case "compose":
      return (project.episodes ?? []).some((ep) => ep.composition?.outputUrl)
        ? "ready"
        : "empty";
    default:
      return "empty";
  }
}

export default function ProjectWorkspacePage() {
  const t = useTranslations("project");
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("script");

  const { data: project, isLoading } = useQuery<ProjectData>({
    queryKey: ["project", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then((r) => r.json()),
    refetchInterval: 30000,
  });
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";

  if (isLoading || !project) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl">
        {/* Project Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.push(`/${locale}/projects`)}
            className="cursor-pointer rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] transition-colors"
            title={t("back")}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <ProjectStatusBadge status={project.status} />
          <div className="flex-1" />
          <button
            onClick={() => router.push(`/${locale}/projects/${projectId}/canvas`)}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-bg)] rounded-[var(--radius-md)] transition-colors"
            title="Canvas View"
          >
            <LayoutDashboard size={16} />
            <span className="hidden sm:inline">Canvas</span>
          </button>
          <MoreActionsMenu
            projectId={projectId}
            projectTitle={project.title}
            locale={locale}
            t={t}
            router={router}
          />
        </div>

        {/* Tab Bar with Status Dots */}
        <div className="flex border-b border-[var(--color-border-default)] mb-6">
          {TABS.map(({ key, icon: Icon }) => {
            const status = getTabStatus(project, key);
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key as TabKey)}
                className={cn(
                  "cursor-pointer flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative",
                  activeTab === key
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]",
                )}
              >
                <Icon size={16} />
                {t(
                  `tabs.${key}` as
                    | "tabs.script"
                    | "tabs.assets"
                    | "tabs.storyboard"
                    | "tabs.voice"
                    | "tabs.compose",
                )}
                {status === "ready" && (
                  <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "script" && (
            <ScriptTab
              project={project}
              onSwitchTab={(tab) => setActiveTab(tab as TabKey)}
            />
          )}
          {activeTab === "assets" && <AssetsTab project={project} onSwitchTab={(tab) => setActiveTab(tab as TabKey)} />}
          {activeTab === "storyboard" && <StoryboardTab project={project} />}
          {activeTab === "voice" && <VoiceTab project={project} onSwitchTab={(tab) => setActiveTab(tab as TabKey)} />}
          {activeTab === "compose" && <ComposeTab project={project} onSwitchTab={(tab) => setActiveTab(tab as TabKey)} />}
        </div>
      </div>

      {/* Task Progress Toasts (SSE) */}
      <TaskProgressPanel projectId={projectId} />
    </AppShell>
  );
}

// ─── More Actions Dropdown ──────────────────────────────────────────────────

function MoreActionsMenu({
  projectId,
  projectTitle,
  locale,
  t,
  router,
}: {
  projectId: string;
  projectTitle: string;
  locale: string;
  t: ReturnType<typeof useTranslations<"project">>;
  router: ReturnType<typeof useRouter>;
}) {
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowDeleteConfirm(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error(t("duplicateFailed"));
        return;
      }
      const data = await res.json();
      toast.success(t("duplicateSuccess"));
      router.push(`/${locale}/projects/${data.id}`);
    } catch {
      toast.error(t("duplicateFailed"));
    } finally {
      setDuplicating(false);
      setOpen(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("deleteFailed"));
        return;
      }
      toast.success(t("deleteSuccess"));
      router.push(`/${locale}/projects`);
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-[var(--radius-md)] p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] transition-colors"
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white shadow-lg z-50 py-1">
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
          >
            <Copy size={14} />
            {duplicating ? t("duplicating") : t("duplicateProject")}
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-error)] hover:bg-[var(--color-error-bg)]"
            >
              <Trash2 size={14} />
              {t("delete")}
            </button>
          ) : (
            <div className="px-3 py-2 space-y-2">
              <p className="text-xs text-[var(--color-error)]">
                {t("deleteConfirm", { title: projectTitle })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="cursor-pointer flex-1 rounded bg-[var(--color-error)] px-2 py-1 text-xs text-white hover:opacity-90"
                >
                  {t("delete")}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="cursor-pointer flex-1 rounded bg-[var(--color-bg-surface)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Project Status Badge ─────────────────────────────────────────────────

function ProjectStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    draft: {
      label: "草稿",
      color: "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]",
    },
    analyzing: {
      label: "分析中",
      color: "bg-amber-100 text-amber-600",
    },
    ready: {
      label: "就绪",
      color: "bg-[var(--color-accent-bg)] text-[var(--color-accent)]",
    },
    generating: {
      label: "生成中",
      color: "bg-violet-100 text-violet-600",
    },
    completed: {
      label: "完成",
      color: "bg-green-100 text-green-600",
    },
  };
  const cfg = config[status] || config.draft;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}
