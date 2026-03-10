"use client";

/**
 * Canvas page — tldraw infinite canvas view for project workflow.
 * Adapted from anime-ai-studio CanvasPanel.tsx + MainLayout.tsx stage nav.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { Tldraw } from "tldraw";
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
} from "lucide-react";
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

// ─── Keyboard shortcuts (undo/redo since hideUi disables them) ──────────────

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

  for (const ep of data.episodes) {
    for (const clip of ep.clips) {
      for (const panel of clip.panels) {
        totalPanels++;
        if (panel.imageUrl) withImage++;
        if (panel.videoUrl) withVideo++;
        if (panel.voiceLines.some((vl) => vl.audioUrl)) withVoice++;
      }
    }
  }

  return { totalPanels, withImage, withVideo, withVoice };
}

// ─── Director Panel (left sidebar) ──────────────────────────────────────────

function DirectorPanel({
  projectId,
  data,
  onRefresh,
}: {
  projectId: string;
  data: CanvasProjectData | undefined;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [candidateCount, setCandidateCount] = useState(1);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);

  const stats = data ? getProjectStats(data) : null;
  const progressPct = stats && stats.totalPanels > 0
    ? Math.round((stats.withVideo / stats.totalPanels) * 100)
    : 0;

  const handleGenerateStoryboard = async () => {
    setGeneratingStoryboard(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      toast.success("分镜生成任务已提交");
    } catch {
      toast.error("提交失败");
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  const handleGenerateImages = async () => {
    setGeneratingImages(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "image", candidateCount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const d = await res.json();
      toast.success(`已提交 ${d.count} 个图片生成任务`);
    } catch {
      toast.error("提交失败");
    } finally {
      setGeneratingImages(false);
    }
  };

  const handleGenerateVideos = async () => {
    setGeneratingVideos(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "video" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const d = await res.json();
      toast.success(`已提交 ${d.count} 个视频生成任务`);
    } catch {
      toast.error("提交失败");
    } finally {
      setGeneratingVideos(false);
    }
  };

  const handleDownload = async (type: "images" | "videos") => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/download?type=${type}`,
      );
      if (!res.ok) {
        toast.error("无可下载内容");
        return;
      }
      const d = await res.json();
      const limit = type === "images" ? 20 : 10;
      for (const item of d.items.slice(0, limit)) {
        const a = document.createElement("a");
        a.href = item.url;
        a.download = item.filename;
        a.target = "_blank";
        a.click();
      }
      toast.success(`开始下载 ${Math.min(d.items.length, limit)} 个${type === "images" ? "图片" : "视频"}`);
    } catch {
      toast.error("下载失败");
    }
  };

  if (collapsed) {
    return (
      <div className="w-10 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col items-center pt-3">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="展开导演工具"
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          导演工具
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="收起"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Stats */}
        {stats && (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">统计</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.totalPanels}</div>
                <div className="text-[10px] text-gray-400">总镜头</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-emerald-600">{stats.withImage}</div>
                <div className="text-[10px] text-gray-400">已生成图</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-violet-600">{stats.withVideo}</div>
                <div className="text-[10px] text-gray-400">已生成视频</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-blue-600">{stats.withVoice}</div>
                <div className="text-[10px] text-gray-400">已配音</div>
              </div>
            </div>

            {/* Progress bar */}
            {stats.totalPanels > 0 && (
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>视频进度</span>
                  <span>{stats.withVideo}/{stats.totalPanels} ({progressPct}%)</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-500"
                    style={{ width: `${Math.max(progressPct, 2)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generation Controls */}
        <div className="space-y-2">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">生成</div>

          {/* Storyboard */}
          <button
            onClick={handleGenerateStoryboard}
            disabled={generatingStoryboard}
            className="w-full flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {generatingStoryboard ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            生成分镜文本
          </button>

          {/* Images with candidate count */}
          <div className="flex gap-1">
            <button
              onClick={handleGenerateImages}
              disabled={generatingImages || !stats || stats.totalPanels === 0}
              className="flex-1 flex items-center gap-2 rounded-lg rounded-r-none bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {generatingImages ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              批量生成图片
            </button>
            <select
              value={candidateCount}
              onChange={(e) => setCandidateCount(Number(e.target.value))}
              className="h-auto rounded-lg rounded-l-none border-l border-emerald-700 bg-emerald-600 px-1.5 text-xs text-white hover:bg-emerald-700 cursor-pointer"
              title="候选数量"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>

          {/* Videos */}
          <button
            onClick={handleGenerateVideos}
            disabled={generatingVideos || !stats || stats.withImage === 0}
            className="w-full flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {generatingVideos ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Film className="h-3.5 w-3.5" />
            )}
            批量生成视频
            {stats && stats.withImage > 0 && (
              <span className="ml-auto text-white/70">
                {stats.withImage - stats.withVideo} 待生成
              </span>
            )}
          </button>
        </div>

        {/* Download */}
        {stats && (stats.withImage > 0 || stats.withVideo > 0) && (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">下载</div>

            {stats.withImage > 0 && (
              <button
                onClick={() => handleDownload("images")}
                className="w-full flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                下载图片 ({stats.withImage})
              </button>
            )}

            {stats.withVideo > 0 && (
              <button
                onClick={() => handleDownload("videos")}
                className="w-full flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-violet-600 dark:text-violet-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                下载视频 ({stats.withVideo})
              </button>
            )}
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="w-full flex items-center gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新数据
        </button>

        {/* Hint */}
        {stats && stats.totalPanels === 0 && (
          <p className="text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
            请先生成分镜文本，再进行图片和视频生成。
          </p>
        )}
        {stats && stats.totalPanels > 0 && stats.withImage === 0 && (
          <p className="text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
            请先生成关键帧图片，再生成视频。
          </p>
        )}
      </div>
    </div>
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

      // Transform API response to CanvasProjectData shape
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
    refetchInterval: 15000,
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["canvas-project", projectId] });
  }, [queryClient, projectId]);

  // tldraw mount handler
  const handleMount = useCallback(
    (editor: Editor) => {
      setEditorRef(editor);
      addStageBackgrounds(editor);
      navigateToStage(editor, activeStage);
      setIsInitialized(true);
    },
    [activeStage],
  );

  // Navigate when stage changes
  useEffect(() => {
    if (editorRef && isInitialized) {
      navigateToStage(editorRef, activeStage);
    }
  }, [editorRef, activeStage, isInitialized]);

  // Render data when it changes
  useEffect(() => {
    if (!editorRef || !isInitialized || !projectData) return;

    const hash = JSON.stringify(projectData);
    if (hash === lastDataHashRef.current) return;
    lastDataHashRef.current = hash;

    renderAllStages(editorRef, projectData);
  }, [editorRef, isInitialized, projectData]);

  const handleStageChange = (stage: CanvasStage) => {
    setActiveStage(stage);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-gray-950">
      {/* Top bar: back + stage nav */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 z-10">
        <button
          onClick={() => router.push(`/${locale}/projects/${projectId}`)}
          className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
          title={t("back")}
        >
          <ArrowLeft size={18} />
        </button>

        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-4">
          {projectData?.project.name || "..."}
        </span>

        {/* Stage Nav */}
        <nav className="flex items-center gap-1">
          {STAGES.map((stage, index) => {
            const completed = projectData
              ? isStageCompleted(projectData, stage.id)
              : false;
            const isActive = activeStage === stage.id;

            return (
              <div key={stage.id} className="relative flex items-center">
                <button
                  onClick={() => handleStageChange(stage.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all",
                    isActive && "bg-blue-50 dark:bg-blue-900/30",
                    completed && !isActive && "bg-green-50 dark:bg-green-900/20",
                    !completed && !isActive && "opacity-60",
                  )}
                >
                  {completed && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[10px] font-bold">
                      ✓
                    </span>
                  )}
                  <span>{stage.icon}</span>
                  <span
                    className={cn(
                      "text-xs",
                      isActive && "text-blue-600 dark:text-blue-400 font-medium",
                      completed && !isActive && "text-green-600 dark:text-green-400",
                      !completed && !isActive && "text-gray-500",
                    )}
                  >
                    {stage.label}
                  </span>
                </button>
                {index < STAGES.length - 1 && (
                  <span
                    className={cn(
                      "text-xs mx-0.5",
                      completed ? "text-green-400" : "text-gray-300",
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
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          Card View
        </button>
      </div>

      {/* Body: Director Panel + Canvas */}
      <div className="flex-1 flex overflow-hidden">
        <DirectorPanel
          projectId={projectId}
          data={projectData}
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
