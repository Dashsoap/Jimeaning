/**
 * Rewrite prompts — style-aware, format-specific, with reflect-improve cycle.
 *
 * Pipeline:
 *   1. STYLE_ANALYSIS — extract style fingerprint from source text
 *   2. REWRITE — format-specific (novel / script / same) with style context
 *   3. REFLECT — self-critique the rewrite for AI traces and quality
 *   4. IMPROVE — apply reflection to produce final version
 */

export type OutputFormat = "novel" | "script" | "same";

// ─── Style Fingerprint ─────────────────────────────────────────────────

export interface StyleFingerprint {
  contentType: "novel" | "script" | "other";
  narrativeVoice: string;
  sentenceStyle: string;
  dialogueStyle: string;
  emotionalTone: string;
  rhythmPattern: string;
  vocabularyRegister: string;
  characterVoices: Record<string, string>;
}

export const STYLE_ANALYSIS_SYSTEM = `你是一位资深文学编辑。分析给定文本的写作风格特征，提取"风格指纹"。

输出严格JSON格式，所有字段用中文描述。`;

export const STYLE_ANALYSIS_USER = (sample: string) =>
  `分析以下文本的写作风格：

${sample.slice(0, 6000)}

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

// ─── Novel Rewrite (洗稿) ───────────────────────────────────────────────

export const NOVEL_REWRITE_RULES = `## 小说洗稿规则

### 核心原则
1. **保留故事骨架**：情节线、人物关系、因果链不能改动
2. **重写表达层**：叙述方式、描写手法、节奏编排全部重构
3. **保持原文气质**：严格参考风格指纹，不要改变叙事基调

### 重写手法
- **叙述重构**：同一事件用不同叙事角度、时间顺序重新呈现
- **描写替换**：环境/外貌/动作描写全部重新创作，不复用原文修辞
- **对话重写**：保留对话意图和信息量，改变措辞和节奏
- **结构微调**：段落长度、场景衔接方式可以调整

### 禁止
- 不要改变人物性格和行为逻辑
- 不要增删情节事件
- 不要改变时代背景和世界观设定`;

const SCRIPT_REWRITE_RULES = `## 剧本洗稿规则

### 核心原则
1. **保留场景结构**：场次顺序、关键台词意图、情节节点不变
2. **重写画面指令**：景别、运镜、动作行全部重新设计
3. **强化视觉叙事**：每个场次至少3种景别变化

### 剧本格式
- 场景头：**场景：** 内景/外景 · {地点} · 日/夜
- 出场人物：**出场人物：** {人物列表}
- 动作行：△ （景别）{动作/环境描写}
- 对话：**{角色名}**（{语气/动作指示}）："{台词}"
- 音乐：♪ 音乐提示：{氛围描述}

### 重写手法
- **台词重写**：保留意图（试探/施压/回避/诱导），改变措辞
- **动作行重构**：同一动作用不同景别和运镜方式呈现
- **节奏重编**：调整对话密度和动作行比例
- **情绪线索**：用具体的生理反应和微表情替代抽象情绪词`;

const NOVEL_TO_SCRIPT_RULES = `## 小说改编剧本规则

### 核心原则
1. **忠实原著**：不修改、不删减核心情节和关键台词
2. **剧本化转换**：叙述性文字 → 场景描写 + 动作行 + 对话
3. **画面优先**：加入景别/运镜提示，每个场次至少3种景别
4. **节奏紧凑**：删除不推进剧情的描写，每个场次有递进关系

### 剧本格式
- 场景头：**场景：** 内景/外景 · {地点} · 日/夜
- 出场人物：**出场人物：** {人物列表}
- 动作行：△ （景别）{动作/环境描写}
- 对话：**{角色名}**（{语气/动作指示}）："{台词}"
- 音乐：♪ 音乐提示：{氛围描述}
- 每集结尾需有悬念钩子

### 转换手法
- 心理描写 → 微表情 + 小动作 + 潜台词
- 环境叙述 → △ 全景/中景/近景 镜头指令
- 叙述性对话 → 带意图的对抗式对白
- 时间跳跃 → 场景转换 + 过场提示`;

// ─── Anti-AI Rules (Humanizer-zh inspired) ──────────────────────────────

export const ANTI_AI_RULES = `## 去AI化规则（最高优先级）

