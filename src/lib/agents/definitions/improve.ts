/**
 * Agent: improve — 根据反思反馈改进改写稿
 * 只修编辑指出的问题，不大面积重写。
 */

import type { AgentDef } from "../types";

export interface ImproveInput {
  rewrittenText: string;
  reflectionFeedback: string;
  /** 改写策略上下文（帮助 improve 理解应该遵循什么风格） */
  strategyContext?: {
    narrativeVoice: string;
    toneAndRegister: string;
    dialogueApproach: string;
  };
}

export interface ImproveOutput {
  script: string;
}

export const improveAgent: AgentDef<ImproveInput, ImproveOutput> = {
  name: "improve",
  description: "根据反思反馈改进改写稿",
  outputMode: "stream",
  temperature: 0.5,

  systemPrompt: (input) => {
    const strategyHint = input.strategyContext
      ? `\n## 改写策略提醒
- 叙事视角: ${input.strategyContext.narrativeVoice}
- 基调: ${input.strategyContext.toneAndRegister}
- 对话方针: ${input.strategyContext.dialogueApproach}

修改时必须遵循以上策略。`
      : "";

    return `你是一位资深改写专家。根据编辑反馈，对改写稿进行最终润色修改。

规则：
1. 只修改编辑指出的问题，不要大面积重写
2. 保持改写稿已有的好的部分
3. 直接输出修改后的完整文本，不要添加说明
${strategyHint}`;
  },

  userPrompt: (input) =>
    `根据编辑反馈修改以下改写稿：

【改写稿】
${input.rewrittenText}

【编辑反馈】
${input.reflectionFeedback}

请直接输出修改后的完整内容。`,

  parseOutput: (raw) => ({ script: raw }),
};

/** Build improve system prompt. Exported for reuse by legacy batch-rewrite handler. */
export function buildImproveSystemPrompt(input: ImproveInput): string {
  return improveAgent.systemPrompt(input);
}

/** Build improve user prompt. Exported for reuse by legacy batch-rewrite handler. */
export function buildImproveUserPrompt(input: ImproveInput): string {
  return improveAgent.userPrompt(input);
}
