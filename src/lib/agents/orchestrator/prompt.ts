/**
 * Orchestrator prompt builder.
 * Generates system and user prompts for the LLM orchestrator.
 */

import type { OrchestratorState } from "./types";

export function buildOrchestratorSystemPrompt(outputFormat: string): string {
  const isNovel = outputFormat === "novel" || outputFormat === "same";
  const isVisual = !outputFormat || outputFormat === "script";

  return `你是一个项目编排器，负责决定下一步执行什么操作。

## 你的职责
根据项目当前状态，选择最合适的下一个操作（tool call）。每次只选一个操作。

## 依赖规则（必须严格遵守）
1. analysis → planning → ${isNovel ? "strategy → " : ""}write → review${isVisual ? " → storyboard → image_prompts" : ""}
2. 集数必须按顺序写作（第1集→第2集→...），保证跨集连续性
3. ${isNovel ? "strategy 完成后必须暂停等待用户确认（shouldPause）" : "无需 strategy 步骤"}
4. 每集的步骤必须按顺序：write → review${isVisual ? " → storyboard → image_prompts" : ""}${isNovel ? " → post_process" : ""}

## 质量决策
- 审核分数 ≥ 49 = 通过，继续下一步
- 审核分数 < 49 = 未通过，用 write_episode（带 userFeedback）重写，最多重写2次
- ${isNovel ? "小说模式：审核后执行 run_post_process 检查雷同度" : ""}

## 完成条件
- 所有集数的所有步骤都完成后，调用 finish
- ${isNovel ? "如果有集数 similarity-failed，仍然继续处理其他集数，最后汇总报告" : ""}

## 决策原则
- 优先完成当前集的所有步骤，再进入下一集
- 如果某步骤已完成（如已有剧本），跳过
- 遇到错误时，记录并尝试下一个可行操作
- 不要重复调用已成功的操作`;
}

export function buildOrchestratorUserPrompt(state: OrchestratorState): string {
  const lines: string[] = [];

  lines.push(`## 项目状态`);
  lines.push(`格式: ${state.outputFormat} | 改写强度: ${state.rewriteIntensity}`);

  lines.push(`\n### 全局阶段`);
  lines.push(`- 分析: ${state.phases.analysis.done ? `✅ (${state.phases.analysis.characterCount ?? 0}角色)` : "❌ 未完成"}`);
  lines.push(`- 规划: ${state.phases.planning.done ? `✅ (${state.phases.planning.episodeCount ?? 0}集)` : "❌ 未完成"}`);

  if (state.outputFormat === "novel" || state.outputFormat === "same") {
    const s = state.phases.strategy;
    lines.push(`- 策略: ${s.done ? (s.confirmed ? "✅ 已确认" : "⏸️ 已设计未确认") : "❌ 未完成"}`);
  }

  if (state.episodes.length > 0) {
    lines.push(`\n### 集数状态 (完成${state.summary.completedCount}/${state.episodes.length})`);
    for (const ep of state.episodes) {
      const parts = [`第${ep.number}集: ${ep.status}`];
      if (ep.hasScript) parts.push("有剧本");
      if (ep.reviewScore != null) parts.push(`审核${ep.reviewScore}分`);
      if (ep.similarityScore != null) parts.push(`雷同${(ep.similarityScore * 100).toFixed(1)}%`);
      if (ep.hasStoryboard) parts.push("有分镜");
      if (ep.hasImagePrompts) parts.push("有图片提示词");
      if (ep.rewriteAttempt > 0) parts.push(`改写${ep.rewriteAttempt}次`);
      lines.push(`- ${parts.join(" | ")}`);
    }
  }

  lines.push(`\n请选择下一个操作。如果所有工作都已完成，调用 finish。`);
  return lines.join("\n");
}
