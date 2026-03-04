"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Save, Sparkles, Loader2, CheckCircle, FileText } from "lucide-react";
import type { ProjectData } from "./types";

interface ScriptTabProps {
  project: ProjectData;
}

export function ScriptTab({ project }: ScriptTabProps) {
  const [text, setText] = useState(project?.sourceText || "");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const hasChanges = text !== (project?.sourceText || "");
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText: text }),
      });
      if (!res.ok) throw new Error("Save failed");
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

    setAnalyzing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/analyze`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Analyze failed");
      const { taskId } = await res.json();
      toast.success(`分析任务已提交 (${taskId.slice(0, 8)}...)`);
    } catch {
      toast.error("提交分析任务失败");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{charCount} 字符</span>
          <span>{wordCount} 词</span>
          {project.status !== "draft" && (
            <span className="inline-flex items-center gap-1 text-green-500">
              <CheckCircle className="h-3 w-3" />
              已分析
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
          className="w-full h-[500px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
          placeholder="粘贴小说/剧本文本内容...\n\n支持任意文本格式，AI 会自动分析出：\n• 集数划分\n• 场景片段\n• 角色信息\n• 场景描述\n• 分镜面板"
          value={text}
          onChange={(e) => setText(e.target.value)}
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
          disabled={saving || !hasChanges}
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
          disabled={analyzing || !text.trim()}
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          AI 分析剧本
        </button>

        {project.episodes && project.episodes.length > 0 && (
          <span className="text-xs text-gray-400 ml-2">
            已分析出 {project.episodes.length} 集，
            {project.episodes.reduce((sum, ep) => sum + (ep.clips?.length || 0), 0)} 个片段
          </span>
        )}
      </div>
    </div>
  );
}
