/**
 * Agent: novel-analyzer — 改编分析师
 * Analyzes source novel to extract characters, plot structure, emotion curve, adaptation feasibility.
 */

import type { AgentDef } from "../types";
import { detectLanguage, getCharacterAppearanceDefault } from "@/lib/llm/language-detect";

export interface AnalyzerInput {
  sourceText: string;
  segmentIndex?: number;
  totalSegments?: number;
}

export interface AnalysisResult {
  genre: { main: string; subTags: string[]; audience: string; tone: string };
  characters: Array<{
    name: string;
    aliases?: string[];
    role: string;
    identity: string;
    personality: string[];
    appearance: string;
    arc: string;
    relationships: Array<{ target: string; type: string; description: string }>;
  }>;
  plotSkeleton: {
    oneLiner: string;
    coreConflict: string;
    turningPoints: Array<{ event: string; position: string; impact: string }>;
    subplots: Array<{ name: string; description: string; intersect: string }>;
  };
  emotionCurve: Array<{
    range: string;
    direction: string;
    event: string;
    beat: string;
  }>;
  adaptationAssessment: {
    visualDifficulty: string;
    dialogueRatio: string;
    sceneCount: number;
    recommendedEpisodes: string;
    innerMonologueRatio: string;
    cutSuggestions: string[];
    addSuggestions: string[];
  };
  highlights: Array<{
    name: string;
    position: string;
    excerpt: string;
    visualPotential: number;
    suggestion: string;
  }>;
}

export const novelAnalyzerAgent: AgentDef<AnalyzerInput, AnalysisResult> = {
  name: "novel-analyzer",
  description: "分析原著，提取改编所需的结构化信息",
  outputMode: "json",
  temperature: 0.3,

  systemPrompt: () => `你是一位资深影视改编策划，擅长分析网文并评估短视频改编可行性。

你的分析必须面向"如何拍成短视频"，所有结论基于原文事实。

输出 JSON，包含以下 6 个顶层字段：

1. genre: { main, subTags[], audience, tone }
2. characters[]: { name, aliases[], role(主角/配角/反派), identity, personality[], appearance(具体外貌，供文生图用), arc, relationships[] }
3. plotSkeleton: { oneLiner, coreConflict, turningPoints[], subplots[] }
4. emotionCurve[]: { range, direction(📈/📉/💥/💔/😍), event, beat }
5. adaptationAssessment: { visualDifficulty, dialogueRatio, sceneCount, recommendedEpisodes, innerMonologueRatio, cutSuggestions[], addSuggestions[] }
6. highlights[]: { name, position, excerpt(50字以内), visualPotential(1-5), suggestion }

角色外貌必须具体到发型/体型/标志性穿着/种族特征。如原著没写，根据身份合理推断并在描述中标注"[推断]"。

Respond ONLY with valid JSON.`,

  userPrompt: (input) => {
    const lang = detectLanguage(input.sourceText);
    const appearanceNote = getCharacterAppearanceDefault(lang);
    const segInfo = input.totalSegments && input.totalSegments > 1
      ? `\n（这是第 ${(input.segmentIndex ?? 0) + 1}/${input.totalSegments} 段，请分析此段内容）`
      : "";
    return `分析以下小说文本，提取改编所需的全部结构化信息。${segInfo}
${appearanceNote ? `\n注意：${appearanceNote}\n` : ""}
原著文本：
${input.sourceText}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as AnalysisResult;
  },
};
