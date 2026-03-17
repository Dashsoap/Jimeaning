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
    hookDensity: { score: number; issue: string };
    characterVoice: { score: number; issue: string };
    readerRetention: { score: number; issue: string };
    originality: { score: number; issue: string };
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

对改写结果进行诊断，按9个维度评分（每项10分，满分90）并给出具体修改意见。

### 1. 直接性（directness）— 满分10
是否用最直接的方式表达，没有绕弯子、铺垫过长。

### 2. 节奏（rhythm）— 满分10
句式长短交替是否自然，是否有音律感。

### 3. 真实感（authenticity）— 满分10
情感、动作、反应是否像真人，是否有具体细节而非泛泛描写。

### 4. 风格匹配（styleMatch）— 满分10
改写风格是否与原文风格一致，语言层次是否统一。

### 5. 简洁性（conciseness）— 满分10
是否有冗余表述、重复信息、多余修饰。

### 6. 钩子密度（hookDensity）— 满分10
| 9-10 | 每500-800字至少一个有效钩子（悬念/冲突/反转/情绪爆点） |
| 7-8 | 钩子分布合理，偶有长段落缺乏吸引力 |
| 5-6 | 钩子不足，有明显的"无聊地带" |
| 3-4 | 大段平铺直叙 |

### 7. 角色声纹（characterVoice）— 满分10
| 9-10 | 遮住角色名也能分辨是谁在说话 |
| 7-8 | 主要角色有辨识度，次要角色雷同 |
| 5-6 | 所有角色说话方式相似 |
| 3-4 | 像同一个人换了名字 |

### 8. 读者留存（readerRetention）— 满分10
| 9-10 | 全文没有"想划走"的段落，每段都有阅读动力 |
| 7-8 | 偶有拖沓但能快速回拉 |
| 5-6 | 有明显的"弃读风险"段落 |
| 3-4 | 多处让人失去阅读兴趣 |

### 9. 原创性/差异度（originality）— 满分10
| 9-10 | 完全看不出原文痕迹，像另一个人写的全新作品 |
| 7-8 | 大部分内容已重写，偶有原文残留表述 |
| 5-6 | 部分段落明显保留原文句式或措辞 |
| 3-4 | 大量直接复用原文，仅换了个别词语 |
| 1-2 | 几乎是原文照抄 |
${strategySection}

输出严格JSON格式。`;
  },

  userPrompt: (input) =>
    `对比原文和改写稿，诊断改写质量。

【原文】
${input.originalText}

【改写稿】
${input.rewrittenText}

输出JSON（9维评分，满分90）：
{
  "scores": {
    "directness": { "score": 0, "issue": "问题描述" },
    "rhythm": { "score": 0, "issue": "问题描述" },
    "authenticity": { "score": 0, "issue": "问题描述" },
    "styleMatch": { "score": 0, "issue": "问题描述" },
    "conciseness": { "score": 0, "issue": "问题描述" },
    "hookDensity": { "score": 0, "issue": "问题描述" },
    "characterVoice": { "score": 0, "issue": "问题描述" },
    "readerRetention": { "score": 0, "issue": "问题描述" },
    "originality": { "score": 0, "issue": "问题描述" }
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

/** Build reflect system prompt. Exported for reuse by legacy batch-rewrite handler. */
export function buildReflectSystemPrompt(input: ReflectInput): string {
  return reflectAgent.systemPrompt(input);
}

/** Build reflect user prompt. Exported for reuse by legacy batch-rewrite handler. */
export function buildReflectUserPrompt(input: ReflectInput): string {
  return reflectAgent.userPrompt(input);
}
