/**
 * Agent: reflect — 改写质量反思
 * 5维评分 + AI模式检测 + 策略合规检查。
 * 复用 rewrite-script.ts 的 REFLECT prompt，增加策略上下文。
 */

import type { AgentDef } from "../types";

export interface ReflectInput {
  originalText: string;
  rewrittenText: string;
  /** 全局改写策略（可选，有则检查合规） */
  strategyContext?: {
    globalStyle: {
      narrativeVoice: string;
      toneAndRegister: string;
      sentenceRhythm: string;
      dialogueApproach: string;
      tabooPatterns: string[];
    };
    characterVoices?: Record<string, {
      speechStyle: string;
      innerWorld: string;
      uniqueMarkers: string;
    }>;
    chapterNotes?: string;
  };
}

export interface ReflectOutput {
  scores: {
    directness: { score: number; issue: string };
    rhythm: { score: number; issue: string };
    authenticity: { score: number; issue: string };
    styleMatch: { score: number; issue: string };
    conciseness: { score: number; issue: string };
  };
  totalScore: number;
  aiPatterns: string[];
  strategyCompliance: {
    followsNarrativeVoice: boolean;
    followsTone: boolean;
    followsCharacterVoices: boolean;
    violations: string[];
  };
  suggestions: string[];
}

export const reflectAgent: AgentDef<ReflectInput, ReflectOutput> = {
  name: "reflect",
  description: "反思改写质量：5维评分 + AI模式检测 + 策略合规",
  outputMode: "json",
  temperature: 0.2,

  systemPrompt: (input) => {
    const strategySection = input.strategyContext
      ? `\n## 策略合规检查

除了质量评分外，还需检查改写是否遵循了以下策略决策：
- 叙事视角: ${input.strategyContext.globalStyle.narrativeVoice}
- 基调语言层次: ${input.strategyContext.globalStyle.toneAndRegister}
- 句式节奏: ${input.strategyContext.globalStyle.sentenceRhythm}
- 对话方针: ${input.strategyContext.globalStyle.dialogueApproach}
- 禁忌模式: ${input.strategyContext.globalStyle.tabooPatterns.join("、")}
${input.strategyContext.characterVoices
  ? `- 角色语气要求: ${JSON.stringify(input.strategyContext.characterVoices)}`
  : ""}
${input.strategyContext.chapterNotes
  ? `- 本集改写要点: ${input.strategyContext.chapterNotes}`
  : ""}`
      : "";

    return `你是一位严苛的文学编辑，专门检测AI生成痕迹和写作质量问题。

对改写结果进行诊断，按5个维度评分（每项10分）并给出具体修改意见。
${strategySection}

输出严格JSON格式。`;
  },

  userPrompt: (input) =>
    `对比原文和改写稿，诊断改写质量。

【原文片段】
${input.originalText.slice(0, 3000)}

【改写稿】
${input.rewrittenText.slice(0, 5000)}

输出JSON：
{
  "scores": {
    "directness": { "score": 0, "issue": "问题描述" },
    "rhythm": { "score": 0, "issue": "问题描述" },
    "authenticity": { "score": 0, "issue": "问题描述" },
    "styleMatch": { "score": 0, "issue": "问题描述" },
    "conciseness": { "score": 0, "issue": "问题描述" }
  },
  "totalScore": 0,
  "aiPatterns": ["检测到的具体AI模式"],
  "strategyCompliance": {
    "followsNarrativeVoice": true,
    "followsTone": true,
    "followsCharacterVoices": true,
    "violations": ["具体违规描述"]
  },
  "suggestions": ["具体的修改建议，精确到某段某句"]
}`,

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  },
};
