/**
 * Agent: reader-simulator — 从普通读者视角评估内容吸引力
 * 不是文学评论家，而是目标读者。标注"想划走"和"想截图分享"的位置。
 */

import type { AgentDef } from "../types";

export interface ReaderSimInput {
  script: string;
  targetAudience?: string;
  episodeNumber: number;
  isPaywallCandidate?: boolean;
}

export interface ReaderSimOutput {
  overallEngagement: number;
  boringSegments: Array<{
    location: string;
    reason: string;
    swipeAwayRisk: "high" | "medium" | "low";
  }>;
  hookEffectiveness: Array<{
    location: string;
    type: string;
    strength: number;
  }>;
  paywallReadiness?: {
    wouldPay: boolean;
    reason: string;
    suggestedPaywallPoint?: string;
  };
  emotionalJourney: string;
}

export const readerSimulatorAgent: AgentDef<ReaderSimInput, ReaderSimOutput> = {
  name: "reader-simulator",
  description: "模拟普通读者视角，评估内容吸引力和留存风险",
  outputMode: "json",
  temperature: 0.6,

  systemPrompt: (input) => {
    const audience = input.targetAudience || "18-35岁网文读者";
    const paywallNote = input.isPaywallCandidate
      ? `\n\n这是第${input.episodeNumber}集，处于付费墙候选区间（第3-5集）。请特别关注这一集是否能让读者产生"必须看下去"的冲动，是否值得为后续内容付费。`
      : "";

    return `你是一个${audience}，正在用手机刷小说。你不是文学评论家——你就是一个普通读者，用最直觉的反应来评价这个故事。

你的任务：
1. 像真正的读者一样从头到尾读一遍
2. 标出你"想划走"的地方（boring segments）——具体到哪一段、为什么无聊
3. 标出让你觉得"有意思"的钩子——悬念、反转、情绪爆点
4. 用一句话概括你读完后的情绪变化${paywallNote}

用口语化的方式评价，像你在跟朋友吐槽/安利一样。

输出严格JSON格式。`;
  },

  userPrompt: (input) => {
    const paywallField = input.isPaywallCandidate
      ? `
  "paywallReadiness": {
    "wouldPay": true/false,
    "reason": "为什么愿意/不愿意付费",
    "suggestedPaywallPoint": "建议的付费断点位置"
  },`
      : "";

    return `阅读以下第${input.episodeNumber}集内容，给出你作为读者的真实反应：

${input.script.slice(0, 8000)}

输出JSON：
{
  "overallEngagement": 0,
  "boringSegments": [
    { "location": "第X段/开头200字", "reason": "为什么想划走", "swipeAwayRisk": "high/medium/low" }
  ],
  "hookEffectiveness": [
    { "location": "位置描述", "type": "悬念/反转/情绪/冲突", "strength": 0 }
  ],${paywallField}
  "emotionalJourney": "一句话概括阅读过程中的情绪变化"
}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  },
};
