"use client";

/**
 * Canvas page — tldraw infinite canvas view for project workflow.
 * Left sidebar switches tools based on active stage (like anime-ai-studio ChatPanel).
 */

import { useCallback, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useEditor } from "@tldraw/editor";
import type { Editor } from "@tldraw/editor";
import "tldraw/tldraw.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ImageIcon,
  Film,
  Download,
  RefreshCw,
  Loader2,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
  Users,
  MapPin,
  FileText,
  Clapperboard,
} from "lucide-react";

const Tldraw = dynamic(() => import("tldraw").then((mod) => mod.Tldraw), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
    </div>
  ),
});
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { CanvasStage } from "@/lib/canvas/types";
import {
  navigateToStage,
  addStageBackgrounds,
  renderAllStages,
} from "@/lib/canvas/service";
import type { CanvasProjectData } from "@/lib/canvas/service";

// ─── Stage definitions for nav bar ──────────────────────────────────────────

const STAGES: Array<{ id: CanvasStage; label: string; icon: string }> = [
  { id: "script", label: "Script", icon: "📝" },
  { id: "assets", label: "Assets", icon: "🎨" },
  { id: "storyboard", label: "Storyboard", icon: "🎬" },
  { id: "voice", label: "Voice", icon: "🎙️" },
  { id: "compose", label: "Compose", icon: "🎥" },
];

const STAGE_CONFIG: Record<CanvasStage, { title: string; icon: string; greeting: string }> = {
  script: {
    title: "编剧工具",
    icon: "✍️",
    greeting: "管理剧本文本、分析角色和场景，为分镜做准备。",
  },
  assets: {
    title: "美术工具",
    icon: "🎨",
    greeting: "管理角色和场景资产，生成参考图片。",
  },
  storyboard: {
    title: "分镜工具",
    icon: "🎬",
    greeting: "生成分镜文本，批量生成关键帧图片。",
  },
  voice: {
    title: "配音工具",
    icon: "🎙️",
    greeting: "为角色台词生成语音配音。",
  },
  compose: {
    title: "导演工具",
    icon: "🎥",
    greeting: "批量生成视频，下载和导出最终成片。",
  },
};

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

function KeyboardShortcutsHandler() {
  const editor = useEditor();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        editor.redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  return null;
}

// ─── Stage completion detection ─────────────────────────────────────────────

function isStageCompleted(data: CanvasProjectData, stage: CanvasStage): boolean {
  switch (stage) {
    case "script":
      return !!data.project.sourceText;
    case "assets":
      return data.characters.length > 0 || data.locations.length > 0;
    case "storyboard":
      return data.episodes.some((ep) =>
        ep.clips.some((c) => c.panels.length > 0),
      );
    case "voice":
      return data.episodes.some((ep) =>
        ep.clips.some((c) =>
          c.panels.some((p) => p.voiceLines.some((vl) => vl.audioUrl)),
        ),
      );
    case "compose":
      return data.episodes.some((ep) =>
        ep.clips.some((c) => c.panels.some((p) => p.videoUrl)),
      );
  }
}

// ─── Stats calculator ───────────────────────────────────────────────────────

function getProjectStats(data: CanvasProjectData) {
  let totalPanels = 0;
  let withImage = 0;
  let withVideo = 0;
  let withVoice = 0;
  let totalVoiceLines = 0;
  let voiceLinesWithAudio = 0;

  for (const ep of data.episodes) {
    for (const clip of ep.clips) {
      for (const panel of clip.panels) {
        totalPanels++;
        if (panel.imageUrl) withImage++;
        if (panel.videoUrl) withVideo++;
        if (panel.voiceLines.some((vl) => vl.audioUrl)) withVoice++;
        for (const vl of panel.voiceLines) {
          totalVoiceLines++;
          if (vl.audioUrl) voiceLinesWithAudio++;
        }
      }
    }
  }

  return {
    totalPanels, withImage, withVideo, withVoice,
    totalVoiceLines, voiceLinesWithAudio,
    characters: data.characters.length,
    locations: data.locations.length,
    charsWithImage: data.characters.filter((c) => c.imageUrl).length,
    locsWithImage: data.locations.filter((l) => l.imageUrl).length,
    episodes: data.episodes.length,
    clips: data.episodes.reduce((s, ep) => s + ep.clips.length, 0),
  };
}

