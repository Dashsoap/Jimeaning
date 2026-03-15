/**
 * Agent: style-analyzer — extracts writing style fingerprint from source text.
 * Wraps the STYLE_ANALYSIS prompts into standard AgentDef.
 */

import type { AgentDef } from "../types";
import type { StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";

export interface StyleAnalyzerInput {
  sourceTextSample: string;
}

export const styleAnalyzerAgent: AgentDef<StyleAnalyzerInput, StyleFingerprint> = {
  name: "style-analyzer",
  description: "分析文本写作风格，提取风格指纹",

  systemPrompt: () =>
    `你是一位资深文学编辑。分析给定文本的写作风格特征，提取"风格指纹"。

输出严格JSON格式，所有字段用中文描述。`,

  userPrompt: (input) => {
    const text = input.sourceTextSample;
    const len = text.length;
    const sampleSize = 2000;

    // 4-point sampling: beginning + 1/3 + 2/3 + end
    const samples = [
      { label: "开头", text: text.slice(0, sampleSize) },
      { label: "中前段", text: text.slice(Math.floor(len * 0.33), Math.floor(len * 0.33) + sampleSize) },
      { label: "中后段", text: text.slice(Math.floor(len * 0.66), Math.floor(len * 0.66) + sampleSize) },
      { label: "结尾", text: text.slice(Math.max(0, len - sampleSize)) },
    ];

    return `分析以下文本的写作风格（多段采样）：

${samples.map(s => `=== ${s.label} ===\n${s.text}`).join("\n\n")}

注意：如果不同段落风格有差异，请在描述中指出变化趋势。

输出JSON：
{
  "contentType": "novel" 或 "script" 或 "other",
  "narrativeVoice": "叙事视角描述（第一人称/第三人称/全知等）",
  "sentenceStyle": "句式风格（短句为主/长短交替/铺排式等）",
  "dialogueStyle": "对话风格（口语化/书面/方言化/角色差异化等）",
  "emotionalTone": "情感基调（冷峻/温暖/讽刺/沉重等）",
  "rhythmPattern": "节奏特点（紧凑快节奏/舒缓散文化/张弛有度等）",
  "vocabularyRegister": "语言层次（文学性/通俗/网文口语/专业术语等）",
  "characterVoices": { "角色名": "说话方式特点描述" }
}`;
  },

  outputMode: "json",
  temperature: 0.3,

  parseOutput: (raw) => {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as StyleFingerprint;
  },
};
