/**
 * Guardrails: hard validation rules that override LLM decisions.
 * Prevents the orchestrator from violating dependency constraints.
 */

import type { OrchestratorState, OrchestratorLogEntry } from "./types";

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateAction(
  actionName: string,
  params: Record<string, unknown>,
  state: OrchestratorState,
  recentLog: OrchestratorLogEntry[],
): ValidationResult {
  const { phases, episodes, outputFormat } = state;
  const isNovel = outputFormat === "novel" || outputFormat === "same";
  const isVisual = !outputFormat || outputFormat === "script";
  const epNum = params.episodeNumber as number | undefined;

  // ─── Dependency: analysis must be done before planning
  if (actionName === "run_planning" && !phases.analysis.done) {
    return { valid: false, reason: "分析尚未完成，不能执行规划" };
  }

  // ─── Dependency: planning must be done before strategy/write
  if (actionName === "run_strategy" && !phases.planning.done) {
    return { valid: false, reason: "规划尚未完成，不能设计策略" };
  }

  // ─── Strategy only in novel mode
  if (actionName === "run_strategy" && !isNovel) {
    return { valid: false, reason: "策略仅在小说模式下可用" };
  }

  // ─── Strategy must be confirmed before writing (novel mode)
  if (actionName === "write_episode" && isNovel) {
    if (!phases.strategy.done) {
      return { valid: false, reason: "小说模式下必须先完成策略设计" };
    }
    if (!phases.strategy.confirmed) {
      return { valid: false, reason: "策略尚未确认，不能开始写作" };
    }
  }

  // ─── Writing requires planning
  if (actionName === "write_episode" && !phases.planning.done) {
    return { valid: false, reason: "规划尚未完成，不能写作" };
  }

  // ─── Sequential writing: previous episodes must have scripts
  if (actionName === "write_episode" && epNum && epNum > 1) {
    const prevEp = episodes.find((e) => e.number === epNum - 1);
    if (prevEp && !prevEp.hasScript) {
      return { valid: false, reason: `第${epNum - 1}集尚未写完，不能跳到第${epNum}集` };
    }
  }

  // ─── Review requires script
  if (actionName === "review_episode" && epNum) {
    const ep = episodes.find((e) => e.number === epNum);
    if (ep && !ep.hasScript) {
      return { valid: false, reason: `第${epNum}集尚无剧本，不能审核` };
    }
  }

  // ─── Storyboard requires reviewed script + visual mode
  if (actionName === "storyboard_episode") {
    if (!isVisual) {
      return { valid: false, reason: "分镜仅在剧本模式下可用" };
    }
    if (epNum) {
      const ep = episodes.find((e) => e.number === epNum);
      if (ep && !ep.reviewScore) {
        return { valid: false, reason: `第${epNum}集尚未审核，不能分镜` };
      }
    }
  }

  // ─── Image prompts requires storyboard + visual mode
  if (actionName === "generate_image_prompts") {
    if (!isVisual) {
      return { valid: false, reason: "图片提示词仅在剧本模式下可用" };
    }
    if (epNum) {
      const ep = episodes.find((e) => e.number === epNum);
      if (ep && !ep.hasStoryboard) {
        return { valid: false, reason: `第${epNum}集尚未分镜，不能生成图片提示词` };
      }
    }
  }

  // ─── Post-process only in novel mode
  if (actionName === "run_post_process" && !isNovel) {
    return { valid: false, reason: "后处理仅在小说模式下可用" };
  }

  // ─── Finish: all episodes must be completed or similarity-failed
  if (actionName === "finish") {
    const unfinished = episodes.filter(
      (e) => e.status !== "completed" && e.status !== "similarity-failed",
    );
    if (unfinished.length > 0) {
      return {
        valid: false,
        reason: `还有${unfinished.length}集未完成: ${unfinished.map((e) => `第${e.number}集(${e.status})`).join(", ")}`,
      };
    }
  }

  // ─── Anti-loop: same action+params 3 times in a row
  if (recentLog.length >= 3) {
    const last3 = recentLog.slice(-3);
    const allSame = last3.every(
      (entry) =>
        entry.action === actionName &&
        JSON.stringify(entry.params) === JSON.stringify(params),
    );
    if (allSame) {
      return { valid: false, reason: `${actionName} 已连续执行3次相同参数，疑似死循环` };
    }
  }

  return { valid: true };
}
