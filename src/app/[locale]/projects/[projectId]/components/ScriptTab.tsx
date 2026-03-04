"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Save,
  Sparkles,
  Loader2,
  CheckCircle,
  FileText,
  AlertCircle,
} from "lucide-react";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import type { ProjectData } from "./types";

interface ScriptTabProps {
  project: ProjectData;
  onSwitchTab?: (tab: string) => void;
}

export function ScriptTab({ project, onSwitchTab }: ScriptTabProps) {
  const [text, setText] = useState(project?.sourceText || "");
  const [saving, setSaving] = useState(false);
  const [analyzeTaskId, setAnalyzeTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const hasChanges = text !== (project?.sourceText || "");
  const charCount = text.length;
  const isAnalyzed = project.status !== "draft";

  // Task polling for analyze
  const {
    task: analyzeTask,
    isRunning: isAnalyzing,
    progressPercent,
    isFailed: analyzeFailed,
  } = useTaskPolling(analyzeTaskId, {
    interval: 2000,
    onComplete: useCallback(() => {
      toast.success("剧本分析完成！已提取角色、场景和片段");
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      // Auto switch to assets tab after analysis
      setTimeout(() => onSwitchTab?.("assets"), 1000);
    }, [queryClient, project.id, onSwitchTab]),
    onFailed: useCallback(
      (error: string) => {
        toast.error(`分析失败: ${error}`);
        setAnalyzeTaskId(null);
        queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      },
      [queryClient, project.id]
    ),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      toast.success("已保存");
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim()) {
      toast.error("请先输入文本");
      return;
    }
    // Save text first if changed
    if (hasChanges) await handleSave();

    try {
      const res = await fetch(`/api/projects/${project.id}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "提交失败");
        return;
      }
      const { taskId } = await res.json();
      setAnalyzeTaskId(taskId);
      toast.success("分析任务已提交，请等待...");
    } catch {
      toast.error("提交分析任务失败");
    }
  };

  return (
    <div className="space-y-4">
      {/* Analyzing Overlay */}
      {isAnalyzing && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                AI 正在分析剧本...
              </p>
              <p className="text-xs text-blue-500 dark:text-blue-400">
                {analyzeTask?.status === "pending" && "排队中..."}
                {analyzeTask?.status === "running" &&
                  progressPercent < 30 &&
                  "正在分析文本结构..."}
                {analyzeTask?.status === "running" &&
                  progressPercent >= 30 &&
                  progressPercent < 60 &&
                  "正在提取角色和场景..."}
                {analyzeTask?.status === "running" &&
                  progressPercent >= 60 &&
                  progressPercent < 90 &&
                  "正在生成片段和面板..."}
                {analyzeTask?.status === "running" &&
                  progressPercent >= 90 &&
                  "正在保存分析结果..."}
              </p>
            </div>
          </div>
          {/* Progress Bar */}
          <div className="h-2 rounded-full bg-blue-200 dark:bg-blue-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progressPercent, 5)}%` }}
            />
          </div>
          <p className="text-xs text-blue-400 mt-1 text-right">
            {progressPercent}%
          </p>
        </div>
      )}

      {/* Analysis Failed */}
      {analyzeFailed && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              分析失败
            </p>
            <p className="text-xs text-red-500">
              {analyzeTask?.error || "未知错误，请检查 API 配置后重试"}
            </p>
          </div>
          <button
            onClick={() => setAnalyzeTaskId(null)}
            className="ml-auto text-xs text-red-500 hover:text-red-700 underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{charCount} 字符</span>
          {isAnalyzed && (
            <span className="inline-flex items-center gap-1 text-green-500">
              <CheckCircle className="h-3 w-3" />
              已分析
            </span>
          )}
          {project.episodes && project.episodes.length > 0 && (
            <span>
              {project.episodes.length} 集 ·{" "}
              {project.episodes.reduce(
                (sum, ep) => sum + (ep.clips?.length || 0),
                0
              )}{" "}
              片段
            </span>
          )}
        </div>
        {hasChanges && (
          <span className="text-xs text-amber-500">未保存更改</span>
        )}
      </div>

      {/* Text Area */}
      <div className="relative">
        <textarea
          className="w-full h-[500px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono disabled:opacity-60"
          placeholder={
            "粘贴小说/剧本文本内容...\n\n支持任意文本格式，AI 会自动分析出：\n• 集数划分\n• 场景片段\n• 角色信息\n• 场景描述\n• 分镜面板"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isAnalyzing}
        />
        {!text && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
            <FileText className="h-12 w-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          onClick={handleSave}
          disabled={saving || !hasChanges || isAnalyzing}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存文本
        </button>

        <button
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          onClick={handleAnalyze}
          disabled={isAnalyzing || !text.trim()}
        >
          {isAnalyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isAnalyzing ? "分析中..." : "AI 分析剧本"}
        </button>
      </div>
    </div>
  );
}
