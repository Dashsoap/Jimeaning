"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  LayoutPanelTop,
  Sparkles,
  ImageIcon,
  Film,
  Loader2,
  ChevronDown,
  ChevronRight,
  Camera,
  Eye,
  X,
  RefreshCw,
  Download,
  Link2,
  Check,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { PanelActionMenu } from "@/components/task/PanelActionMenu";
import { AiModifyPromptDialog } from "@/components/task/AiModifyPromptDialog";
import { ShotVariantsPanel } from "@/components/task/ShotVariantsPanel";
import type { ProjectData, EpisodeData, PanelData } from "./types";

interface StoryboardTabProps {
  project: ProjectData;
}

const SCENE_TYPE_COLORS: Record<string, string> = {
  daily: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  emotion: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
  action: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  epic: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  suspense: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export function StoryboardTab({ project }: StoryboardTabProps) {
  const episodes = project.episodes || [];
  const [storyboardTaskId, setStoryboardTaskId] = useState<string | null>(null);
  const [imageTaskIds, setImageTaskIds] = useState<string[] | null>(null);
  const [videoTaskIds, setVideoTaskIds] = useState<string[] | null>(null);
  const [candidateCount, setCandidateCount] = useState(1);
  const queryClient = useQueryClient();

  const totalPanels = episodes.reduce(
    (sum, ep) => sum + ep.clips.reduce((s, c) => s + c.panels.length, 0),
    0,
  );
  const panelsWithImages = episodes.reduce(
    (sum, ep) =>
      sum +
      ep.clips.reduce(
        (s, c) => s + c.panels.filter((p) => p.imageUrl).length,
        0,
      ),
    0,
  );
  const panelsWithVideos = episodes.reduce(
    (sum, ep) =>
      sum +
      ep.clips.reduce(
        (s, c) => s + c.panels.filter((p) => p.videoUrl).length,
        0,
      ),
    0,
  );

  const refreshProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  }, [queryClient, project.id]);

  // Storyboard generation polling
  const {
    isRunning: isGeneratingStoryboard,
    progressPercent: storyboardProgress,
  } = useTaskPolling(storyboardTaskId, {
    onComplete: useCallback(() => {
      toast.success("分镜文本生成完成！");
      setStoryboardTaskId(null);
      refreshProject();
    }, [refreshProject]),
    onFailed: useCallback((error: string) => {
      toast.error(`分镜生成失败: ${error}`);
      setStoryboardTaskId(null);
    }, []),
  });

  // Image generation
  const { isRunning: isGeneratingImages } = useTaskPolling(
    imageTaskIds?.[0] ?? null,
    {
      interval: 3000,
      onComplete: useCallback(() => {
        toast.success("图片生成任务完成（部分）");
        refreshProject();
      }, [refreshProject]),
      onFailed: useCallback(() => {
        refreshProject();
      }, [refreshProject]),
    },
  );

  // Video generation
  const { isRunning: isGeneratingVideos } = useTaskPolling(
    videoTaskIds?.[0] ?? null,
    {
      interval: 3000,
      onComplete: useCallback(() => {
        toast.success("视频生成任务完成（部分）");
        refreshProject();
      }, [refreshProject]),
      onFailed: useCallback(() => {
        refreshProject();
      }, [refreshProject]),
    },
  );

  if (episodes.length === 0) {
    return (
      <div className="text-center py-16">
        <LayoutPanelTop className="h-12 w-12 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">暂无分镜</p>
        <p className="text-sm text-gray-400 mt-1">
          请先在「剧本」标签页分析文本
        </p>
      </div>
    );
  }

  const handleGenerateStoryboard = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/storyboard`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const { taskId } = await res.json();
      setStoryboardTaskId(taskId);
      toast.success("分镜生成任务已提交");
    } catch {
      toast.error("提交失败");
    }
  };

  const handleGenerateImages = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "image", candidateCount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const data = await res.json();
      setImageTaskIds(data.taskIds);
      toast.success(`已提交 ${data.count} 个图片生成任务`);
    } catch {
      toast.error("提交失败");
    }
  };

  const handleGenerateVideos = async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "video" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const data = await res.json();
      setVideoTaskIds(data.taskIds);
      toast.success(`已提交 ${data.count} 个视频生成任务`);
    } catch {
      toast.error("提交失败");
    }
  };

  return (
    <div className="space-y-4">
      {/* Progress Banners */}
      {isGeneratingStoryboard && (
        <ProgressBanner
          title="正在生成分镜文本（4阶段流水线）..."
          progress={storyboardProgress}
          icon={Sparkles}
        />
      )}
      {isGeneratingImages && (
        <ProgressBanner
          title="正在生成图片..."
          subtitle={`${imageTaskIds?.length || 0} 个任务进行中${candidateCount > 1 ? `（每张 ${candidateCount} 候选）` : ""}`}
          icon={ImageIcon}
        />
      )}
      {isGeneratingVideos && (
        <ProgressBanner
          title="正在生成视频..."
          subtitle={`${videoTaskIds?.length || 0} 个任务进行中`}
          icon={Film}
        />
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleGenerateStoryboard}
          disabled={isGeneratingStoryboard}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isGeneratingStoryboard ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          生成分镜文本
        </button>

        {/* Image generation with candidate count selector */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleGenerateImages}
            disabled={isGeneratingImages || totalPanels === 0}
            className="inline-flex items-center gap-2 rounded-lg rounded-r-none bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isGeneratingImages ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            生成图片
          </button>
          <select
            value={candidateCount}
            onChange={(e) => setCandidateCount(Number(e.target.value))}
            className="h-[38px] rounded-lg rounded-l-none border-l border-emerald-700 bg-emerald-600 px-2 text-sm text-white hover:bg-emerald-700 cursor-pointer"
            title="候选数量"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>

        <button
          onClick={handleGenerateVideos}
          disabled={isGeneratingVideos || panelsWithImages === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {isGeneratingVideos ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          生成视频
        </button>
        <button
          onClick={refreshProject}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          刷新
        </button>
        {panelsWithImages > 0 && (
          <button
            onClick={async () => {
              try {
                const res = await fetch(
                  `/api/projects/${project.id}/download?type=images`,
                );
                if (!res.ok) {
                  toast.error("无可下载内容");
                  return;
                }
                const data = await res.json();
                for (const item of data.items.slice(0, 20)) {
                  const a = document.createElement("a");
                  a.href = item.url;
                  a.download = item.filename;
                  a.target = "_blank";
                  a.click();
                }
                toast.success(
                  `开始下载 ${Math.min(data.items.length, 20)} 张图片`,
                );
              } catch {
                toast.error("下载失败");
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            下载图片
          </button>
        )}

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span>{totalPanels} 面板</span>
          <span className="text-emerald-500">{panelsWithImages} 图片</span>
          <span className="text-violet-500">{panelsWithVideos} 视频</span>
        </div>
      </div>

      {/* Episodes */}
      {episodes.map((episode) => (
        <EpisodeSection
          key={episode.id}
          episode={episode}
          projectId={project.id}
        />
      ))}
    </div>
  );
}

// ─── Progress Banner ──────────────────────────────────────────────────────

function ProgressBanner({
  title,
  subtitle,
  progress,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  progress?: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
        <Icon className="h-4 w-4 text-blue-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {title}
          </p>
          {subtitle && <p className="text-xs text-blue-500">{subtitle}</p>}
        </div>
        {progress !== undefined && (
          <span className="text-xs text-blue-500">{progress}%</span>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-blue-200 dark:bg-blue-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-700"
            style={{ width: `${Math.max(progress, 3)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Episode Section ──────────────────────────────────────────────────────

function EpisodeSection({
  episode,
  projectId,
}: {
  episode: EpisodeData;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const clipCount = episode.clips.length;
  const panelCount = episode.clips.reduce((s, c) => s + c.panels.length, 0);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        )}
        <span className="font-semibold text-sm flex-1">{episode.title}</span>
        <span className="text-xs text-gray-400">
          {clipCount} 片段 · {panelCount} 面板
        </span>
        <StatusBadge status={episode.status} />
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4">
          {episode.clips.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-4">
              暂无片段，请先生成分镜文本
            </p>
          ) : (
            <div className="space-y-4">
              {episode.clips.map((clip) => (
                <div key={clip.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500">
                      {clip.title || `片段 ${clip.sortOrder + 1}`}
                    </span>
                    {clip.dialogue && (
                      <span className="text-xs text-gray-400 truncate max-w-xs">
                        — {clip.dialogue}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {clip.panels.map((panel, panelIndex) => (
                      <PanelCard
                        key={panel.id}
                        panel={panel}
                        projectId={projectId}
                        nextPanel={clip.panels[panelIndex + 1] || null}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panel Card ───────────────────────────────────────────────────────────

function PanelCard({
  panel,
  projectId,
  nextPanel,
}: {
  panel: PanelData;
  projectId: string;
  nextPanel: PanelData | null;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [regenerating, setRegenerating] = useState<"image" | "video" | null>(
    null,
  );
  const [showModifyPrompt, setShowModifyPrompt] = useState(false);
  const [showShotVariants, setShowShotVariants] = useState(false);
  const queryClient = useQueryClient();

  const refreshProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  }, [queryClient, projectId]);

  // Parse candidate images
  const candidates: string[] = panel.candidateImages
    ? (() => {
        try {
          return JSON.parse(panel.candidateImages);
        } catch {
          return [];
        }
      })()
    : [];

  const handleRegenerate = async (
    type: "image" | "video",
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setRegenerating(type);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/panels/${panel.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        setRegenerating(null);
        return;
      }
      const { taskId } = await res.json();
      toast.success(
        type === "image" ? "图片重新生成中..." : "视频重新生成中...",
      );
      pollTask(taskId, async () => {
        await queryClient.refetchQueries({
          queryKey: ["project", projectId],
        });
        setRegenerating(null);
      });
    } catch {
      toast.error("提交失败");
      setRegenerating(null);
    }
  };

  const handleSelectCandidate = async (
    index: number,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    try {
      const res = await fetch(
        `/api/projects/${projectId}/panels/${panel.id}/select-candidate`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedIndex: index }),
        },
      );
      if (!res.ok) {
        toast.error("选择失败");
        return;
      }
      toast.success("已切换图片");
      refreshProject();
    } catch {
      toast.error("选择失败");
    }
  };

  const handleToggleFirstLastFrame = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMode =
      panel.videoGenerationMode === "firstlastframe"
        ? "normal"
        : "firstlastframe";
    try {
      const res = await fetch(
        `/api/projects/${projectId}/panels/${panel.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoGenerationMode: newMode }),
        },
      );
      if (!res.ok) {
        toast.error("更新失败");
        return;
      }
      refreshProject();
    } catch {
      toast.error("更新失败");
    }
  };

  return (
    <>
      <div className="space-y-1">
        <div
          className={cn(
            "group relative rounded-lg border overflow-hidden cursor-pointer transition-all hover:shadow-md",
            panel.imageUrl
              ? "border-gray-200 dark:border-gray-700"
              : "border-dashed border-gray-300 dark:border-gray-600",
          )}
          onClick={() => {
            if (panel.imageUrl || panel.videoUrl) setShowPreview(true);
          }}
        >
          {panel.imageUrl ? (
            <div className="aspect-[9/16] bg-gray-100 dark:bg-gray-800 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={panel.imageUrl}
                alt={panel.sceneDescription || "Panel"}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-[9/16] bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
              {regenerating === "image" ? (
                <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
              ) : (
                <ImageIcon className="h-6 w-6 text-gray-300 dark:text-gray-600" />
              )}
            </div>
          )}

          {/* Status badges */}
          <div className="absolute top-1 right-1 flex gap-1">
            {regenerating && (
              <span className="rounded bg-blue-500/90 p-0.5">
                <Loader2 className="h-3 w-3 text-white animate-spin" />
              </span>
            )}
            {panel.videoUrl && (
              <span className="rounded bg-violet-500/90 p-0.5">
                <Film className="h-3 w-3 text-white" />
              </span>
            )}
            {panel.sceneType && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[8px] font-medium",
                  SCENE_TYPE_COLORS[panel.sceneType] || SCENE_TYPE_COLORS.daily,
                )}
              >
                {panel.sceneType}
              </span>
            )}
            {panel.cameraAngle && (
              <span className="rounded bg-black/50 p-0.5">
                <Camera className="h-3 w-3 text-white" />
              </span>
            )}
          </div>

          {/* First-last-frame link indicator */}
          {panel.videoGenerationMode === "firstlastframe" && nextPanel && (
            <div className="absolute top-1 left-1">
              <span className="rounded bg-cyan-500/90 p-0.5">
                <Link2 className="h-3 w-3 text-white" />
              </span>
            </div>
          )}

          {/* Hover overlay with action buttons */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            {(panel.imageUrl || panel.videoUrl) && (
              <button
                className="rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPreview(true);
                }}
                title="预览"
              >
                <Eye className="h-4 w-4 text-white" />
              </button>
            )}
            <button
              className="rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors disabled:opacity-50"
              onClick={(e) => handleRegenerate("image", e)}
              disabled={regenerating !== null}
              title={panel.imageUrl ? "重新生成图片" : "生成图片"}
            >
              {regenerating === "image" ? (
                <Loader2 className="h-4 w-4 text-white animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 text-white" />
              )}
            </button>
            {panel.imageUrl && (
              <button
                className="rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors disabled:opacity-50"
                onClick={(e) => handleRegenerate("video", e)}
                disabled={regenerating !== null}
                title={panel.videoUrl ? "重新生成视频" : "生成视频"}
              >
                {regenerating === "video" ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : (
                  <Film className="h-4 w-4 text-white" />
                )}
              </button>
            )}
            {/* Info button for details panel */}
            {(panel.videoPrompt || panel.photographyRules || panel.actingNotes) && (
              <button
                className="rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(!showDetails);
                }}
                title="查看详情"
              >
                <Info className="h-4 w-4 text-white" />
              </button>
            )}
            {/* First-last-frame link button */}
            {nextPanel && nextPanel.imageUrl && panel.imageUrl && (
              <button
                className={cn(
                  "rounded-full p-1.5 transition-colors",
                  panel.videoGenerationMode === "firstlastframe"
                    ? "bg-cyan-500/80 hover:bg-cyan-500"
                    : "bg-white/20 hover:bg-white/40",
                )}
                onClick={handleToggleFirstLastFrame}
                title={
                  panel.videoGenerationMode === "firstlastframe"
                    ? "取消首尾帧链接"
                    : "链接下一帧（首尾帧模式）"
                }
              >
                <Link2 className="h-4 w-4 text-white" />
              </button>
            )}
            <PanelActionMenu
              hasImage={!!panel.imageUrl}
              onModifyPrompt={() => setShowModifyPrompt(true)}
              onAnalyzeShots={() => setShowShotVariants(true)}
              onGenerateVariant={() => setShowShotVariants(true)}
              onDuplicate={async () => {
                try {
                  const res = await fetch(
                    `/api/projects/${projectId}/panels/${panel.id}/duplicate`,
                    { method: "POST" },
                  );
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.error || "复制失败");
                    return;
                  }
                  toast.success("面板已复制");
                  refreshProject();
                } catch {
                  toast.error("复制失败");
                }
              }}
              onDelete={async () => {
                if (!confirm("确定删除此面板？")) return;
                try {
                  const res = await fetch(
                    `/api/projects/${projectId}/panels/${panel.id}`,
                    { method: "DELETE" },
                  );
                  if (!res.ok) {
                    toast.error("删除失败");
                    return;
                  }
                  toast.success("面板已删除");
                  refreshProject();
                } catch {
                  toast.error("删除失败");
                }
              }}
            />
          </div>

          <div className="p-1.5">
            <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight">
              {panel.sceneDescription || "等待生成..."}
            </p>
            {panel.voiceLines.length > 0 && (
              <p className="text-[10px] text-blue-500 mt-0.5 truncate">
                🎙 {panel.voiceLines[0].text}
              </p>
            )}
          </div>
        </div>

        {/* Candidate images thumbnail strip */}
        {candidates.length > 1 && (
          <div className="flex gap-1">
            {candidates.map((url, idx) => (
              <button
                key={idx}
                onClick={(e) => handleSelectCandidate(idx, e)}
                className={cn(
                  "relative flex-1 aspect-square rounded overflow-hidden border-2 transition-all",
                  idx === (panel.selectedImageIndex ?? 0)
                    ? "border-blue-500 ring-1 ring-blue-500"
                    : "border-transparent hover:border-gray-300 dark:hover:border-gray-600",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`候选 ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                {idx === (panel.selectedImageIndex ?? 0) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-blue-500/30">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details popup */}
      {showDetails && (
        <PanelDetailsPopup
          panel={panel}
          onClose={() => setShowDetails(false)}
        />
      )}

      {/* Preview modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setShowPreview(false)}
        >
          <button
            className="absolute top-4 right-4 rounded-full bg-white/20 p-2 hover:bg-white/30"
            onClick={() => setShowPreview(false)}
          >
            <X className="h-5 w-5 text-white" />
          </button>
          <div
            className="max-w-2xl max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {panel.videoUrl ? (
              <video
                src={panel.videoUrl}
                controls
                autoPlay
                className="max-h-[80vh] rounded-lg"
              />
            ) : panel.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={panel.imageUrl}
                alt=""
                className="max-h-[80vh] rounded-lg"
              />
            ) : null}
            {panel.sceneDescription && (
              <p className="text-sm text-white/80 mt-3 text-center max-w-lg mx-auto">
                {panel.sceneDescription}
              </p>
            )}
            {panel.videoPrompt && (
              <p className="text-xs text-cyan-300/70 mt-1 text-center max-w-lg mx-auto">
                视频: {panel.videoPrompt}
              </p>
            )}
          </div>
        </div>
      )}

      {showModifyPrompt && (
        <AiModifyPromptDialog
          panelId={panel.id}
          currentPrompt={panel.imagePrompt || panel.sceneDescription || ""}
          projectId={projectId}
          onClose={() => setShowModifyPrompt(false)}
          onSuccess={refreshProject}
        />
      )}

      {showShotVariants && (
        <ShotVariantsPanel
          panelId={panel.id}
          projectId={projectId}
          onClose={() => setShowShotVariants(false)}
          onSelectVariant={async (variant) => {
            setShowShotVariants(false);
            try {
              const res = await fetch(
                `/api/projects/${projectId}/panel-variant`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    panelId: panel.id,
                    variant: {
                      description: variant.description,
                      shot_type: variant.shot_type,
                      camera_move: variant.camera_move,
                    },
                  }),
                },
              );
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || "生成变体失败");
                return;
              }
              toast.success("变体生成中...");
              const { taskId } = await res.json();
              pollTask(taskId, refreshProject);
            } catch {
              toast.error("提交失败");
            }
          }}
        />
      )}
    </>
  );
}

// ─── Panel Details Popup ──────────────────────────────────────────────────

function PanelDetailsPopup({
  panel,
  onClose,
}: {
  panel: PanelData;
  onClose: () => void;
}) {
  let photographyData = null;
  if (panel.photographyRules) {
    try {
      photographyData = JSON.parse(panel.photographyRules);
    } catch {
      /* ignore */
    }
  }

  let actingData = null;
  if (panel.actingNotes) {
    try {
      actingData = JSON.parse(panel.actingNotes);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">面板详情</h3>
          <button onClick={onClose}>
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {panel.sceneType && (
          <div>
            <span className="text-[10px] text-gray-400 uppercase">场景类型</span>
            <p
              className={cn(
                "inline-block ml-2 rounded px-1.5 py-0.5 text-xs font-medium",
                SCENE_TYPE_COLORS[panel.sceneType] || "",
              )}
            >
              {panel.sceneType}
            </p>
          </div>
        )}

        {panel.sourceText && (
          <div>
            <span className="text-[10px] text-gray-400 uppercase">原文片段</span>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 bg-gray-50 dark:bg-gray-800 rounded p-2">
              {panel.sourceText}
            </p>
          </div>
        )}

        {panel.videoPrompt && (
          <div>
            <span className="text-[10px] text-gray-400 uppercase">
              视频提示词
            </span>
            <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">
              {panel.videoPrompt}
            </p>
          </div>
        )}

        {photographyData && (
          <div>
            <span className="text-[10px] text-gray-400 uppercase">摄影规则</span>
            <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 space-y-1">
              {photographyData.lighting && (
                <p>
                  灯光:{" "}
                  {typeof photographyData.lighting === "string"
                    ? photographyData.lighting
                    : `${photographyData.lighting.direction || ""} ${photographyData.lighting.quality || ""}`}
                </p>
              )}
              {photographyData.depthOfField && (
                <p>景深: {photographyData.depthOfField}</p>
              )}
              {photographyData.colorTone && (
                <p>色调: {photographyData.colorTone}</p>
              )}
            </div>
          </div>
        )}

        {actingData && Array.isArray(actingData) && actingData.length > 0 && (
          <div>
            <span className="text-[10px] text-gray-400 uppercase">表演指导</span>
            <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 space-y-1">
              {actingData.map(
                (a: { name: string; acting: string }, i: number) => (
                  <p key={i}>
                    <span className="font-medium">{a.name}:</span> {a.acting}
                  </p>
                ),
              )}
            </div>
          </div>
        )}

        {panel.imagePrompt && (
          <div>
            <span className="text-[10px] text-gray-400 uppercase">
              图片提示词
            </span>
            <p className="text-xs text-gray-500 mt-0.5">{panel.imagePrompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple polling helper for single-panel regeneration
function pollTask(taskId: string, onDone: () => void | Promise<void>) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) {
        clearInterval(interval);
        await onDone();
        return;
      }
      const task = await res.json();
      if (task.status === "completed") {
        clearInterval(interval);
        toast.success("生成完成");
        await onDone();
      } else if (task.status === "failed") {
        clearInterval(interval);
        toast.error(task.error || "生成失败");
        await onDone();
      }
    } catch {
      clearInterval(interval);
      await onDone();
    }
  }, 3000);
}

// ─── Status Badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    draft: {
      label: "草稿",
      color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    },
    storyboarded: {
      label: "已分镜",
      color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    },
    generating: {
      label: "生成中",
      color:
        "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
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
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}
