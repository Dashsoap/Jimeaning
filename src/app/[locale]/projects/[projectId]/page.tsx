"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Image,
  LayoutPanelTop,
  Mic,
  Film,
} from "lucide-react";

const TABS = [
  { key: "script", icon: FileText },
  { key: "assets", icon: Image },
  { key: "storyboard", icon: LayoutPanelTop },
  { key: "voice", icon: Mic },
  { key: "compose", icon: Film },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProjectWorkspacePage() {
  const t = useTranslations("project");
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";
  const [activeTab, setActiveTab] = useState<TabKey>("script");

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold mb-4">{project?.title}</h1>

        {/* Tab Bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
          {TABS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon size={16} />
              {t(`tabs.${key}` as "tabs.script" | "tabs.assets" | "tabs.storyboard" | "tabs.voice" | "tabs.compose")}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "script" && (
            <ScriptTab project={project} locale={locale} />
          )}
          {activeTab === "assets" && <AssetsTab project={project} />}
          {activeTab === "storyboard" && <StoryboardTab project={project} />}
          {activeTab === "voice" && <VoiceTab project={project} />}
          {activeTab === "compose" && <ComposeTab project={project} />}
        </div>
      </div>
    </AppShell>
  );
}

// Placeholder tab components — will be fleshed out in Phase 3-5
function ScriptTab({ project, locale }: { project: { id: string; sourceText?: string }; locale: string }) {
  const [text, setText] = useState(project?.sourceText || "");

  return (
    <div className="space-y-4">
      <textarea
        className="w-full h-80 rounded-lg border border-gray-300 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700"
        placeholder="粘贴小说/剧本文本..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={async () => {
            await fetch(`/api/projects/${project.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sourceText: text }),
            });
          }}
        >
          保存文本
        </button>
        <button
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          onClick={() => {
            fetch(`/api/projects/${project.id}/analyze`, { method: "POST" });
          }}
        >
          AI 分析剧本
        </button>
      </div>
    </div>
  );
}

function AssetsTab({ project }: { project: { characters?: unknown[]; locations?: unknown[] } }) {
  return (
    <div className="text-gray-500 text-center py-12">
      <Image size={48} className="mx-auto mb-4 text-gray-300" />
      <p>角色 ({project?.characters?.length ?? 0}) / 场景 ({project?.locations?.length ?? 0})</p>
      <p className="text-sm mt-2">AI 分析剧本后自动提取</p>
    </div>
  );
}

function StoryboardTab({ project }: { project: { episodes?: unknown[] } }) {
  return (
    <div className="text-gray-500 text-center py-12">
      <LayoutPanelTop size={48} className="mx-auto mb-4 text-gray-300" />
      <p>分镜面板</p>
      <p className="text-sm mt-2">剧本分析完成后生成分镜</p>
    </div>
  );
}

function VoiceTab({ project }: { project: unknown }) {
  return (
    <div className="text-gray-500 text-center py-12">
      <Mic size={48} className="mx-auto mb-4 text-gray-300" />
      <p>配音管理</p>
      <p className="text-sm mt-2">为角色对白生成配音</p>
    </div>
  );
}

function ComposeTab({ project }: { project: unknown }) {
  return (
    <div className="text-gray-500 text-center py-12">
      <Film size={48} className="mx-auto mb-4 text-gray-300" />
      <p>视频合成</p>
      <p className="text-sm mt-2">合成最终视频（视频+配音+字幕+BGM）</p>
    </div>
  );
}
