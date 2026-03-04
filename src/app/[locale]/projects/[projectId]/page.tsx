"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Image as ImageIcon,
  LayoutPanelTop,
  Mic,
  Film,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

export default function ProjectWorkspacePage() {
  const t = useTranslations("project");
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("script");

  const { data: project, isLoading } = useQuery<ProjectData>({
    queryKey: ["project", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then((r) => r.json()),
    refetchInterval: 30000, // Auto-refresh every 30s to pick up task results
  });

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
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as TabKey)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon size={16} />
              {t(
                `tabs.${key}` as
                  | "tabs.script"
                  | "tabs.assets"
                  | "tabs.storyboard"
                  | "tabs.voice"
                  | "tabs.compose"
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "script" && <ScriptTab project={project} onSwitchTab={(tab) => setActiveTab(tab as TabKey)} />}
          {activeTab === "assets" && <AssetsTab project={project} />}
          {activeTab === "storyboard" && <StoryboardTab project={project} />}
          {activeTab === "voice" && <VoiceTab project={project} />}
          {activeTab === "compose" && <ComposeTab project={project} />}
        </div>
      </div>

      {/* Task Progress Toasts (SSE) */}
      <TaskProgressPanel projectId={projectId} />
    </AppShell>
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
