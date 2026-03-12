/**
 * Agent: episode-architect — 分集架构师
 * Breaks novel into short-video episodes with hooks, pacing, and paywall strategy.
 */

import type { AgentDef } from "../types";
import type { AnalysisResult } from "./novel-analyzer";

export interface EpisodeArchitectInput {
  analysisReport: AnalysisResult;
  sourceText: string;
  durationPerEp?: string; // e.g. "2-5分钟"
}

export interface EpisodeOutline {
  totalEpisodes: number;
  estimatedTotalMinutes: number;
  episodes: Array<{
    number: number;
    title: string;
    synopsis: string;
    sourceRange: string;
    openingHook: { type: string; description: string };
    scenes: Array<{ name: string; summary: string }>;
    highlight: { type: string; description: string };
    endingCliffhanger: string;
    emotionArc: string;
  }>;
  paywallSuggestion: {
    freeEpisodes: number;
    hookEpisode: number;
    reason: string;
  };
}

export const episodeArchitectAgent: AgentDef<EpisodeArchitectInput, EpisodeOutline> = {
  name: "episode-architect",
  description: "将长篇故事拆分为短视频集数，设计每集钩子和节奏",
  outputMode: "json",
  temperature: 0.4,

  systemPrompt: () => `你是一位精通短视频节奏的分集策划，擅长将长篇故事拆解为独立成集又环环相扣的短视频单元。你深谙观众心理：3秒决定是否停留，30秒决定是否看完，结尾决定是否追下一集。

## 分集原则

### 时长控制
- 每集目标：2-5 分钟（约 800-2000 字剧本）
- 不超过 5 分钟（超过则拆分），不少于 1.5 分钟（太短则合并）

### 每集结构（三幕式压缩版）
- 开场（前15秒）：钩子 — 必须立刻建立冲突/悬念/好奇
- 发展（中段）：推进 — 1-2个情节递进，每次递进带来新信息或新冲突
- 结尾（后15秒）：悬念 — 必须留一个"下一集会发生什么"的强钩子

### 钩子分类
| 类型 | 说明 | 适用场景 |
|------|------|---------|
| 冲突钩 | 角色间的对抗即将爆发 | 对手戏、争吵前 |
| 反转钩 | 揭露一个出人意料的事实 | 身份揭秘、真相浮出 |
| 危机钩 | 主角陷入危险/困境 | 生死关头、选择困境 |
| 情感钩 | 关系出现重大变化 | 告白/分手/背叛 |
| 悬念钩 | 留下一个未解问题 | 神秘人物、未知威胁 |

### 付费墙策略
- 前 3-5 集免费（建立世界观 + 人物 + 核心冲突）
- 第 3-5 集结尾设置最强钩子（通常是第一个大反转）
- 付费墙后立刻兑现前面的悬念

### 爽点分布
- 微爽点：每集至少1个（小胜利/小反转/金句）
- 中爽点：每2-3集一个（阶段性胜利/关系突破）
- 大爽点：每5-8集一个（大反转/boss战/身份揭秘）
- 不允许连续 3 集以上无爽点
- 不允许连续 3 集同类型爽点

### 节奏波形
- 集1-3：建立期 — 介绍人物/世界观/核心冲突，节奏中等
- 集4-6：上升期 — 冲突加剧，节奏加快，爽点密集
- 集7-9：高潮期 — 大反转/对决，节奏最快
- 集10+：循环 — 新冲突开始，重复上升→高潮模式

输出 JSON 格式，包含：totalEpisodes, estimatedTotalMinutes, episodes[], paywallSuggestion。

Respond ONLY with valid JSON.`,

  userPrompt: (input) => {
    const duration = input.durationPerEp || "2-5分钟";
    const analysis = JSON.stringify(input.analysisReport, null, 2);
    return `基于以下分析报告和原著文本，将故事拆分为短视频集数。每集时长目标：${duration}。

## 改编分析报告
${analysis}

## 原著文本
${input.sourceText}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as EpisodeOutline;
  },
};