### 24种AI模式检测与消除

**内容模式：**
1. 禁止夸大象征意义（"命运的齿轮""历史的转折点"）
2. 禁止宣传式语言（"令人瞩目""具有划时代意义"）
3. 禁止模糊归因（"据专家称""有人认为"）

**语言模式：**
4. 禁用AI高频词：此外/至关重要/深入探讨/充满活力/格局/关键性的/值得注意的是
5. 禁用总结词：综合/总之/由此可见/不难发现/归根结底/总而言之
6. 禁用枚举词：首先/其次/再次/最后/第一/第二/一方面/另一方面
7. 禁用学术腔：某种程度上/本质上/层面上/体现为/构成了
8. 禁用逻辑滥用：因此/因而/然而/与此同时/从而/进而/于是乎
9. 禁止"不仅...而且..."三段式

**情绪与动作：**
10. 禁止直述情绪：非常愤怒/心中五味杂陈/百感交集/深受触动/内心震撼
11. 禁用动作套话：皱起眉头/叹了口气/深吸一口气/缓缓开口/沉声说道/淡淡说道/嘴角上扬/眼神一凝
12. 禁用环境套话：空气仿佛凝固/气氛骤然紧张/死一般的寂静/时间仿佛静止
13. 禁用开收场：命运的齿轮开始转动/故事才刚刚开始/真正的考验还在后面

**风格模式：**
14. 禁止连续3句以上长度相近的句子
15. 禁止同义词机械轮换（为了避免重复而强行换词）
16. 禁止"从X到Y"虚假范围标记
17. 每500字四字成语不超过3个

### 改写算法
- 抽象情绪句 → 生理反应 + 当下意图 + 下一动作
  ❌ "他非常愤怒，内心五味杂陈"
  ✅ "他指节捏得发白，喉咙里压着一口气。再等一秒，他就会动手。"
- 结论句 → 事实细节 + 代价/风险 + 决策
- ≥3句连续说明 → 对白/动作/反问混排
- ≥3句同构句（主谓宾重复）→ 打断为短句，插入动作
- 对话整段解释背景 → 带意图的对抗式对白

### 句式与节奏
- 长短句交替：不允许连续3句以上长度相近
- 短句占比30-50%：冲突场景提高短句比例
- 单句成段25-45%：增加画面感
- 段落20-100字，避免大段说明
- 对话要有意图：试探/回避/施压/诱导/防御
- 允许口语停顿、打断、反问`;

// ─── System Prompts ─────────────────────────────────────────────────────

function getFormatRules(outputFormat: OutputFormat, contentType?: string): string {
  if (outputFormat === "script") return SCRIPT_REWRITE_RULES;
  if (outputFormat === "novel") return NOVEL_REWRITE_RULES;
  // "same" — detect from content type
  if (contentType === "script") return SCRIPT_REWRITE_RULES;
  return NOVEL_REWRITE_RULES;
}

export const REWRITE_SYSTEM = (
  outputFormat: OutputFormat,
  styleFingerprint?: StyleFingerprint,
) => {
  const formatRules = getFormatRules(outputFormat, styleFingerprint?.contentType);

  const styleContext = styleFingerprint
    ? `## 原文风格指纹（必须参考）
- 内容类型: ${styleFingerprint.contentType}
- 叙事视角: ${styleFingerprint.narrativeVoice}
- 句式风格: ${styleFingerprint.sentenceStyle}
- 对话风格: ${styleFingerprint.dialogueStyle}
- 情感基调: ${styleFingerprint.emotionalTone}
- 节奏特点: ${styleFingerprint.rhythmPattern}
- 语言层次: ${styleFingerprint.vocabularyRegister}
${Object.keys(styleFingerprint.characterVoices).length > 0
      ? `- 角色语气: ${JSON.stringify(styleFingerprint.characterVoices)}`
      : ""}`
    : "";

  return `你是一位资深内容改写专家。根据用户要求对内容进行深度洗稿改写。

${formatRules}

${ANTI_AI_RULES}

${styleContext}

## 输出规则
1. 在开头给出一个简短的标题（一行，# 开头）
2. 标题后空一行，然后是正文
3. 直接输出改写后的完整内容，不要添加说明
4. 全文风格统一`;
};

export const REWRITE_USER = (content: string, prompt: string) =>
  `原始内容：
