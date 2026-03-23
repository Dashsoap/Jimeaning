"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Play,
  X,
  RefreshCw,
  Download,
  Link2,
  Check,
  CheckCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { PanelActionMenu } from "@/components/task/PanelActionMenu";
import { AiModifyPromptDialog } from "@/components/task/AiModifyPromptDialog";
import { ShotVariantsPanel } from "@/components/task/ShotVariantsPanel";
import { PanelAssetPicker } from "./PanelAssetPicker";
import type { ProjectData, EpisodeData, PanelData, CharacterData, LocationData } from "./types";

interface StoryboardTabProps {
  project: ProjectData;
}

const SCENE_TYPE_COLORS: Record<string, string> = {
  daily: "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
  emotion: "bg-pink-100 text-pink-600",
  action: "bg-orange-100 text-orange-600",
  epic: "bg-[var(--color-accent-bg)] text-[var(--color-accent)]",
  suspense: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
};

export function StoryboardTab({ project }: StoryboardTabProps) {
  const episodes = project.episodes || [];
  const [storyboardTaskId, setStoryboardTaskId] = useState<string | null>(null);
  const [imageTaskIds, setImageTaskIds] = useState<string[] | null>(null);
  const [videoTaskIds, setVideoTaskIds] = useState<string[] | null>(null);
  const [candidateCount, setCandidateCount] = useState(1);
  const [panelTaskMap, setPanelTaskMap] = useState<Record<string, { taskId: string; type: "image" | "video" }>>({});
  const [selectedImageModel, setSelectedImageModel] = useState("");
  const [selectedVideoModel, setSelectedVideoModel] = useState("");
  const queryClient = useQueryClient();

  // Fetch available models for the dropdowns
  const { data: apiConfig } = useQuery<{
    models: { modelId: string; name: string; type: string; provider: string; enabled: boolean }[];
  }>({
    queryKey: ["api-config"],
    queryFn: () => fetch("/api/user/api-config").then((r) => r.json()),
    staleTime: 60_000,
  });
  const imageModels = apiConfig?.models?.filter((m) => m.type === "image" && m.enabled) || [];
  const videoModels = apiConfig?.models?.filter((m) => m.type === "video" && m.enabled) || [];

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
        toast.success("视频生成完成！请及时下载保存，链接可能会过期", {
          duration: 8000,
          icon: "🎬",
        });
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
        <LayoutPanelTop className="h-12 w-12 text-[var(--color-border-default)] mx-auto mb-4" />
        <p className="text-[var(--color-text-secondary)] font-medium">暂无分镜</p>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
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
    // Confirmation for large batches
    const pendingCount = totalPanels - panelsWithImages;
    const modelLabel = selectedImageModel
      ? imageModels.find((m) => `${m.provider}::${m.modelId}` === selectedImageModel)?.name || selectedImageModel
      : "默认模型";

    // Ask if user wants to force regenerate existing images
    let forceRegenerate = false;
    if (panelsWithImages > 0 && pendingCount < totalPanels) {
      forceRegenerate = window.confirm(
        `已有 ${panelsWithImages} 张图片。\n\n点"确定"=全部重新生成（${totalPanels}张）\n点"取消"=只生成缺少的（${pendingCount}张）`,
      );
    }
    const generateCount = forceRegenerate ? totalPanels : pendingCount;
    if (generateCount > 20) {
      const ok = window.confirm(`即将生成 ${generateCount} 张图片（模型: ${modelLabel}，每张 ${candidateCount} 候选），确认？`);
      if (!ok) return;
    }
    try {
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "image",
          candidateCount,
          ...(selectedImageModel && { imageModel: selectedImageModel }),
          ...(forceRegenerate && { forceRegenerate: true }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const data = await res.json();
      setImageTaskIds(data.taskIds);
      if (data.taskMap) {
        const map: Record<string, { taskId: string; type: "image" | "video" }> = {};
        for (const [panelId, taskId] of Object.entries(data.taskMap)) {
          map[panelId] = { taskId: taskId as string, type: "image" };
        }
        setPanelTaskMap((prev) => ({ ...prev, ...map }));
      }
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
        body: JSON.stringify({
          type: "video",
          ...(selectedVideoModel && { videoModel: selectedVideoModel }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const data = await res.json();
      setVideoTaskIds(data.taskIds);
      if (data.taskMap) {
        const map: Record<string, { taskId: string; type: "image" | "video" }> = {};
        for (const [panelId, taskId] of Object.entries(data.taskMap)) {
          map[panelId] = { taskId: taskId as string, type: "video" };
        }
        setPanelTaskMap((prev) => ({ ...prev, ...map }));
      }
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
          className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-btn-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-btn-primary-hover)] disabled:opacity-50 transition-colors"
        >
          {isGeneratingStoryboard ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          生成分镜文本
        </button>

        {/* Image generation with model selector + candidate count */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleGenerateImages}
            disabled={isGeneratingImages || totalPanels === 0}
            className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] rounded-r-none bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isGeneratingImages ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            生成图片
          </button>
          {imageModels.length > 0 && (
            <select
              value={selectedImageModel}
              onChange={(e) => setSelectedImageModel(e.target.value)}
              className="h-[38px] border-l border-emerald-700 bg-emerald-600 px-2 text-sm text-white hover:bg-emerald-700 cursor-pointer max-w-[120px]"
              title="选择图片模型"
            >
              <option value="">默认</option>
              {imageModels.map((m) => (
                <option key={`${m.provider}::${m.modelId}`} value={`${m.provider}::${m.modelId}`}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={candidateCount}
            onChange={(e) => setCandidateCount(Number(e.target.value))}
            className="h-[38px] rounded-[var(--radius-md)] rounded-l-none border-l border-emerald-700 bg-emerald-600 px-2 text-sm text-white hover:bg-emerald-700 cursor-pointer"
            title="候选数量"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleGenerateVideos}
            disabled={isGeneratingVideos || panelsWithImages === 0}
            className={cn(
              "cursor-pointer inline-flex items-center gap-2 bg-[var(--color-btn-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-btn-primary-hover)] disabled:opacity-50 transition-colors",
              videoModels.length > 1
                ? "rounded-[var(--radius-md)] rounded-r-none"
                : "rounded-[var(--radius-md)]",
            )}
          >
            {isGeneratingVideos ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Film className="h-4 w-4" />
            )}
            生成视频
          </button>
          {videoModels.length > 1 && (
            <select
              value={selectedVideoModel}
              onChange={(e) => setSelectedVideoModel(e.target.value)}
              className="h-[38px] rounded-[var(--radius-md)] rounded-l-none border-l border-[var(--color-btn-primary-hover)] bg-[var(--color-btn-primary)] px-2 text-sm text-white hover:bg-[var(--color-btn-primary-hover)] cursor-pointer max-w-[120px]"
              title="选择视频模型"
            >
              <option value="">默认</option>
              {videoModels.map((m) => (
                <option key={`${m.provider}::${m.modelId}`} value={`${m.provider}::${m.modelId}`}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={refreshProject}
          className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:opacity-80 transition-colors"
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
            className="cursor-pointer inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:opacity-80 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            下载图片
          </button>
        )}
        {panelsWithVideos > 0 && (
          <button
            onClick={async () => {
              try {
                const res = await fetch(
                  `/api/projects/${project.id}/download?type=videos`,
                );
                if (!res.ok) {
                  toast.error("无可下载内容");
                  return;
                }
                const data = await res.json();
                let downloadCount = 0;
                for (const item of data.items.slice(0, 10)) {
                  const a = document.createElement("a");
                  a.href = item.url;
                  a.download = item.filename;
                  a.target = "_blank";
                  a.click();
                  downloadCount++;
                }
                if (downloadCount > 0) {
                  toast.success(`开始下载 ${downloadCount} 个视频`);
                } else {
                  toast.error("没有可下载的视频");
                }
              } catch {
                toast.error("下载失败");
              }
            }}
            className="cursor-pointer inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-accent-bg)] px-3 py-2 text-sm text-[var(--color-accent)] hover:opacity-80 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            下载视频
          </button>
        )}

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
          <span>{totalPanels} 面板</span>
          <span className="text-emerald-500">{panelsWithImages} 图片</span>
          <span className="text-[var(--color-accent)]">{panelsWithVideos} 视频</span>
        </div>
      </div>

      {/* Episodes */}
      {episodes.map((episode) => (
        <EpisodeSection
          key={episode.id}
          episode={episode}
          projectId={project.id}
          characters={project.characters || []}
          locations={project.locations || []}
          panelTaskMap={panelTaskMap}
          onPanelTaskDone={(panelId) => {
            setPanelTaskMap((prev) => {
              const next = { ...prev };
              delete next[panelId];
              return next;
            });
            refreshProject();
          }}
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
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-accent)] bg-[var(--color-accent-bg)] p-3">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 text-[var(--color-accent)] animate-spin shrink-0" />
        <Icon className="h-4 w-4 text-[var(--color-accent)] shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--color-accent)]">
            {title}
          </p>
          {subtitle && <p className="text-xs text-[var(--color-accent)]">{subtitle}</p>}
        </div>
        {progress !== undefined && (
          <span className="text-xs text-[var(--color-accent)]">{progress}%</span>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-[var(--color-accent)]/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-700"
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
  characters,
  locations,
  panelTaskMap,
  onPanelTaskDone,
}: {
  episode: EpisodeData;
  projectId: string;
  characters: CharacterData[];
  locations: LocationData[];
  panelTaskMap: Record<string, { taskId: string; type: "image" | "video" }>;
  onPanelTaskDone: (panelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const clipCount = episode.clips.length;
  const panelCount = episode.clips.reduce((s, c) => s + c.panels.length, 0);
  const hasDialogue = episode.clips.some(
    (c) => c.dialogue || c.panels.some((p) => p.voiceLines.length > 0),
  );

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-surface)] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)] shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)] shrink-0" />
        )}
        <span className="font-semibold text-sm flex-1">{episode.title}</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {clipCount} 片段 · {panelCount} 面板
        </span>
        <StatusBadge status={episode.status} />
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border-light)] p-4">
          {episode.clips.length === 0 ? (
            <p className="text-xs text-[var(--color-text-tertiary)] italic text-center py-4">
              暂无片段，请先生成分镜文本
            </p>
          ) : (
            <div className="flex gap-4">
              {/* Dialogue sidebar */}
              {hasDialogue && (
                <div className={cn(
                  "shrink-0 border-r border-[var(--color-border-light)] pr-3 transition-all overflow-hidden",
                  sidebarOpen ? "w-60" : "w-8",
                )}>
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="cursor-pointer mb-2 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                    title={sidebarOpen ? "收起剧本" : "展开剧本"}
                  >
                    {sidebarOpen ? "◀ 剧本" : "▶"}
                  </button>
                  {sidebarOpen && (
                    <div className="space-y-3 overflow-y-auto max-h-[60vh]">
                      {episode.clips.map((clip) => (
                        <div key={clip.id} className="space-y-1">
                          <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] truncate">
                            {clip.title || `片段 ${clip.sortOrder + 1}`}
                          </p>
                          {clip.dialogue && (
                            <p className="text-[10px] text-[var(--color-text-tertiary)] line-clamp-3 leading-relaxed">
                              {clip.dialogue}
                            </p>
                          )}
                          {clip.panels.flatMap((p) => p.voiceLines).map((vl) => (
                            <div key={vl.id} className="text-[10px] leading-relaxed pl-1 border-l-2 border-[var(--color-accent)]">
                              {vl.character && (
                                <span className="font-medium text-[var(--color-accent)]">{vl.character.name}: </span>
                              )}
                              <span className="text-[var(--color-text-secondary)]">{vl.text}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Panel grid */}
              <div className="flex-1 min-w-0 space-y-4">
                {episode.clips.map((clip) => (
                  <div key={clip.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                        {clip.title || `片段 ${clip.sortOrder + 1}`}
                      </span>
                      {clip.dialogue && (
                        <span className="text-xs text-[var(--color-text-tertiary)] truncate max-w-xs">
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
                          characters={characters}
                          locations={locations}
                          batchTask={panelTaskMap[panel.id]}
                          onBatchTaskDone={() => onPanelTaskDone(panel.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
  characters,
  locations,
  batchTask,
  onBatchTaskDone,
}: {
  panel: PanelData;
  projectId: string;
  nextPanel: PanelData | null;
  characters: CharacterData[];
  locations: LocationData[];
  batchTask?: { taskId: string; type: "image" | "video" };
  onBatchTaskDone?: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [regenerating, setRegenerating] = useState<"image" | "video" | null>(
    null,
  );
  const [showModifyPrompt, setShowModifyPrompt] = useState(false);
  const [showShotVariants, setShowShotVariants] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();

  // Poll batch task progress
  const {
    task: batchTaskStatus,
    progressPercent: batchProgress,
    isRunning: batchRunning,
  } = useTaskPolling(batchTask?.taskId ?? null, {
    interval: 3000,
    onComplete: useCallback(() => {
      setBatchDone(true);
      onBatchTaskDone?.();
      setTimeout(() => setBatchDone(false), 2000);
    }, [onBatchTaskDone]),
    onFailed: useCallback((error: string) => {
      toast.error(error || "生成失败");
      onBatchTaskDone?.();
    }, [onBatchTaskDone]),
  });

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

  // Parse bound characters/locations
  const boundCharacterIds: string[] = panel.characterIds
    ? (() => {
        try {
          return JSON.parse(panel.characterIds);
        } catch {
          return [];
        }
      })()
    : [];
  const boundCharacters = boundCharacterIds
    .map((id) => characters.find((c) => c.id === id))
    .filter(Boolean) as CharacterData[];
  const boundLocation = panel.locationId
    ? locations.find((l) => l.id === panel.locationId) || null
    : null;

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
            "group relative rounded-[var(--radius-md)] border overflow-hidden cursor-pointer transition-all hover:shadow-md",
            panel.imageUrl
              ? "border-[var(--color-border-default)]"
              : "border-dashed border-[var(--color-border-default)]",
          )}
          onClick={() => {
            if (isPlaying) {
              setIsPlaying(false);
            } else if (panel.imageUrl || panel.videoUrl) {
              setShowPreview(true);
            }
          }}
        >
          {panel.imageUrl ? (
            <div className="aspect-[9/16] bg-[var(--color-bg-secondary)] overflow-hidden relative">
              {/* Inline video playback */}
              {isPlaying && panel.videoUrl ? (
                <video
                  ref={videoRef}
                  key={`video-${panel.id}-${panel.videoUrl}`}
                  src={panel.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain bg-black"
                  onEnded={() => setIsPlaying(false)}
                  onError={() => {
                    setIsPlaying(false);
                    setVideoError(true);
                  }}
                />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={panel.imageUrl}
                    alt={panel.sceneDescription || "Panel"}
                    className="w-full h-full object-cover"
                  />
                  {/* Play button overlay when video exists */}
                  {panel.videoUrl && (
                    <div
                      className={cn(
                        "absolute inset-0 flex items-center justify-center cursor-pointer",
                        videoError ? "bg-black/40" : "bg-black/20",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!videoError) {
                          setIsPlaying(true);
                        }
                      }}
                    >
                      {videoError ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-10 h-10 bg-amber-500/80 rounded-full flex items-center justify-center">
                            <Film className="h-5 w-5 text-white" />
                          </div>
                          <span className="text-[10px] text-white/90 bg-black/50 px-1.5 py-0.5 rounded">
                            链接已过期
                          </span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center shadow-lg hover:scale-110 hover:bg-black/80 transition-all">
                          <Play className="h-6 w-6 text-white ml-0.5" />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* Task status overlay — shown during regeneration or batch task */}
              {(regenerating || batchRunning || batchDone) && !isPlaying && (
                <div className={cn(
                  "absolute inset-0 flex flex-col items-center justify-center z-10",
                  batchDone ? "bg-black/30" : "bg-black/50",
                )}>
                  {batchDone ? (
                    <CheckCircle className="h-8 w-8 text-emerald-400" />
                  ) : (
                    <>
                      <Loader2 className="h-7 w-7 text-white animate-spin" />
                      <span className="mt-2 text-xs text-white">
                        {(batchTask?.type || regenerating) === "image" ? "生成图片中..." : "生成视频中..."}
                      </span>
                      {batchRunning && batchProgress > 0 && (
                        <span className="mt-1 text-[10px] text-white/80">{batchProgress}%</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[9/16] bg-[var(--color-bg-surface)] flex items-center justify-center relative">
              {(regenerating === "image" || batchRunning) ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 text-[var(--color-accent)] animate-spin" />
                  {batchRunning && batchProgress > 0 && (
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">{batchProgress}%</span>
                  )}
                </div>
              ) : batchDone ? (
                <CheckCircle className="h-8 w-8 text-emerald-400" />
              ) : (
                <ImageIcon className="h-6 w-6 text-[var(--color-border-default)]" />
              )}
            </div>
          )}

          {/* Status badges */}
          <div className="absolute top-1 right-1 flex gap-1">
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

          {/* Hover overlay with action buttons — hidden during playback */}
          <div className={cn(
            "absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100",
            isPlaying && "!opacity-0 pointer-events-none",
          )}>
            {(panel.imageUrl || panel.videoUrl) && (
              <button
                className="cursor-pointer rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors"
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
              className="cursor-pointer rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors disabled:opacity-50"
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
                className="cursor-pointer rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors disabled:opacity-50"
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
            {/* Download video button */}
            {panel.videoUrl && !videoError && (
              <button
                className="cursor-pointer rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  const a = document.createElement("a");
                  a.href = panel.videoUrl!;
                  a.download = `panel-${panel.sortOrder + 1}.mp4`;
                  a.target = "_blank";
                  a.click();
                }}
                title="下载视频"
              >
                <Download className="h-4 w-4 text-white" />
              </button>
            )}
            {/* Info button for details panel */}
            {(panel.videoPrompt || panel.photographyRules || panel.actingNotes) && (
              <button
                className="cursor-pointer rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors"
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
                  "cursor-pointer rounded-full p-1.5 transition-colors",
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

          <div className="p-1.5 space-y-0.5">
            {/* Metadata row: characters, location, shot info */}
            {(boundCharacters.length > 0 || boundLocation || panel.shotType || panel.cameraAngle || panel.cameraMove) && (
              <div className="text-[9px] text-[var(--color-text-tertiary)] leading-tight space-y-0.5">
                {(boundCharacters.length > 0 || boundLocation) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {boundCharacters.length > 0 && (
                      <span className="truncate max-w-[80%]">
                        {boundCharacters.map((c) => c.name).join(", ")}
                      </span>
                    )}
                    {boundLocation && (
                      <span className="text-emerald-500 truncate">
                        {boundLocation.name}
                      </span>
                    )}
                  </div>
                )}
                {(panel.shotType || panel.cameraAngle || panel.cameraMove) && (
                  <div className="text-[var(--color-text-tertiary)]/80">
                    {[panel.shotType, panel.cameraAngle, panel.cameraMove].filter(Boolean).join(" | ")}
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-[var(--color-text-secondary)] line-clamp-2 leading-tight">
              {panel.sceneDescription || "等待生成..."}
            </p>
            {panel.voiceLines.length > 0 && (
              <p className="text-[10px] text-[var(--color-accent)] truncate">
                {panel.voiceLines[0].text}
              </p>
            )}
          </div>

          {/* Asset thumbnails row */}
          {(boundCharacters.length > 0 || boundLocation) && (
            <div
              className="flex gap-1 px-1.5 py-1 border-t border-[var(--color-border-light)] cursor-pointer hover:bg-[var(--color-bg-surface)] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowAssetPicker(true);
              }}
              title="点击修改绑定"
            >
              {boundCharacters.map((c) =>
                c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={c.id}
                    src={c.imageUrl}
                    alt={c.name}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div
                    key={c.id}
                    className="w-6 h-6 rounded-full bg-[var(--color-border-default)] flex items-center justify-center text-[8px] text-[var(--color-text-tertiary)]"
                  >
                    {c.name[0]}
                  </div>
                ),
              )}
              {boundLocation?.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={boundLocation.imageUrl}
                  alt={boundLocation.name}
                  className="w-6 h-6 rounded object-cover"
                />
              )}
            </div>
          )}
        </div>

        {/* Candidate images thumbnail strip */}
        {candidates.length > 1 && (
          <div className="flex gap-1">
            {candidates.map((url, idx) => (
              <button
                key={idx}
                onClick={(e) => handleSelectCandidate(idx, e)}
                className={cn(
                  "cursor-pointer relative flex-1 aspect-square rounded overflow-hidden border-2 transition-all",
                  idx === (panel.selectedImageIndex ?? 0)
                    ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                    : "border-transparent hover:border-[var(--color-border-default)]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`候选 ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                {idx === (panel.selectedImageIndex ?? 0) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-accent)]/30">
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
            className="cursor-pointer absolute top-4 right-4 rounded-full bg-white/20 p-2 hover:bg-white/30"
            onClick={() => setShowPreview(false)}
          >
            <X className="h-5 w-5 text-white" />
          </button>
          <div
            className="max-w-2xl max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {panel.videoUrl && !videoError ? (
              <video
                src={panel.videoUrl}
                controls
                autoPlay
                className="max-h-[80vh] rounded-[var(--radius-md)]"
                onError={() => setVideoError(true)}
              />
            ) : panel.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={panel.imageUrl}
                alt=""
                className="max-h-[80vh] rounded-[var(--radius-md)]"
              />
            ) : null}
            {videoError && (
              <p className="text-xs text-[var(--color-warning)] mt-2 text-center">
                视频链接已过期，请重新生成视频
              </p>
            )}
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

      {showAssetPicker && (
        <PanelAssetPicker
          panelId={panel.id}
          projectId={projectId}
          characters={characters}
          locations={locations}
          currentCharacterIds={boundCharacterIds}
          currentLocationId={panel.locationId || null}
          onClose={() => setShowAssetPicker(false)}
          onSaved={refreshProject}
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
        className="bg-white rounded-[var(--radius-lg)] border border-[var(--color-border-default)] p-4 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">面板详情</h3>
          <button onClick={onClose} className="cursor-pointer">
            <X className="h-4 w-4 text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {panel.sceneType && (
          <div>
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase">场景类型</span>
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
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase">原文片段</span>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 bg-[var(--color-bg-surface)] rounded p-2">
              {panel.sourceText}
            </p>
          </div>
        )}

        {panel.videoPrompt && (
          <div>
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase">
              视频提示词
            </span>
            <p className="text-xs text-cyan-600 mt-0.5">
              {panel.videoPrompt}
            </p>
          </div>
        )}

        {photographyData && (
          <div>
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase">摄影规则</span>
            <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 space-y-1">
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
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase">表演指导</span>
            <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 space-y-1">
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
            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase">
              图片提示词
            </span>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{panel.imagePrompt}</p>
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
      color: "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
    },
    storyboarded: {
      label: "已分镜",
      color: "bg-[var(--color-accent-bg)] text-[var(--color-accent)]",
    },
    generating: {
      label: "生成中",
      color: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
    },
    completed: {
      label: "完成",
      color: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
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
