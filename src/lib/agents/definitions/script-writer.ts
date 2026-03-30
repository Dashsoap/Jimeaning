/**
 * Agent: script-writer — 剧本编剧 / 内容改写师
 * Format-aware: outputs screenplay (script), novel rewrite (novel), or auto-detect (same).
 */

import type { AgentDef } from "../types";
import type { StyleFingerprint, OutputFormat } from "@/lib/llm/prompts/rewrite-script";
import { NOVEL_REWRITE_RULES, ANTI_AI_RULES } from "@/lib/llm/prompts/rewrite-script";

export interface ScriptWriterInput {
  episodeNumber: number;
  episodeTitle: string;
  episodeOutline: string;
  sourceText: string;
  previousEpisodeEnding?: string;
  characters: Array<{ name: string; personality: string[]; appearance: string }>;
  outputFormat?: OutputFormat;
  styleFingerprint?: StyleFingerprint;
  // Novel strategy-enhanced fields
  rewriteStrategy?: unknown;
  chapterNotes?: string;
  prevChapterSummaries?: string;
  transitionInstructions?: string;
  // Rewrite intensity control
  rewriteIntensity?: number;
  // User feedback for rewrite
  userFeedback?: string;
  currentScript?: string;
}

export interface ScriptWriterOutput {
  script: string;
}

// ─── Screenplay System Prompt (original) ────────────────────────────

const SCREENPLAY_SYSTEM = `你是一位资深的短视频编剧，擅长将小说文字转化为镜头语言。你的剧本画面感强、节奏紧凑、对话犀利，读起来脑子里自动播放画面。你痛恨AI味文字，每一句都要像真人编剧写的。

## 剧本格式

\`\`\`
# 第N集：{标题}

---

**场景：** 内景/外景 · {地点} · 日/夜

**出场人物：** 角色1、角色2

△ （景别）{动作描写}

**角色名**（语气/伴随动作）："台词"

♪ 音乐提示：{风格描述}

---
\`\`\`

## 写作规则

1. **场景头必写**：每个新场景必须有完整的场景头（内/外景·地点·时间）
2. **动作行带景别**：每个 △ 标记必须指定景别（全景/中景/近景/特写）
3. **对话带意图**：每句对话都有潜台词（试探/施压/回避/诱导/防御）
4. **对话带语气**：括号内写语气或伴随动作，不写"说道"
5. **音乐适度**：全集 2-3 处音乐提示即可
6. **悬念收尾**：最后一场必须以未解问题/即将爆发的冲突结束

## 禁止事项

- 禁止旁白解说（"他心想..."、"他感到..."→ 用动作/表情表达）
- 禁止大段独白（单人台词不超过3句）
- 禁止无冲突场景（每个场景至少有一个张力点）
- 禁止"说明书式对话"（角色替观众解释背景/设定）`;

// ─── Novel Rewrite System Prompt ────────────────────────────────────

function buildStyleContext(styleFingerprint?: StyleFingerprint): string {
  if (!styleFingerprint) return "";
  return `\n## 原文风格指纹（必须参考）
- 叙事视角: ${styleFingerprint.narrativeVoice}
- 句式风格: ${styleFingerprint.sentenceStyle}
- 对话风格: ${styleFingerprint.dialogueStyle}
- 情感基调: ${styleFingerprint.emotionalTone}
- 节奏特点: ${styleFingerprint.rhythmPattern}
- 语言层次: ${styleFingerprint.vocabularyRegister}
${Object.keys(styleFingerprint.characterVoices || {}).length > 0
    ? `- 角色语气: ${JSON.stringify(styleFingerprint.characterVoices)}`
    : ""}`;
}

const CROSS_EPISODE_CONTINUITY = `### 跨集连贯性（最重要）
- 如果给出了前一集末尾，你的开头必须与之无缝衔接
- 不要在每集开头添加"上回说到""接着上文"之类的过渡语
- 不要每集都像重新开始一个故事，要像同一本书的连续章节
- 叙事节奏、人称视角、时态必须与前一集保持一致
- 如果前一集结尾某个角色在说话/行动，本集直接延续那个场景`;

interface NameMapping {
  characters?: Record<string, string>;
  locations?: Record<string, string>;
  organizations?: Record<string, string>;
}

interface RewriteStrategyStyle {
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
  nameMapping?: NameMapping;
}