${content}

改写要求：
${prompt}

请按照改写要求和输出格式要求，输出改写后的完整内容。`;

export const REWRITE_CHUNK_USER = (
  content: string,
  prompt: string,
  chunkIndex: number,
  totalChunks: number,
  prevChunkTail?: string,
) => {
  const contextHint = prevChunkTail
    ? `前一段末尾（仅作衔接参考，不要重复）：
...${prevChunkTail}

`
    : "";

  return `${contextHint}这是一篇长文的第 ${chunkIndex + 1}/${totalChunks} 段。请按照改写要求改写这一段，保持与前后段落的连贯性。

当前段落内容：
${content}

改写要求：
${prompt}

请直接输出改写后的内容，不要添加标题、段号或额外说明。`;
};

// ─── Reflect Prompt ─────────────────────────────────────────────────────

export const REFLECT_SYSTEM = `你是一位严苛的文学编辑，专门检测AI生成痕迹和写作质量问题。

对改写结果进行诊断，按5个维度评分（每项10分）并给出具体修改意见。
输出严格JSON格式。`;

export const REFLECT_USER = (original: string, rewritten: string) =>
  `对比原文和改写稿，诊断改写质量。

【原文片段】
${original.slice(0, 3000)}

【改写稿】
${rewritten.slice(0, 5000)}

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
  "aiPatterns": ["检测到的具体AI模式，如：连续使用了3个四字成语"],
  "suggestions": ["具体的修改建议，精确到某段某句"]
}`;

// ─── Improve Prompt ─────────────────────────────────────────────────────

export const IMPROVE_SYSTEM = `你是一位资深改写专家。根据编辑反馈，对改写稿进行最终润色修改。

规则：
1. 只修改编辑指出的问题，不要大面积重写
2. 保持改写稿已有的好的部分
3. 直接输出修改后的完整文本，不要添加说明`;

export const IMPROVE_USER = (rewritten: string, reflection: string) =>
  `根据编辑反馈修改以下改写稿：

【改写稿】
${rewritten}

【编辑反馈】
${reflection}

请直接输出修改后的完整内容。`;

// ─── Batch Rewrite (cross-chapter context) ──────────────────────────────

export const BATCH_REWRITE_SYSTEM = (
  outputFormat: OutputFormat,
  styleFingerprint?: StyleFingerprint,
) => {
  const formatRules = getFormatRules(outputFormat, styleFingerprint?.contentType);

  const styleContext = styleFingerprint
    ? `## 原文风格指纹（必须参考）
- 叙事视角: ${styleFingerprint.narrativeVoice}
- 句式风格: ${styleFingerprint.sentenceStyle}
- 对话风格: ${styleFingerprint.dialogueStyle}
- 情感基调: ${styleFingerprint.emotionalTone}
- 节奏特点: ${styleFingerprint.rhythmPattern}
- 语言层次: ${styleFingerprint.vocabularyRegister}`
    : "";

  return `你是一位资深编剧/作家，擅长内容深度改写。你的改写必须忠于原著，同时彻底消除AI写作痕迹。

${formatRules}

${ANTI_AI_RULES}

${styleContext}`;
};

export const BATCH_REWRITE_USER = (
  content: string,
  rewritePrompt: string,
  chapterIndex: number,
  totalChapters: number,
  prevChapterSummary?: string,
  prevChapterTail?: string,
) => {
  const contextSection = prevChapterSummary
    ? `## 前一章概要（保持连贯性）
${prevChapterSummary}
${prevChapterTail ? `\n前一章末尾：\n...${prevChapterTail}\n` : ""}
`
    : "";

  return `${contextSection}改写以下章节（第 ${chapterIndex + 1}/${totalChapters} 章）。

改写要求：
${rewritePrompt}

章节内容：
${content}

输出改写后的章节。第一行为章节标题（# 开头）。`;
};

// ─── Chapter Summary (for cross-chapter context) ────────────────────────

export const CHAPTER_SUMMARY_SYSTEM = `用2-3句话概括章节的核心事件和人物状态变化。直接输出摘要文本，不要格式标记。`;

export const CHAPTER_SUMMARY_USER = (content: string) =>
  `概括以下章节：\n\n${content.slice(0, 4000)}`;

