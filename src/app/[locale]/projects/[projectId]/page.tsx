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
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
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
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
            title={t("back")}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <ProjectStatusBadge status={project.status} />
          <div className="flex-1" />
          <button
            onClick={() => router.push(`/${locale}/projects/${projectId}/canvas`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
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
        <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
          {TABS.map(({ key, icon: Icon }) => {
            const status = getTabStatus(project, key);
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key as TabKey)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative",
                  activeTab === key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
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
                  <span className="w-2 h-2 rounded-full bg-green-500" />
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
        className="rounded-lg p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg z-50 py-1">
          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <Copy size={14} />
            {duplicating ? t("duplicating") : t("duplicateProject")}
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 size={14} />
              {t("delete")}
            </button>
          ) : (
            <div className="px-3 py-2 space-y-2">
              <p className="text-xs text-red-600 dark:text-red-400">
                {t("deleteConfirm", { title: projectTitle })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                >
                  {t("delete")}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
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
      color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
    },
    analyzing: {
      label: "分析中",
      color:
        "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    },
    ready: {
      label: "就绪",
      color:
        "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    },
    generating: {
      label: "生成中",
      color:
        "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
    },
    completed: {
      label: "完成",
      color:
        "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
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
