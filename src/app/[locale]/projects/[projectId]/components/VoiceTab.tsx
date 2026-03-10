"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Mic,
  Loader2,
  Play,
  Volume2,
  User,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import type { ProjectData, EpisodeData, VoiceLineData, CharacterData } from "./types";

interface VoiceTabProps {
  project: ProjectData;
  onSwitchTab?: (tab: string) => void;
}

export function VoiceTab({ project, onSwitchTab }: VoiceTabProps) {
  const episodes = project.episodes || [];
  const characters = project.characters || [];
  const [generatingAll, setGeneratingAll] = useState(false);
  const [batchTaskIds, setBatchTaskIds] = useState<string[] | null>(null);
  const queryClient = useQueryClient();

  // Poll first batch task as indicator
  const { isRunning: isBatchRunning } = useTaskPolling(
    batchTaskIds?.[0] ?? null,
    {
      interval: 3000,
      onComplete: useCallback(() => {
        toast.success("配音生成完成（部分）");
        queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      }, [queryClient, project.id]),
      onFailed: useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      }, [queryClient, project.id]),
    }
  );

  // Collect all voice lines
  const allVoiceLines: (VoiceLineData & { episodeTitle: string; clipTitle: string })[] = [];
  for (const ep of episodes) {
    for (const clip of ep.clips) {
      for (const panel of clip.panels) {
        for (const vl of panel.voiceLines) {
          allVoiceLines.push({
            ...vl,
            episodeTitle: ep.title,
            clipTitle: clip.title || `片段 ${clip.sortOrder + 1}`,
          });
        }
      }
    }
  }

  const withAudio = allVoiceLines.filter((vl) => vl.audioUrl).length;

  const te = useTranslations("emptyHints");

  if (allVoiceLines.length === 0) {
    return (
      <div className="text-center py-16">
        <Mic className="h-12 w-12 text-[var(--color-border-default)] mx-auto mb-4" />
        <p className="text-[var(--color-text-secondary)] font-medium">暂无配音台词</p>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1 mb-4">
          {te("voice")}
        </p>
        {onSwitchTab && (
          <button
            onClick={() => onSwitchTab("storyboard")}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-btn-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-btn-primary-hover)] transition-colors"
          >
            {te("goToStoryboard")}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    try {
      // Create voice generation tasks for all voice lines without audio
      const voiceLinesToGenerate = allVoiceLines.filter((vl) => !vl.audioUrl);
      if (voiceLinesToGenerate.length === 0) {
        toast("所有台词已有配音");
        return;
      }

      const res = await fetch(`/api/projects/${project.id}/voice/generate-all`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const data = await res.json();
      setBatchTaskIds(data.taskIds);
      toast.success(`已提交 ${data.count || voiceLinesToGenerate.length} 个配音任务`);
    } catch {
      toast.error("提交配音任务失败");
    } finally {
      setGeneratingAll(false);
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
  };

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerateAll}
          disabled={generatingAll || isBatchRunning}
          className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-btn-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-btn-primary-hover)] disabled:opacity-50 transition-colors"
        >
          {generatingAll || isBatchRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
          {isBatchRunning ? "生成中..." : "批量生成配音"}
        </button>
        <button
          onClick={refresh}
          className="cursor-pointer inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:opacity-80 transition-colors"
        >
          刷新
        </button>

        <div className="ml-auto text-xs text-[var(--color-text-tertiary)]">
          {withAudio}/{allVoiceLines.length} 已生成
        </div>
      </div>

      {/* Voice Lines by Episode */}
      {episodes.map((episode) => (
        <EpisodeVoiceSection
          key={episode.id}
          episode={episode}
          characters={characters}
          projectId={project.id}
        />
      ))}
    </div>
  );
}

// ─── Episode Voice Section ────────────────────────────────────────────────

function EpisodeVoiceSection({
  episode,
  characters,
  projectId,
}: {
  episode: EpisodeData;
  characters: CharacterData[];
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const voiceLines: VoiceLineData[] = [];
  for (const clip of episode.clips) {
    for (const panel of clip.panels) {
      voiceLines.push(...panel.voiceLines);
    }
  }

  if (voiceLines.length === 0) return null;

  const withAudio = voiceLines.filter((vl) => vl.audioUrl).length;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-surface)] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        )}
        <Mic className="h-4 w-4 text-[var(--color-text-tertiary)]" />
        <span className="font-semibold text-sm flex-1">{episode.title}</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {withAudio}/{voiceLines.length} 配音
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border-light)]">
          <div className="divide-y divide-[var(--color-border-light)]">
            {voiceLines.map((vl) => (
              <VoiceLineRow
                key={vl.id}
                voiceLine={vl}
                characters={characters}
                projectId={projectId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Voice Line Row ───────────────────────────────────────────────────────

function VoiceLineRow({
  voiceLine,
  characters,
  projectId,
}: {
  voiceLine: VoiceLineData;
  characters: CharacterData[];
  projectId: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { isRunning: generating } = useTaskPolling(taskId, {
    onComplete: useCallback(() => {
      toast.success("配音生成完成");
      setTaskId(null);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    }, [queryClient, projectId]),
    onFailed: useCallback(
      (error: string) => {
        toast.error(`配音失败: ${error}`);
        setTaskId(null);
      },
      []
    ),
  });

  const character = voiceLine.characterId
    ? characters.find((c) => c.id === voiceLine.characterId)
    : null;

  const handlePlay = () => {
    if (!voiceLine.audioUrl) return;
    const audio = new Audio(voiceLine.audioUrl);
    audio.onended = () => setPlaying(false);
    audio.play();
    setPlaying(true);
  };

  const handleGenerate = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/voice/${voiceLine.id}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const { taskId: tid } = await res.json();
      setTaskId(tid);
      toast.success("配音任务已提交");
    } catch {
      toast.error("提交失败");
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-bg-surface)]">
      {/* Character Badge */}
      <div className="shrink-0 w-20">
        {character ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
            <User className="h-3 w-3" />
            {character.name}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-text-tertiary)]">旁白</span>
        )}
      </div>

      {/* Text */}
      <span className="flex-1 text-sm text-[var(--color-text-primary)] truncate">
        {voiceLine.text}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {voiceLine.audioUrl ? (
          <button
            onClick={handlePlay}
            className={`cursor-pointer rounded-[var(--radius-md)] p-1.5 transition-colors ${
              playing
                ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:opacity-80"
            }`}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="cursor-pointer inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-btn-primary)] px-2 py-1 text-xs font-medium text-white hover:bg-[var(--color-btn-primary-hover)] disabled:opacity-50 transition-colors"
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Mic className="h-3 w-3" />
            )}
            生成
          </button>
        )}
      </div>
    </div>
  );
}