function buildStrategyContext(strategy?: unknown): string {
  if (!strategy) return "";
  const s = strategy as RewriteStrategyStyle;
  if (!s.globalStyle) return "";

  let ctx = `\n## 全局改写策略（最高优先级，必须严格遵循）
- 叙事视角: ${s.globalStyle.narrativeVoice}
- 基调/语言层次: ${s.globalStyle.toneAndRegister}
- 句式节奏: ${s.globalStyle.sentenceRhythm}
- 对话方针: ${s.globalStyle.dialogueApproach}
- 绝对禁止: ${s.globalStyle.tabooPatterns.join("、")}`;

  if (s.characterVoices && Object.keys(s.characterVoices).length > 0) {
    ctx += "\n\n### 角色语气规范";
    for (const [name, voice] of Object.entries(s.characterVoices)) {
      ctx += `\n- ${name}: 说话方式[${voice.speechStyle}]，内心表达[${voice.innerWorld}]，语言标记[${voice.uniqueMarkers}]`;
    }
  }

  // Name mapping (换名指令)
  if (s.nameMapping) {
    ctx += "\n\n### ⚠️ 专有名词替换（必须严格执行）";
    ctx += "\n以下所有原名必须替换为新名，不得遗漏任何一处：";
    if (s.nameMapping.characters && Object.keys(s.nameMapping.characters).length > 0) {
      ctx += "\n\n**人名替换：**";
      for (const [orig, replacement] of Object.entries(s.nameMapping.characters)) {
        ctx += `\n- "${orig}" → "${replacement}"`;
      }
    }
    if (s.nameMapping.locations && Object.keys(s.nameMapping.locations).length > 0) {
      ctx += "\n\n**地名替换：**";
      for (const [orig, replacement] of Object.entries(s.nameMapping.locations)) {
        ctx += `\n- "${orig}" → "${replacement}"`;
      }
    }
    if (s.nameMapping.organizations && Object.keys(s.nameMapping.organizations).length > 0) {
      ctx += "\n\n**组织名替换：**";
      for (const [orig, replacement] of Object.entries(s.nameMapping.organizations)) {
        ctx += `\n- "${orig}" → "${replacement}"`;
      }
    }
    ctx += "\n\n**重要：每一处出现的原名都必须替换，包括对话中、叙述中、心理描写中的所有出现。**";
  }

  return ctx;
}

function buildIntensityInstruction(intensity?: number): string {
  switch (intensity) {
    case 1: return `\n## 改写力度: 1/5 — 彻底重构\n- 彻底重构叙事，可以打乱段落顺序\n- 不保留任何原文句式，完全用新的方式讲述同一个故事\n- 可以大幅调整场景节奏和叙事方式\n- 唯一不变的是核心情节和人物关系`;
    case 2: return `\n## 改写力度: 2/5 — 大幅改写\n- 保留核心情节但重写绝大部分表达和结构\n- 可以调整段落顺序和叙事节奏\n- 对话保留意图但完全改写措辞\n- 描写和叙述部分需要大幅重新创作`;
    case 4: return `\n## 改写力度: 4/5 — 适度润色\n- 保留大部分原文结构和叙事节奏\n- 重点改写措辞和句式，替换关键表达\n- 对话保留大致语气，但换一种说法\n- 确保每段都有明显修改痕迹，但整体风格贴近原文`;
    case 5: return `\n## 改写力度: 5/5 — 精巧润色\n- 在原文基础上精巧润色，仅替换具体措辞\n- 保留原文句式结构和叙事节奏\n- 对话改写幅度最小，只替换个别词汇\n- 保留原文的修辞手法和描写方式，仅做表层替换`;
    default: return `\n## 改写力度: 3/5 — 标准改写\n- 保留故事骨架，彻底重写表达层\n- 每一句都要换一种说法，不保留原文句式\n- 对话保留意图但改写措辞和语气\n- 让内容读起来像另一个作者写的全新作品`;
  }
}

function buildNovelSystem(styleFingerprint?: StyleFingerprint, rewriteStrategy?: unknown, rewriteIntensity?: number): string {
  return `你是一位资深小说作家/改写专家。你擅长在保留故事骨架的前提下，彻底重写表达层，让内容读起来像另一个作者写的全新作品。你痛恨AI味文字。

${NOVEL_REWRITE_RULES}
${buildIntensityInstruction(rewriteIntensity)}

${CROSS_EPISODE_CONTINUITY}

${ANTI_AI_RULES}
${buildStyleContext(styleFingerprint)}
${buildStrategyContext(rewriteStrategy)}

输出完整的改写文本，不要添加额外说明。`;
}

// ANTI_AI_RULES imported from rewrite-script.ts (single source of truth)

// ─── Agent Definition ───────────────────────────────────────────────

