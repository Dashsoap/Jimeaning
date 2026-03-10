"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Film,
  Download,
  Loader2,
  Settings2,
  Music,
  Subtitles,
  Zap,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { useTranslations } from "next-intl";
import type { ProjectData, EpisodeData, CompositionData } from "./types";

interface ComposeTabProps {
  project: ProjectData;
  onSwitchTab?: (tab: string) => void;
}

export function ComposeTab({ project, onSwitchTab }: ComposeTabProps) {
  const te = useTranslations("emptyHints");
  const episodes = project.episodes || [];

  if (episodes.length === 0) {
    return (
      <div className="text-center py-16">
        <Film className="h-12 w-12 text-[var(--color-border)] mx-auto mb-4" />
        <p className="text-[var(--color-text-secondary)] font-medium">暂无可合成的集</p>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1 mb-4">
          {te("compose")}
        </p>
        {onSwitchTab && (
          <button
            onClick={() => onSwitchTab("storyboard")}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            {te("goToStoryboard")}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--color-text-tertiary)]">
          {episodes.length} 集可合成
        </div>
      </div>

      {/* Episode Composition Cards */}
      {episodes.map((episode) => (
        <EpisodeCompose
          key={episode.id}
          episode={episode}
          projectId={project.id}
        />
      ))}
    </div>
  );
}

// ─── Episode Compose ──────────────────────────────────────────────────────

function EpisodeCompose({
  episode,
  projectId,
}: {
  episode: EpisodeData;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [composeTaskId, setComposeTaskId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Partial<CompositionData>>({
    bgmVolume: episode.composition?.bgmVolume ?? 0.3,
    subtitleEnabled: episode.composition?.subtitleEnabled ?? true,
    subtitleStyle: episode.composition?.subtitleStyle ?? "default",
    transition: episode.composition?.transition ?? "crossfade",
  });
  const queryClient = useQueryClient();

  const { isRunning: composing, progressPercent: composeProgress } =
    useTaskPolling(composeTaskId, {
      interval: 3000,
      onComplete: useCallback(() => {
        toast.success("视频合成完成！");
        setComposeTaskId(null);
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      }, [queryClient, projectId]),
      onFailed: useCallback(
        (error: string) => {
          toast.error(`合成失败: ${error}`);
          setComposeTaskId(null);
          queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        },
        [queryClient, projectId]
      ),
    });

  const composition = episode.composition;
  const panelCount = episode.clips.reduce((s, c) => s + c.panels.length, 0);
  const videosReady = episode.clips.reduce(
    (s, c) => s + c.panels.filter((p) => p.videoUrl).length,
    0
  );
  const voiceLinesReady = episode.clips.reduce(
    (s, c) =>
      s + c.panels.reduce((ss, p) => ss + p.voiceLines.filter((v) => v.audioUrl).length, 0),
    0
  );

  const handleSaveSettings = async () => {
    try {
      await fetch(
        `/api/projects/${projectId}/episodes/${episode.id}/compose`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }
      );
      toast.success("合成设置已保存");
    } catch {
      toast.error("保存失败");
    }
  };

  const handleCompose = async () => {
    try {
      // Save settings first
      await handleSaveSettings();
      // Trigger composition
      const res = await fetch(
        `/api/projects/${projectId}/episodes/${episode.id}/compose`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const { taskId } = await res.json();
      setComposeTaskId(taskId);
      toast.success("合成任务已提交");
    } catch {
      toast.error("提交合成任务失败");
    }
  };

  const handleDownloadSrt = async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/episodes/${episode.id}/srt`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${episode.title}.srt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("下载 SRT 失败");
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        )}
        <Film className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        <span className="font-semibold text-sm flex-1">{episode.title}</span>
        {composition && <ComposeStatusBadge status={composition.status} />}
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border-light)] p-4 space-y-4">
          {/* Readiness Checklist */}
          <div className="grid grid-cols-3 gap-3">
            <ReadinessItem
              label="视频片段"
              ready={videosReady}
              total={panelCount}
              icon={Film}
            />
            <ReadinessItem
              label="配音"
              ready={voiceLinesReady}
              total={episode.clips.reduce(
                (s, c) => s + c.panels.reduce((ss, p) => ss + p.voiceLines.length, 0),
                0
              )}
              icon={Music}
            />
            <ReadinessItem
              label="字幕"
              ready={settings.subtitleEnabled ? 1 : 0}
              total={1}
              icon={Subtitles}
            />
          </div>

          {/* Composition Settings */}
          <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
              <Settings2 className="h-3.5 w-3.5" />
              合成设置
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Transition */}
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">转场效果</label>
                <select
                  value={settings.transition}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, transition: e.target.value }))
                  }
                  className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="crossfade">淡入淡出 (Crossfade)</option>
                  <option value="cut">硬切 (Cut)</option>
                  <option value="fade">黑场过渡 (Fade)</option>
                </select>
              </div>

              {/* Subtitle Style */}
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">字幕样式</label>
                <select
                  value={settings.subtitleStyle}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, subtitleStyle: e.target.value }))
                  }
                  className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="default">默认</option>
                  <option value="cinematic">电影风格</option>
                  <option value="minimal">极简</option>
                </select>
              </div>

              {/* BGM Volume */}
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                  BGM 音量 ({Math.round((settings.bgmVolume || 0.3) * 100)}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.bgmVolume || 0.3}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bgmVolume: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </div>

              {/* Subtitle Toggle */}
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">字幕</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.subtitleEnabled}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        subtitleEnabled: e.target.checked,
                      }))
                    }
                    className="rounded border-[var(--color-border)]"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    烧入字幕
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Output Preview */}
          {composition?.outputUrl && (
            <div className="rounded-[var(--radius-md)] overflow-hidden bg-black">
              <video
                src={composition.outputUrl}
                controls
                className="w-full max-h-96"
              />
            </div>
          )}

          {/* Composition Error */}
          {composition?.error && (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-danger-light)] px-3 py-2 text-xs text-[var(--color-danger)] flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {composition.error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCompose}
              disabled={composing || videosReady === 0}
              className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
            >
              {composing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              合成视频
            </button>

            {composition?.outputUrl && (
              <a
                href={composition.outputUrl}
                download
                className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-success)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-colors"
              >
                <Download className="h-4 w-4" />
                下载视频
              </a>
            )}

            <button
              onClick={handleDownloadSrt}
              className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:opacity-80 transition-colors"
            >
              <Subtitles className="h-4 w-4" />
              下载 SRT
            </button>

            <button
              onClick={refresh}
              className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:opacity-80 transition-colors"
            >
              刷新
            </button>

            {composing && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--color-warning)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                合成中 ({composeProgress}%)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Readiness Item ───────────────────────────────────────────────────────

function ReadinessItem({
  label,
  ready,
  total,
  icon: Icon,
}: {
  label: string;
  ready: number;
  total: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const isComplete = total > 0 && ready >= total;
  const percentage = total > 0 ? Math.round((ready / total) * 100) : 0;

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          {label}
        </span>
        {isComplete ? (
          <CheckCircle className="h-3 w-3 text-[var(--color-success)] ml-auto" />
        ) : total > 0 ? (
          <Clock className="h-3 w-3 text-[var(--color-warning)] ml-auto" />
        ) : null}
      </div>
      <div className="text-lg font-bold text-[var(--color-text)]">
        {ready}
        <span className="text-xs font-normal text-[var(--color-text-tertiary)]">/{total}</span>
      </div>
      {total > 0 && (
        <div className="mt-1 h-1 rounded-full bg-[var(--color-border)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isComplete ? "bg-[var(--color-success)]" : "bg-[var(--color-accent)]"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────

function ComposeStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
    pending: {
      label: "待合成",
      color: "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
      icon: Clock,
    },
    composing: {
      label: "合成中",
      color: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
      icon: Loader2,
    },
    completed: {
      label: "已完成",
      color: "bg-[var(--color-success-light)] text-[var(--color-success)]",
      icon: CheckCircle,
    },
    failed: {
      label: "失败",
      color: "bg-[var(--color-danger-light)] text-[var(--color-danger)]",
      icon: AlertCircle,
    },
  };
  const cfg = config[status] || config.pending;
  const StatusIcon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}
    >
      <StatusIcon className={`h-3 w-3 ${status === "composing" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}
