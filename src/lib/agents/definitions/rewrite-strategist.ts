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
  /** 改写力度 1-5 (1=面目全非, 5=精巧润色) */
  rewriteIntensity?: number;
  /** 用户要求保留的维度 */
  preserveDimensions?: string[];
}

export interface NameMapping {
  characters: Record<string, string>;   // 原人名 → 新人名
  locations: Record<string, string>;    // 原地名 → 新地名
  organizations: Record<string, string>; // 原组织名 → 新组织名
}

export interface RewriteStrategy {
  globalStyle: {
    narrativeVoice: string;
    toneAndRegister: string;
    sentenceRhythm: string;
    dialogueApproach: string;
    tabooPatterns: string[];
  };
  nameMapping: NameMapping;
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
5. 专有名词全部替换 — 人名、地名、组织名全部设计新名

## 策略设计原则

- **不是简单复述原文风格**，而是决定"改写后要呈现什么风格"
- **角色语气必须差异化** — 每个角色说话方式不同，不能所有人用同一种腔调
- **每集要有焦点** — 明确本集改写的重点（哪个场景要精写、哪个可以略写）
- **集与集之间要有过渡设计** — 上集末尾和下集开头怎么衔接
- **禁忌模式要具体** — 不是泛泛地说"不要AI味"，而是列出具体要避免的词汇和句式

## 专有名词替换策略（必须输出 nameMapping）

为所有专有名词设计替换方案：

【人名 — 最重要，必须列出所有称呼变体】
- 姓氏不同，名字不同
- 保持性别、文化背景一致
- 新名字自然、不生硬
- 必须覆盖所有出场角色（主要+次要）
- ⚠️ **必须扫描原文，列出每个角色在文中出现的所有称呼形式**，包括但不限于：
  - 全名：唐易 → 周难
  - 姓+职务/尊称：唐总 → 周总、唐先生 → 周先生、唐老师 → 周老师
  - 亲昵/简称：小唐 → 小周、老唐 → 老周
  - 只用名字：易哥 → 难哥（如果原文有这种称呼）
  - 绰号/外号：如果原文有绰号也要替换
- **每个变体都必须作为独立的 key-value 出现在 characters 映射中**
- 遗漏任何一个变体都会导致改写后的文本中出现原名

【地名】
- 保持地理特征一致（沿海城市→另一个沿海城市或虚构沿海城市）
- 山城→山城，南方→南方
- 可以捏造一个符合特征的虚构地名
- 真实且知名的地名（如北京、上海）可保留，但作品特定的地名必须替换

【组织名】
- 门派/公司/帮会等全部替换
- 保持气质相近（武侠门派名仍有武侠味，现代公司名仍有商业感）

输出严格JSON格式。`,

  userPrompt: (input) => {
    const outlinesText = input.episodeOutlines
      .map((ep) => `### 第${ep.episodeNumber}集：${ep.title}\n${ep.outline}`)
      .join("\n\n");

    const charsText = input.characters
      .map((c) => `- ${c.name}：性格[${c.personality.join("、")}]，外貌[${c.appearance}]`)
      .join("\n");

    // Build preserve dimensions & intensity context
    const intensityLabels: Record<number, string> = {
      1: "彻底重构（面目全非）— 打乱结构、重组段落、完全改变叙事方式",
      2: "大幅改写 — 保留核心情节但重写绝大部分表达和结构",
      3: "标准改写 — 保留故事骨架，彻底重写表达层（默认）",
      4: "适度润色 — 保留大部分原文结构，重点改写措辞和句式",
      5: "精巧润色 — 仅替换具体措辞和表达，保留原文整体风格",
    };
    const dimLabels: Record<string, string> = {
      plot: "情节骨架（故事线、人物关系、因果链）",
      dialogue: "对话风格（语气、节奏、口吻）",
      narrative: "叙事视角（人称和叙事角度）",
      description: "描写手法（比喻、修辞手法）",
      emotion: "情感节奏（情感起伏和张力节奏）",
    };

    const intensity = input.rewriteIntensity ?? 3;
    const preserveSection = input.preserveDimensions?.length
      ? `\n## ⚠️ 用户要求保留的维度（策略设计时必须尊重）\n${input.preserveDimensions.map((d) => `- ✅ ${dimLabels[d] || d}`).join("\n")}\n\n这些维度在改写时应尽量保留原文特征，策略中的 globalStyle 和 chapterPlans 必须体现这些保留要求。`
      : "";
    const intensitySection = `\n## 改写力度: ${intensity}/5 — ${intensityLabels[intensity] || intensityLabels[3]}\n请根据此力度级别制定策略。力度越低（1-2），改写幅度越大；力度越高（4-5），越贴近原文。`;

    return `${preserveSection}${intensitySection}

## 原文风格指纹
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
  "nameMapping": {
    "characters": {
      "唐易": "周难",
      "唐总": "周总",
      "小唐": "小周",
      "唐先生": "周先生",
      "沈清漪": "林碧涟",
      "沈小姐": "林小姐",
      "清漪": "碧涟"
    },
    "locations": { "原地名": "新地名" },
    "organizations": { "原组织名": "新组织名" }
  },
  "characterVoices": {
    "新角色名（使用nameMapping替换后的名字）": {
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