// ─── Stage-Aware Sidebar ────────────────────────────────────────────────────

function StageSidebar({
  projectId,
  data,
  activeStage,
  onRefresh,
}: {
  projectId: string;
  data: CanvasProjectData | undefined;
  activeStage: CanvasStage;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [candidateCount, setCandidateCount] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);

  const stats = data ? getProjectStats(data) : null;
  const config = STAGE_CONFIG[activeStage];

  const apiCall = async (label: string, url: string, opts?: RequestInit) => {
    setLoading(label);
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "操作失败");
        return null;
      }
      return await res.json();
    } catch {
      toast.error("操作失败");
      return null;
    } finally {
      setLoading(null);
    }
  };

  const handleDownload = async (type: "images" | "videos") => {
    const d = await apiCall("download", `/api/projects/${projectId}/download?type=${type}`);
    if (!d) return;
    const limit = type === "images" ? 20 : 10;
    for (const item of d.items.slice(0, limit)) {
      const a = document.createElement("a");
      a.href = item.url;
      a.download = item.filename;
      a.target = "_blank";
      a.click();
    }
    toast.success(`开始下载 ${Math.min(d.items.length, limit)} 个${type === "images" ? "图片" : "视频"}`);
  };

  if (collapsed) {
    return (
      <div className="w-10 shrink-0 border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] flex flex-col items-center pt-3">
        <button
          onClick={() => setCollapsed(false)}
          className="cursor-pointer p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] transition-colors"
          title="展开工具面板"
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border-default)]">
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">
          {config.icon} {config.title}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="cursor-pointer p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] transition-colors"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Greeting */}
        <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed bg-white rounded-[var(--radius-md)] p-2.5 border border-[var(--color-border-light)]">
          {config.greeting}
        </p>

        {/* ── SCRIPT STAGE ─────────────────────────────────────── */}
        {activeStage === "script" && (
          <>
            {stats && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">概览</div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard value={stats.episodes} label="集数" color="text-indigo-600" />
                  <StatCard value={stats.clips} label="片段" color="text-[var(--color-accent)]" />
                  <StatCard value={stats.characters} label="角色" color="text-pink-600" />
                  <StatCard value={stats.locations} label="场景" color="text-emerald-600" />
                </div>
              </div>
            )}

            {data?.project.sourceText && (
              <div className="text-[10px] text-[var(--color-text-tertiary)]">
                剧本长度: {data.project.sourceText.length.toLocaleString()} 字
              </div>
            )}

            <ActionButton
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="生成分镜文本"
              color="bg-[var(--color-accent)] hover:bg-[var(--color-btn-primary-hover)]"
              loading={loading === "storyboard"}
              disabled={!stats || stats.clips === 0}
              onClick={async () => {
                const d = await apiCall("storyboard", `/api/projects/${projectId}/storyboard`, { method: "POST" });
                if (d) toast.success("分镜生成任务已提交");
              }}
            />

            {stats && stats.clips === 0 && (
              <Hint text="请先在项目页面添加剧本文本和创建集/片段。" />
            )}
          </>
        )}

        {/* ── ASSETS STAGE ─────────────────────────────────────── */}
        {activeStage === "assets" && (
          <>
            {stats && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">资产统计</div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard value={stats.characters} label="角色" color="text-pink-600" icon={<Users className="h-3 w-3" />} />
                  <StatCard value={stats.charsWithImage} label="角色图" color="text-pink-500" />
                  <StatCard value={stats.locations} label="场景" color="text-emerald-600" icon={<MapPin className="h-3 w-3" />} />
                  <StatCard value={stats.locsWithImage} label="场景图" color="text-emerald-500" />
                </div>

                {stats.characters > 0 && (
                  <ProgressBar
                    label="角色图进度"
                    current={stats.charsWithImage}
                    total={stats.characters}
                    color="bg-pink-500"
                  />
                )}
                {stats.locations > 0 && (
                  <ProgressBar
                    label="场景图进度"
                    current={stats.locsWithImage}
                    total={stats.locations}
                    color="bg-emerald-500"
                  />
                )}
              </div>
            )}

            {stats && stats.characters === 0 && stats.locations === 0 && (
              <Hint text="请先在项目页面「资产」标签创建角色和场景。" />
            )}
          </>
        )}

        {/* ── STORYBOARD STAGE ─────────────────────────────────── */}
        {activeStage === "storyboard" && (
          <>
            {stats && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">分镜统计</div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard value={stats.totalPanels} label="总镜头" color="text-[var(--color-text-primary)]" />
                  <StatCard value={stats.withImage} label="已生成图" color="text-emerald-600" />
                </div>

                {stats.totalPanels > 0 && (
                  <ProgressBar
                    label="关键帧进度"
                    current={stats.withImage}
                    total={stats.totalPanels}
                    color="bg-emerald-500"
                  />
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">生成</div>

              <ActionButton
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="生成分镜文本"
                color="bg-[var(--color-accent)] hover:bg-[var(--color-btn-primary-hover)]"
                loading={loading === "storyboard"}
                onClick={async () => {
                  const d = await apiCall("storyboard", `/api/projects/${projectId}/storyboard`, { method: "POST" });
                  if (d) toast.success("分镜生成任务已提交");
                }}
              />

              <div className="flex gap-1">
                <ActionButton
                  icon={<ImageIcon className="h-3.5 w-3.5" />}
                  label="批量生成图片"
                  color="bg-emerald-600 hover:bg-emerald-700 rounded-r-none"
                  loading={loading === "images"}
                  disabled={!stats || stats.totalPanels === 0}
                  onClick={async () => {
                    const d = await apiCall("images", `/api/projects/${projectId}/generate`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "image", candidateCount }),
                    });
                    if (d) toast.success(`已提交 ${d.count} 个图片生成任务`);
                  }}
                />
                <select
                  value={candidateCount}
                  onChange={(e) => setCandidateCount(Number(e.target.value))}
                  className="h-auto rounded-[var(--radius-md)] rounded-l-none border-l border-emerald-700 bg-emerald-600 px-1.5 text-xs text-white hover:bg-emerald-700 cursor-pointer"
                  title="候选数量"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
            </div>

            {stats && stats.totalPanels === 0 && (
              <Hint text="请先生成分镜文本，再生成关键帧图片。" />
            )}

            {stats && stats.withImage > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">下载</div>
                <ActionButton
                  icon={<Download className="h-3.5 w-3.5" />}
                  label={`下载图片 (${stats.withImage})`}
                  color="bg-white border border-[var(--color-border-default)] !text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                  onClick={() => handleDownload("images")}
                />
              </div>
            )}
          </>
        )}

        {/* ── VOICE STAGE ──────────────────────────────────────── */}
        {activeStage === "voice" && (
          <>
            {stats && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">配音统计</div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard value={stats.totalVoiceLines} label="总台词" color="text-[var(--color-text-primary)]" />
                  <StatCard value={stats.voiceLinesWithAudio} label="已配音" color="text-orange-600" />
                </div>

                {stats.totalVoiceLines > 0 && (
                  <ProgressBar
                    label="配音进度"
                    current={stats.voiceLinesWithAudio}
                    total={stats.totalVoiceLines}
                    color="bg-orange-500"
                  />
                )}
              </div>
            )}

            <ActionButton
              icon={<Mic className="h-3.5 w-3.5" />}
              label="批量生成配音"
              color="bg-orange-600 hover:bg-orange-700"
              loading={loading === "voice"}
              disabled={!stats || stats.totalVoiceLines === 0}
              onClick={async () => {
                const d = await apiCall("voice", `/api/projects/${projectId}/voice/generate-all`, { method: "POST" });
                if (d) toast.success(`已提交配音生成任务`);
              }}
            />

            {stats && stats.totalVoiceLines === 0 && (
              <Hint text="暂无台词，请先生成分镜文本。" />
            )}
          </>
        )}

        {/* ── COMPOSE STAGE ────────────────────────────────────── */}
        {activeStage === "compose" && (
          <>
            {stats && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">导演统计</div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard value={stats.totalPanels} label="总镜头" color="text-[var(--color-text-primary)]" />
                  <StatCard value={stats.withImage} label="关键帧" color="text-emerald-600" />
                  <StatCard value={stats.withVideo} label="已生成视频" color="text-violet-600" />
                  <StatCard value={stats.withVoice} label="已配音" color="text-orange-600" />
                </div>

                {stats.totalPanels > 0 && (
                  <ProgressBar
                    label="视频进度"
                    current={stats.withVideo}
                    total={stats.totalPanels}
                    color="bg-violet-500"
                  />
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">生成</div>

              <ActionButton
                icon={<Film className="h-3.5 w-3.5" />}
                label="批量生成视频"
                color="bg-violet-600 hover:bg-violet-700"
                loading={loading === "videos"}
                disabled={!stats || stats.withImage === 0}
                suffix={stats && stats.withImage > 0 ? `${stats.withImage - stats.withVideo} 待生成` : undefined}
                onClick={async () => {
                  const d = await apiCall("videos", `/api/projects/${projectId}/generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "video" }),
                  });
                  if (d) toast.success(`已提交 ${d.count} 个视频生成任务`);
                }}
              />
            </div>

            {stats && stats.withImage === 0 && (
              <Hint text="请先在分镜阶段生成关键帧图片，再生成视频。" />
            )}

            {stats && (stats.withImage > 0 || stats.withVideo > 0) && (
              <div className="space-y-2">
                <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">下载</div>
                {stats.withImage > 0 && (
                  <ActionButton
                    icon={<Download className="h-3.5 w-3.5" />}
                    label={`下载图片 (${stats.withImage})`}
                    color="bg-white border border-[var(--color-border-default)] !text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                    onClick={() => handleDownload("images")}
                  />
                )}
                {stats.withVideo > 0 && (
                  <ActionButton
                    icon={<Download className="h-3.5 w-3.5" />}
                    label={`下载视频 (${stats.withVideo})`}
                    color="bg-white border border-[var(--color-border-default)] !text-violet-600 hover:bg-[var(--color-bg-secondary)]"
                    onClick={() => handleDownload("videos")}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Refresh — always shown */}
        <ActionButton
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          label="刷新数据"
          color="bg-white border border-[var(--color-border-default)] !text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
          onClick={onRefresh}
        />
      </div>
    </div>
  );
}

// ─── Shared UI components ───────────────────────────────────────────────────

function StatCard({
  value,
  label,
  color,
  icon,
}: {
  value: number;
  label: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-[var(--radius-md)] p-2 text-center">
      <div className={cn("text-lg font-bold", color)}>
        {icon && <span className="inline-block mr-0.5 align-middle">{icon}</span>}
        {value}
      </div>
      <div className="text-[10px] text-[var(--color-text-tertiary)]">{label}</div>
    </div>
  );
}

function ProgressBar({
  label,
  current,
  total,
  color,
}: {
  label: string;
  current: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-[var(--color-text-tertiary)] mb-1">
        <span>{label}</span>
        <span>{current}/{total} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-bg-surface)] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  color,
  loading,
  disabled,
  suffix,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  loading?: boolean;
  disabled?: boolean;
  suffix?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        "cursor-pointer w-full flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50 transition-colors",
        color,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
      {suffix && <span className="ml-auto text-white/70 text-[10px]">{suffix}</span>}
    </button>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <p className="text-[10px] text-[var(--color-warning)] bg-[var(--color-warning-bg)] rounded-[var(--radius-md)] p-2">
      {text}
    </p>
  );
}

// ─── Main Canvas Page ───────────────────────────────────────────────────────

export default function CanvasPage() {
  const t = useTranslations("project");
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";
  const queryClient = useQueryClient();

  const [activeStage, setActiveStage] = useState<CanvasStage>("script");
  const [editorRef, setEditorRef] = useState<Editor | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastDataHashRef = useRef("");

  // Fetch project data
  const { data: projectData } = useQuery<CanvasProjectData>({
    queryKey: ["canvas-project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}?include=full`);
      const project = await res.json();

      return {
        project: {
          name: project.title,
          sourceText: project.sourceText,
          style: project.style,
        },
        characters: project.characters || [],
        locations: project.locations || [],
        episodes: (project.episodes || []).map(
          (ep: Record<string, unknown>) => ({
            id: ep.id,
            title: ep.title,
            sortOrder: ep.sortOrder,
            clips: ((ep.clips as Array<Record<string, unknown>>) || []).map(
              (c) => ({
                id: c.id,
                dialogue: c.dialogue,
                sortOrder: c.sortOrder,
                panels: ((c.panels as Array<Record<string, unknown>>) || []).map(
                  (p) => ({
                    id: p.id,
                    sceneDescription: p.sceneDescription,
                    imageUrl: p.imageUrl,
                    videoUrl: p.videoUrl,
                    shotType: p.shotType,
                    cameraAngle: p.cameraAngle,
                    durationMs: (p.durationMs as number) || 3000,
                    sortOrder: p.sortOrder,
                    characterIds: p.characterIds,
                    locationId: p.locationId,
                    voiceLines: (p.voiceLines as Array<Record<string, unknown>>) || [],
                  }),
                ),
              }),
            ),
          }),
        ),
      } satisfies CanvasProjectData;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["canvas-project", projectId] });
  }, [queryClient, projectId]);

  const handleMount = useCallback(
    (editor: Editor) => {
      setEditorRef(editor);
      addStageBackgrounds(editor);
      navigateToStage(editor, activeStage);
      setIsInitialized(true);
    },
    [activeStage],
  );

  useEffect(() => {
    if (editorRef && isInitialized) {
      navigateToStage(editorRef, activeStage);
    }
  }, [editorRef, activeStage, isInitialized]);

  useEffect(() => {
    if (!editorRef || !isInitialized || !projectData) return;

    const hash = JSON.stringify(projectData);
    if (hash === lastDataHashRef.current) return;
    lastDataHashRef.current = hash;

    renderAllStages(editorRef, projectData);
  }, [editorRef, isInitialized, projectData]);

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border-default)] bg-white z-10">
        <button
          onClick={() => router.push(`/${locale}/projects/${projectId}`)}
          className="cursor-pointer rounded-[var(--radius-md)] p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          title={t("back")}
        >
          <ArrowLeft size={18} />
        </button>

        <span className="text-sm font-medium text-[var(--color-text-primary)] mr-4">
          {projectData?.project.name || "..."}
        </span>

        <nav className="flex items-center gap-1">
          {STAGES.map((stage, index) => {
            const completed = projectData
              ? isStageCompleted(projectData, stage.id)
              : false;
            const isActive = activeStage === stage.id;

            return (
              <div key={stage.id} className="relative flex items-center">
                <button
                  onClick={() => setActiveStage(stage.id)}
                  className={cn(
                    "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-sm transition-all",
                    isActive && "bg-[var(--color-accent-bg)]",
                    completed && !isActive && "bg-[var(--color-success-bg)]",
                    !completed && !isActive && "opacity-60",
                  )}
                >
                  {completed && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-success)] text-white text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                  <span>{stage.icon}</span>
                  <span
                    className={cn(
                      "text-xs",
                      isActive && "text-[var(--color-accent)] font-medium",
                      completed && !isActive && "text-[var(--color-success)]",
                      !completed && !isActive && "text-[var(--color-text-secondary)]",
                    )}
                  >
                    {stage.label}
                  </span>
                </button>
                {index < STAGES.length - 1 && (
                  <span
                    className={cn(
                      "text-xs mx-0.5",
                      completed ? "text-[var(--color-success)]" : "text-[var(--color-text-tertiary)]",
                    )}
                  >
                    →
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        <button
          onClick={() => router.push(`/${locale}/projects/${projectId}`)}
          className="cursor-pointer text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2 py-1 rounded hover:bg-[var(--color-bg-secondary)] transition-colors"
        >
          Card View
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <StageSidebar
          projectId={projectId}
          data={projectData}
          activeStage={activeStage}
          onRefresh={handleRefresh}
        />
        <div className="flex-1 relative">
          <Tldraw onMount={handleMount} hideUi>
            <KeyboardShortcutsHandler />
          </Tldraw>
        </div>
      </div>
    </div>
  );
}
