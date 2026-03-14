/**
 * Agent: rewrite-strategist — 改写策略设计师
 * 通读全文摘要 + 风格指纹 + 分析数据，制定整体改写策略。
 */

import type { AgentDef } from "../types";

export interface RewriteStrategyInput {
  /** 各集大纲 */
  episodeOutlines: Array<{
    episodeNumber: number;
    title: string;
    outline: string;
  }>;
  /** 风格指纹 */
  styleFingerprint: {
    contentType: string;
    narrativeVoice: string;
    sentenceStyle: string;
    dialogueStyle: string;
    emotionalTone: string;
    rhythmPattern: string;
    vocabularyRegister: string;
    characterVoices: Record<string, string>;
  };
  /** 分析数据中的角色 */
  characters: Array<{ name: string; personality: string[]; appearance: string }>;
  /** 原文采样（前 8000 字） */
  sourceTextSample: string;
  /** 总集数 */
  totalEpisodes: number;
}

export interface RewriteStrategy {
  globalStyle: {
    narrativeVoice: string;
    toneAndRegister: string;
    sentenceRhythm: string;
    dialogueApproach: string;
    tabooPatterns: string[];
  };
  characterVoices: Record<string, {
    speechStyle: string;
    innerWorld: string;
    uniqueMarkers: string;
  }>;
  chapterPlans: Array<{
    episodeNumber: number;
    focusPoints: string[];
    transitionFromPrev: string;
    transitionToNext: string;
    keySceneTreatment: string;
    emotionalArc: string;
  }>;
  coherenceRules: {
    recurringMotifs: string[];
    timelineConsistency: string;
    characterArcProgression: string;
    foreshadowingNotes: string[];
  };
  humanReadableSummary: string;
}

export const rewriteStrategistAgent: AgentDef<RewriteStrategyInput, RewriteStrategy> = {
  name: "rewrite-strategist",
  description: "通读全文，制定整体改写策略",
  outputMode: "json",
  temperature: 0.5,

  systemPrompt: () => `你是一位资深小说改写编辑总监。你的工作是在改写开始前，通读全部内容，制定一份完整的改写策略。

你的策略将指导后续每一集的改写，确保：
1. 全书风格统一 — 不会每集风格不同
2. 角色语气一致 — 每个角色有固定的说话方式
3. 跨集连贯 — 前后集的情节、伏笔、情感弧互相呼应
4. 去AI化 — 明确标记要避免的AI写作模式

## 策略设计原则

- **不是简单复述原文风格**，而是决定"改写后要呈现什么风格"
- **角色语气必须差异化** — 每个角色说话方式不同，不能所有人用同一种腔调
- **每集要有焦点** — 明确本集改写的重点（哪个场景要精写、哪个可以略写）
- **集与集之间要有过渡设计** — 上集末尾和下集开头怎么衔接
- **禁忌模式要具体** — 不是泛泛地说"不要AI味"，而是列出具体要避免的词汇和句式

输出严格JSON格式。`,

  userPrompt: (input) => {
    const outlinesText = input.episodeOutlines
      .map((ep) => `### 第${ep.episodeNumber}集：${ep.title}\n${ep.outline}`)
      .join("\n\n");

    const charsText = input.characters
      .map((c) => `- ${c.name}：性格[${c.personality.join("、")}]，外貌[${c.appearance}]`)
      .join("\n");

    return `## 原文风格指纹
- 内容类型: ${input.styleFingerprint.contentType}
- 叙事视角: ${input.styleFingerprint.narrativeVoice}
- 句式风格: ${input.styleFingerprint.sentenceStyle}
- 对话风格: ${input.styleFingerprint.dialogueStyle}
- 情感基调: ${input.styleFingerprint.emotionalTone}
- 节奏特点: ${input.styleFingerprint.rhythmPattern}
- 语言层次: ${input.styleFingerprint.vocabularyRegister}
${Object.keys(input.styleFingerprint.characterVoices).length > 0
  ? `- 角色原始语气: ${JSON.stringify(input.styleFingerprint.characterVoices)}`
  : ""}

## 角色信息
${charsText}

## 全部分集大纲（共${input.totalEpisodes}集）
${outlinesText}

## 原文采样
${input.sourceTextSample}

请制定完整的改写策略，输出JSON：
{
  "globalStyle": {
    "narrativeVoice": "改写后的叙事视角决策",
    "toneAndRegister": "改写后的基调和语言层次",
    "sentenceRhythm": "句式节奏策略",
    "dialogueApproach": "对话改写方针",
    "tabooPatterns": ["要避免的具体AI模式词汇/句式"]
  },
  "characterVoices": {
    "角色名": {
      "speechStyle": "说话方式",
      "innerWorld": "内心世界表达方式",
      "uniqueMarkers": "这个角色独有的语言标记"
    }
  },
  "chapterPlans": [
    {
      "episodeNumber": 1,
      "focusPoints": ["本集改写的重点场景/段落"],
      "transitionFromPrev": "从上一集如何过渡到本集",
      "transitionToNext": "本集末尾如何过渡到下一集",
      "keySceneTreatment": "关键场景的特殊处理方法",
      "emotionalArc": "本集的情绪走向"
    }
  ],
  "coherenceRules": {
    "recurringMotifs": ["贯穿全文的意象/母题"],
    "timelineConsistency": "时间线注意事项",
    "characterArcProgression": "角色成长弧线",
    "foreshadowingNotes": ["伏笔提醒"]
  },
  "humanReadableSummary": "200-300字的改写策略概述（给用户审阅用）"
}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  },
};
