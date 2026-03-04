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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import type { ProjectData, EpisodeData, PanelData } from "./types";

interface StoryboardTabProps {
  project: ProjectData;
}

export function StoryboardTab({ project }: StoryboardTabProps) {
  const episodes = project.episodes || [];
  const [storyboardTaskId, setStoryboardTaskId] = useState<string | null>(null);
  const [imageTaskIds, setImageTaskIds] = useState<string[] | null>(null);
  const [videoTaskIds, setVideoTaskIds] = useState<string[] | null>(null);
  const queryClient = useQueryClient();

  const totalPanels = episodes.reduce(
    (sum, ep) => sum + ep.clips.reduce((s, c) => s + c.panels.length, 0),
    0
  );
  const panelsWithImages = episodes.reduce(
    (sum, ep) =>
      sum +
      ep.clips.reduce(
        (s, c) => s + c.panels.filter((p) => p.imageUrl).length,
        0
      ),
    0
  );
  const panelsWithVideos = episodes.reduce(
    (sum, ep) =>
      sum +
      ep.clips.reduce(
        (s, c) => s + c.panels.filter((p) => p.videoUrl).length,
        0
      ),
    0
  );

  const refreshProject = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  }, [queryClient, project.id]);

  // Storyboard generation polling
  const { isRunning: isGeneratingStoryboard, progressPercent: storyboardProgress } =
    useTaskPolling(storyboardTaskId, {
      onComplete: useCallback(() => {
        toast.success("分镜文本生成完成！");
        setStoryboardTaskId(null);
        refreshProject();
      }, [refreshProject]),
      onFailed: useCallback(
        (error: string) => {
          toast.error(`分镜生成失败: ${error}`);
          setStoryboardTaskId(null);
        },
        []
      ),
    });

  // Image generation - poll the first task as indicator
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
    }
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
    }
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
        body: JSON.stringify({ type: "image" }),
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
      {/* Progress Banner */}
      {isGeneratingStoryboard && (
        <ProgressBanner
          title="正在生成分镜文本..."
          progress={storyboardProgress}
          icon={Sparkles}
        />
      )}
      {isGeneratingImages && (
        <ProgressBanner
          title="正在生成图片..."
          subtitle={`${imageTaskIds?.length || 0} 个任务进行中`}
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
        <button
          onClick={handleGenerateImages}
          disabled={isGeneratingImages || totalPanels === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {isGeneratingImages ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          生成图片
        </button>
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

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span>{totalPanels} 面板</span>
          <span className="text-emerald-500">{panelsWithImages} 图片</span>
          <span className="text-violet-500">{panelsWithVideos} 视频</span>
        </div>
      </div>

      {/* Episodes */}
      {episodes.map((episode) => (
        <EpisodeSection key={episode.id} episode={episode} projectId={project.id} />
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
          {subtitle && (
            <p className="text-xs text-blue-500">{subtitle}</p>
          )}
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

function EpisodeSection({ episode, projectId }: { episode: EpisodeData; projectId: string }) {
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
                    {clip.panels.map((panel) => (
                      <PanelCard key={panel.id} panel={panel} projectId={projectId} />
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

function PanelCard({ panel, projectId }: { panel: PanelData; projectId: string }) {
  const [showPreview, setShowPreview] = useState(false);
  const [regenerating, setRegenerating] = useState<"image" | "video" | null>(null);
  const queryClient = useQueryClient();

  const handleRegenerate = async (type: "image" | "video", e: React.MouseEvent) => {
    e.stopPropagation();
    setRegenerating(type);
    try {
      const res = await fetch(`/api/projects/${projectId}/panels/${panel.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        setRegenerating(null);
        return;
      }
      const { taskId } = await res.json();
      toast.success(type === "image" ? "图片重新生成中..." : "视频重新生成中...");
      pollTask(taskId, async () => {
        await queryClient.refetchQueries({ queryKey: ["project", projectId] });
        setRegenerating(null);
      });
    } catch {
      toast.error("提交失败");
      setRegenerating(null);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group relative rounded-lg border overflow-hidden cursor-pointer transition-all hover:shadow-md",
          panel.imageUrl
            ? "border-gray-200 dark:border-gray-700"
            : "border-dashed border-gray-300 dark:border-gray-600"
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
          {panel.cameraAngle && (
            <span className="rounded bg-black/50 p-0.5">
              <Camera className="h-3 w-3 text-white" />
            </span>
          )}
        </div>

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
          </div>
        </div>
      )}
    </>
  );
}

// Simple polling helper for single-panel regeneration
function pollTask(taskId: string, onDone: () => void | Promise<void>) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) { clearInterval(interval); await onDone(); return; }
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
      color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    },
    completed: {
      label: "完成",
      color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
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
