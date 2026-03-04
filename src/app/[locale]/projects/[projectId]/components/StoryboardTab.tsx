"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectData, EpisodeData, PanelData } from "./types";

interface StoryboardTabProps {
  project: ProjectData;
}

export function StoryboardTab({ project }: StoryboardTabProps) {
  const episodes = project.episodes || [];
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const queryClient = useQueryClient();

  const totalPanels = episodes.reduce(
    (sum, ep) => sum + ep.clips.reduce((s, c) => s + c.panels.length, 0),
    0
  );
  const panelsWithImages = episodes.reduce(
    (sum, ep) =>
      sum + ep.clips.reduce((s, c) => s + c.panels.filter((p) => p.imageUrl).length, 0),
    0
  );
  const panelsWithVideos = episodes.reduce(
    (sum, ep) =>
      sum + ep.clips.reduce((s, c) => s + c.panels.filter((p) => p.videoUrl).length, 0),
    0
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
    setGeneratingStoryboard(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/storyboard`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
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
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "image" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`已提交 ${data.count} 个图片生成任务`);
    } catch {
      toast.error("提交失败");
    } finally {
      setGeneratingImages(false);
    }
  };

  const handleGenerateVideos = async () => {
    setGeneratingVideos(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "video" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`已提交 ${data.count} 个视频生成任务`);
    } catch {
      toast.error("提交失败");
    } finally {
      setGeneratingVideos(false);
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  };

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleGenerateStoryboard}
          disabled={generatingStoryboard}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {generatingStoryboard ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          生成分镜文本
        </button>
        <button
          onClick={handleGenerateImages}
          disabled={generatingImages || totalPanels === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {generatingImages ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          生成图片
        </button>
        <button
          onClick={handleGenerateVideos}
          disabled={generatingVideos || panelsWithImages === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {generatingVideos ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          生成视频
        </button>
        <button
          onClick={refresh}
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
        <EpisodeSection key={episode.id} episode={episode} />
      ))}
    </div>
  );
}

// ─── Episode Section ──────────────────────────────────────────────────────

function EpisodeSection({ episode }: { episode: EpisodeData }) {
  const [expanded, setExpanded] = useState(true);
  const clipCount = episode.clips.length;
  const panelCount = episode.clips.reduce((s, c) => s + c.panels.length, 0);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Episode Header */}
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

      {/* Panels Grid */}
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
                  {/* Clip Header */}
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
                  {/* Panels */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {clip.panels.map((panel) => (
                      <PanelCard key={panel.id} panel={panel} />
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

function PanelCard({ panel }: { panel: PanelData }) {
  const [showPreview, setShowPreview] = useState(false);

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
        {/* Media Preview */}
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
            <ImageIcon className="h-6 w-6 text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Overlay Icons */}
        <div className="absolute top-1 right-1 flex gap-1">
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

        {/* Hover overlay */}
        {(panel.imageUrl || panel.videoUrl) && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}

        {/* Scene Description */}
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

      {/* Preview Modal */}
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