export const scriptWriterAgent: AgentDef<ScriptWriterInput, ScriptWriterOutput> = {
  name: "script-writer",
  description: "将分集大纲转化为完整短视频剧本，或改写小说内容",
  outputMode: "stream",
  temperature: 0.7,

  systemPrompt: (input) => {
    const fmt = input.outputFormat || "script";

    if (fmt === "novel") {
      return buildNovelSystem(input.styleFingerprint, input.rewriteStrategy, input.rewriteIntensity);
    }

    if (fmt === "same") {
      const isScript = input.styleFingerprint?.contentType === "script";
      if (isScript) {
        return SCREENPLAY_SYSTEM + ANTI_AI_RULES;
      }
      return buildNovelSystem(input.styleFingerprint, input.rewriteStrategy, input.rewriteIntensity);
    }

    // Default: screenplay format
    return SCREENPLAY_SYSTEM + ANTI_AI_RULES;
  },

  userPrompt: (input) => {
    const fmt = input.outputFormat || "script";

    // If user provided feedback on existing script, prepend rewrite instruction
    const feedbackSection = input.userFeedback && input.currentScript
      ? `\n\n## ⚠️ 用户对当前版本的修改意见（最高优先级）\n${input.userFeedback}\n\n## 当前版本（需要根据意见重写）\n${input.currentScript}\n\n请根据以上意见重写，保留好的部分，针对性修改用户指出的问题。\n`
      : "";

    if (fmt === "novel" || (fmt === "same" && input.styleFingerprint?.contentType !== "script")) {
      // Novel rewrite mode
      const prevContext = input.previousEpisodeEnding
        ? `\n\n## 前一集末尾（必须无缝衔接，不要重复这段内容，从这之后继续）\n...${input.previousEpisodeEnding}\n\n【重要】你的改写必须从上面末尾处自然承接，语气、节奏、叙事状态保持连贯。不要重新开头，不要总结前情。`
        : "";

      const summariesSection = input.prevChapterSummaries
        ? `\n\n## 前面各集摘要（保持全局连贯）\n${input.prevChapterSummaries}`
        : "";

      const chapterNotesSection = input.chapterNotes
        ? `\n\n## 本集改写要点（策略设计师指定）\n${input.chapterNotes}`
        : "";

      const transitionSection = input.transitionInstructions
        ? `\n\n## 衔接指令\n${input.transitionInstructions}`
        : "";

      // Word count anchoring
      const sourceLen = input.sourceText.length;
      const minTarget = Math.round(sourceLen * 0.9);
      const maxTarget = Math.round(sourceLen * 1.1);
      const wordCountAnchor = `\n\n## ⚠️ 字数要求（严格遵守）
原文本段约 ${sourceLen} 字，改写后字数目标：${minTarget} - ${maxTarget} 字。
严禁大幅缩减内容，每个情节点、对话、场景都必须保留并改写。
如果发现改写后字数远少于原文，说明遗漏了内容，必须补齐。`;

      return `${feedbackSection ? feedbackSection : ""}改写第 ${input.episodeNumber} 集（共 ${input.characters.length > 0 ? "多" : ""}集连载）：${input.episodeTitle}
${prevContext}${summariesSection}${chapterNotesSection}${transitionSection}${wordCountAnchor}

## 本集大纲
${input.episodeOutline}

## 原文内容
${input.sourceText}

${feedbackSection ? "请根据用户意见重写，同时遵循以下改写规则。" : "请按照改写规则，完整改写以上内容。"}保留所有情节和对话意图，彻底重写表达方式。字数必须与原文相当（±10%）。
${input.previousEpisodeEnding ? "【关键要求】开头必须与前一集末尾自然衔接，像同一篇文章的下一段，不要有断裂感。" : ""}`;
    }

    // Screenplay mode (original behavior)
    const charInfo = input.characters
      .map((c) => `${c.name}：性格[${c.personality.join("、")}]，外貌[${c.appearance}]`)
      .join("\n");
    const prevEnding = input.previousEpisodeEnding
      ? `\n\n## 上一集结尾（用于衔接）\n${input.previousEpisodeEnding}`
      : "";

    return `${feedbackSection ? feedbackSection : ""}写第 ${input.episodeNumber} 集：${input.episodeTitle}

## 角色信息
${charInfo}

## 本集大纲
${input.episodeOutline}
${prevEnding}

## 原著对应章节
${input.sourceText}

${feedbackSection ? "请根据用户意见重写剧本，同时遵循剧本格式标准。" : "请按照剧本格式标准写出完整剧本，写完后自检去AI化规则。"}`;
  },

  parseOutput: (raw) => ({ script: raw }),
};
