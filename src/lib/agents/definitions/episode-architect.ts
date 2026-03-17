/**
 * Agent: episode-architect — 分集/分章架构师
 * Script mode: breaks novel into short-video episodes with hooks, pacing, and paywall strategy.
 * Novel mode: breaks novel into chapters by content rhythm and plot turning points.
 */

import type { AgentDef } from "../types";
import type { AnalysisResult } from "./novel-analyzer";

export interface EpisodeArchitectInput {
  analysisReport: AnalysisResult;
  sourceText: string;
  durationPerEp?: string; // e.g. "2-5分钟" (script mode only)
  outputFormat?: string;  // "script" | "novel" | "same"
}

export interface EpisodeOutline {
  totalEpisodes: number;
  estimatedTotalMinutes: number;
  episodes: Array<{
    number: number;
    title: string;
    synopsis: string;
    sourceRange: { start: number; end: number };
    sourceLength: number;
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

// ─── Script mode prompt (short video) ────────────────────────────

const SCRIPT_SYSTEM = `你是一位精通短视频节奏的分集策划，擅长将长篇故事拆解为独立成集又环环相扣的短视频单元。你深谙观众心理：3秒决定是否停留，30秒决定是否看完，结尾决定是否追下一集。

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

Respond ONLY with valid JSON.`;

// ─── Novel mode prompt (chapter splitting) ───────────────────────

const NOVEL_SYSTEM = `你是一位资深小说编辑，擅长分析长篇小说结构，将其拆分为节奏合理、结构完整的章节。

## 分章原则

### 字数控制（最重要）
- 每章原文切割目标：4000-8000 字
- 这是原文字数，不是输出字数
- 根据内容自然节点灵活调整，但严禁超过 10000 字或少于 3000 字
- 如果原著已有明确章节划分，优先尊重原著结构

### 字符偏移（关键要求）
- 你必须输出每章在原文中的精确字符偏移量 sourceRange: { start, end }
- start 是该章在原文中的起始字符位置（从0开始）
- end 是该章在原文中的结束字符位置（不包含）
- 相邻章节的偏移必须连续：第N章的 end === 第N+1章的 start
- 第1章的 start 必须为 0
- 最后一章的 end 必须等于原文总字数
- sourceLength = end - start

### 分章依据（按优先级）
1. **情节转折点** — 在重大事件发生前后分章
2. **场景切换** — 时间/地点/视角发生明显变化
3. **情绪节奏** — 高潮后适当留白，低谷后铺垫上升
4. **悬念设置** — 每章结尾留一个让读者想继续的钩子

### 每章结构
- 开头：承接上章 + 建立本章核心冲突/问题
- 中段：推进情节，制造张力
- 结尾：悬念或情感高点，驱动读者继续

### 钩子设计（对小说同样重要）
| 类型 | 说明 | 适用场景 |
|------|------|---------|
| 冲突钩 | 角色间的对抗即将爆发 | 对手戏、争吵前 |
| 反转钩 | 揭露一个出人意料的事实 | 身份揭秘、真相浮出 |
| 危机钩 | 主角陷入危险/困境 | 生死关头、选择困境 |
| 情感钩 | 关系出现重大变化 | 告白/分手/背叛 |
| 悬念钩 | 留下一个未解问题 | 神秘人物、未知威胁 |

### 节奏把控
- 前 3 章：建立期 — 介绍人物/世界观/核心冲突
- 中段：上升 → 高潮交替，保持阅读紧迫感
- 关键转折章：适当加长，给足空间

输出 JSON 格式，包含：totalEpisodes, estimatedTotalMinutes (设为0), episodes[], paywallSuggestion。
每个 episode 必须包含 sourceRange: { start: number, end: number } 和 sourceLength: number。

Respond ONLY with valid JSON.`;

export const episodeArchitectAgent: AgentDef<EpisodeArchitectInput, EpisodeOutline> = {
  name: "episode-architect",
  description: "将长篇故事拆分为集数/章节，设计结构和节奏",
  outputMode: "json",
  temperature: 0.4,

  systemPrompt: (input) => {
    const fmt = input.outputFormat || "script";
    if (fmt === "novel" || fmt === "same") {
      return NOVEL_SYSTEM;
    }
    return SCRIPT_SYSTEM;
  },

  userPrompt: (input) => {
    const fmt = input.outputFormat || "script";
    const analysis = JSON.stringify(input.analysisReport, null, 2);

    if (fmt === "novel" || fmt === "same") {
      const totalChars = input.sourceText.length;
      const suggestedChapters = `${Math.max(5, Math.floor(totalChars / 8000))}-${Math.ceil(totalChars / 4000)}`;
      return `基于以下分析报告和原著文本，将小说拆分为章节。

## 关键信息
- 原文总字数: ${totalChars} 字
- 建议分章数量: ${suggestedChapters} 章（每章原文 4000-8000 字）
- 你必须为每章输出精确的字符偏移 sourceRange: { start, end } 和 sourceLength

## 分析报告
${analysis}

## 原著文本
${input.sourceText}`;
    }

    const duration = input.durationPerEp || "2-5分钟";
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
