"use client";

import { Check, Clock, Loader2 } from "lucide-react";
import type { AgentProject, ViewContentPayload } from "./types";

// ─── Stage definitions ───────────────────────────────────────────────

interface StageConfig {
  key: string;
  label: string;
}

const SCRIPT_STAGES: StageConfig[] = [
  { key: "analyze", label: "分析" },
  { key: "plan", label: "规划" },
  { key: "write", label: "写作" },
  { key: "review", label: "审核" },
  { key: "storyboard", label: "分镜" },
  { key: "imagePrompts", label: "出图" },
];

const NOVEL_STAGES: StageConfig[] = [
  { key: "analyze", label: "分析" },
  { key: "plan", label: "规划" },
  { key: "strategy", label: "策略" },
  { key: "write", label: "写作" },
  { key: "review", label: "审核" },
];

// ─── Stage state derivation ──────────────────────────────────────────

type StageState = "completed" | "active" | "waiting" | "pending";

function deriveStageState(key: string, project: AgentProject): StageState {
  const episodes = project.episodes ?? [];
  const busyStatuses: Record<string, string> = {
    analyze: "analyzing",
    plan: "planning",
    strategy: "planning",
    write: "writing",
    review: "reviewing",
    storyboard: "storyboarding",
    imagePrompts: "imaging",
  };

  // Check if this stage is currently active
  if (project.status === busyStatuses[key]) return "active";

  switch (key) {
    case "analyze":
      return project.analysisData ? "completed" : "pending";

    case "plan":
      if (project.planningData) return "completed";
      return project.analysisData ? "pending" : "pending";

    case "strategy":
      if (project.rewriteStrategy && project.strategyConfirmed) return "completed";
      if (project.rewriteStrategy || project.status === "strategy-designed") return "waiting";
      return project.planningData ? "pending" : "pending";

    case "write":
      if (episodes.length === 0) return "pending";
      if (episodes.every((ep) => ["drafted", "reviewed", "review-failed", "storyboarded", "completed"].includes(ep.status)))
        return "completed";
      if (episodes.some((ep) => ["drafted", "reviewed", "review-failed", "storyboarded", "completed"].includes(ep.status)))
        return "active";
      return "pending";

    case "review":
      if (episodes.length === 0) return "pending";
      if (episodes.every((ep) => ep.reviewScore !== null)) return "completed";
      if (episodes.some((ep) => ep.reviewScore !== null)) return "active";
      return "pending";

    case "storyboard":
      if (episodes.length === 0) return "pending";
      if (episodes.every((ep) => ["storyboarded", "completed"].includes(ep.status))) return "completed";
      if (episodes.some((ep) => ["storyboarded", "completed"].includes(ep.status))) return "active";
      return "pending";

    case "imagePrompts":
      if (episodes.length === 0) return "pending";
      if (episodes.every((ep) => ep.status === "completed")) return "completed";
      if (episodes.some((ep) => ep.status === "completed")) return "active";
      return "pending";

    default:
      return "pending";
  }
}

// ─── Viewable content for completed stages ───────────────────────────

function getStageContent(key: string, project: AgentProject): { title: string; content: string } | null {
  switch (key) {
    case "analyze":
      if (project.analysisData) return { title: "分析结果", content: JSON.stringify(project.analysisData, null, 2) };
      return null;
    case "plan":
      if (project.planningData) return { title: "分集规划", content: JSON.stringify(project.planningData, null, 2) };
      return null;
    case "strategy":
      if (project.rewriteStrategy) return { title: "改写策略", content: JSON.stringify(project.rewriteStrategy, null, 2) };
      return null;
    default:
      return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────

interface PipelineStepperProps {
  project: AgentProject;
  onViewContent: (v: ViewContentPayload) => void;
}

export function PipelineStepper({ project, onViewContent }: PipelineStepperProps) {
  const isNovel = project.outputFormat === "novel" || project.outputFormat === "same";
  const stages = isNovel ? NOVEL_STAGES : SCRIPT_STAGES;

  // Don't show stepper if project has no progress at all
  if (!project.analysisData && project.status === "created") return null;

  return (
    <div className="mt-3 mb-1 px-1">
      <div className="flex items-center">
        {stages.map((stage, idx) => {
          const state = deriveStageState(stage.key, project);
          const isLast = idx === stages.length - 1;
          const clickable = state === "completed" && getStageContent(stage.key, project);

          return (
            <div key={stage.key} className="flex items-center" style={{ flex: isLast ? "0 0 auto" : "1 1 0%" }}>
              {/* Circle + label */}
              <button
                onClick={() => {
                  if (!clickable) return;
                  const content = getStageContent(stage.key, project)!;
                  const typeMap: Record<string, string> = { analyze: "analysis", plan: "planning", strategy: "strategy" };
                  onViewContent({ ...content, type: (typeMap[stage.key] || "raw") as ViewContentPayload["type"] });
                }}
                className={`flex flex-col items-center gap-1 ${clickable ? "cursor-pointer group" : ""}`}
                disabled={!clickable}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    state === "completed"
                      ? "bg-[var(--color-success)] text-white"
                      : state === "active"
                        ? "bg-[var(--color-accent)] text-white"
                        : state === "waiting"
                          ? "bg-[var(--color-warning)] text-white"
                          : "bg-[var(--color-bg-surface)] text-[var(--color-text-tertiary)] border border-[var(--color-border-default)]"
                  }`}
                >
                  {state === "completed" ? (
                    <Check size={12} />
                  ) : state === "active" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : state === "waiting" ? (
                    <Clock size={10} />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    state === "completed"
                      ? "text-[var(--color-success)] group-hover:underline"
                      : state === "active"
                        ? "text-[var(--color-accent)] font-medium"
                        : state === "waiting"
                          ? "text-[var(--color-warning)]"
                          : "text-[var(--color-text-tertiary)]"
                  }`}
                >
                  {stage.label}
                </span>
              </button>

              {/* Connecting line */}
              {!isLast && (
                <div
                  className={`h-0.5 flex-1 mx-1 mt-[-18px] ${
                    state === "completed"
                      ? "bg-[var(--color-success)]"
                      : "bg-[var(--color-border-default)]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
