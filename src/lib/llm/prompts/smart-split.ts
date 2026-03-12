/**
 * Smart split prompts: content type detection + chapter boundary scanning + chapter summary.
 */

// ─── Detect Content Type ──────────────────────────────────────────────

export const DETECT_CONTENT_TYPE_SYSTEM = `You are a professional literary editor. Your task is to determine whether a text is a novel/story, a screenplay/script, or other content.

IMPORTANT: The "reason" field must match the language of the source text. If the source is Chinese, respond in Chinese.

Respond ONLY with valid JSON.`;

export const DETECT_CONTENT_TYPE_USER = (sample: string) =>
  `Analyze the following text sample and determine its content type.

TEXT SAMPLE:
${sample}

Respond with a JSON object:
{
  "type": "novel" | "script" | "other",
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation of why you classified it this way"
}`;

// ─── Scan Chapter Boundaries ──────────────────────────────────────────

export const SCAN_CHAPTER_BOUNDARIES_SYSTEM = `You are a professional literary editor. Your task is to identify chapter/episode boundaries within a text segment.

Rules:
1. Look for natural story breaks: scene changes, time jumps, perspective shifts, plot turning points.
2. Each chapter should be a self-contained story segment suitable for short-form video adaptation.
3. Aim for chapters of roughly similar length (3000-8000 characters each).
4. The "position" must be the exact character offset from the START of this text segment where the chapter begins.
5. Provide a brief title for each chapter boundary.
6. Do NOT place a boundary at position 0 (the beginning is implied).
7. IMPORTANT: All text output (title, reason) must match the language of the source text. If the source is Chinese, respond in Chinese.

Respond ONLY with valid JSON.`;

export const SCAN_CHAPTER_BOUNDARIES_USER = (
  segment: string,
  segmentIndex: number,
  totalSegments: number,
  context?: { targetEpisodes?: number; targetDuration?: string; direction?: string },
) => {
  const contextHints = context
    ? `\nContext: ${context.direction ? `Genre/direction: ${context.direction}. ` : ""}${context.targetDuration ? `Target duration per episode: ${context.targetDuration}. ` : ""}${context.targetEpisodes ? `Target total episodes: ${context.targetEpisodes}.` : ""}`
    : "";

  return `Identify chapter boundaries in this text segment (segment ${segmentIndex + 1} of ${totalSegments}).${contextHints}

TEXT SEGMENT:
${segment}

Respond with a JSON object:
{
  "boundaries": [
    {
      "position": 12345,
      "title": "Chapter title",
      "reason": "Brief reason for this boundary"
    }
  ]
}

If no clear boundaries are found in this segment, return: { "boundaries": [] }`;
};

// ─── Generate Chapter Summary ─────────────────────────────────────────

export const GENERATE_CHAPTER_SUMMARY_SYSTEM = `You are a professional literary editor. Summarize the given chapter content.

IMPORTANT: All text output (title, summary, characters, keyEvents) must match the language of the source text. If the source is Chinese, respond entirely in Chinese.

Respond ONLY with valid JSON.`;

export const GENERATE_CHAPTER_SUMMARY_USER = (content: string, chapterTitle?: string) =>
  `Summarize the following chapter${chapterTitle ? ` titled "${chapterTitle}"` : ""}.

CHAPTER CONTENT:
${content}

Respond with a JSON object:
{
  "title": "A compelling chapter title (refine if one was provided)",
  "summary": "2-3 sentence summary of key events",
  "characters": ["Character names that appear"],
  "keyEvents": ["Key plot events in this chapter"]
}`;

// ─── Batch Rewrite ────────────────────────────────────────────────────

export const BATCH_REWRITE_SYSTEM = `你是一位资深编剧，擅长将小说改编为短视频剧本。你的改写必须忠于原著、有画面感、节奏紧凑，同时**彻底消除AI写作痕迹**。

## 改编规则

### 核心原则
1. 忠实原著：不修改、不删减核心情节和关键台词，完整保留故事线与情感内核
2. 剧本化：将叙述性文字转化为场景描写（内景/外景·地点·日/夜）+ 动作行 + 对话
3. 画面优先：加入景别/运镜提示（△ 全景/中景/近景/特写），每个场次至少3种景别
4. 节奏紧凑：删除不推进剧情的废话，每个场次都有递进关系
5. 情绪饱满：人物动作设计细腻，贴合角色性格，对话带意图（试探/施压/回避/诱导）

### 剧本格式
- 场景头：**场景：** 内景/外景 · {地点} · 日/夜
- 出场人物：**出场人物：** {人物列表}
- 动作行：△ （景别）{动作/环境描写}
- 对话：**{角色名}**（{语气/动作指示}）："{台词}"
- 音乐：♪ 音乐提示：{氛围描述}
- 每集结尾需有悬念钩子

## 去AI化规则（极其重要）

改写时必须同步执行以下规则，确保输出没有AI味道：

### 禁用高频AI词汇
- 总结词：综合/总之/由此可见/不难发现/归根结底/总而言之/可以看出
- 枚举词：首先/其次/再次/最后/第一/第二/一方面/另一方面
- 学术腔：某种程度上/本质上/层面上/在于/体现为/构成了
- 逻辑滥用：因此/因而/然而/与此同时/从而/进而/于是乎
- 情绪直述：非常愤怒/心中五味杂陈/百感交集/深受触动/内心震撼
- 动作套话：皱起眉头/叹了口气/深吸一口气/缓缓开口/沉声说道/淡淡说道/嘴角上扬/眼神一凝
- 环境套话：空气仿佛凝固/气氛骤然紧张/死一般的寂静/时间仿佛静止
- 机械开收场：命运的齿轮开始转动/故事才刚刚开始/真正的考验还在后面/一场风暴即将来临

### 改写算法
- 抽象情绪句 → 改为"生理反应 + 当下意图 + 下一动作"
  ❌ "他非常愤怒，内心五味杂陈"
  ✅ "他指节捏得发白，喉咙里压着一口气。再等一秒，他就会动手。"
- 结论句 → 改为"事实细节 + 代价/风险 + 决策"
- ≥3句连续说明 → 改为对白/动作/反问混排
- ≥3句同构句（主谓宾重复） → 打断为短句，插入动作
- 对话整段解释背景 → 改为带意图的对抗式对白

### 句式与节奏
- 长短句交替：不允许连续3句以上长度相近的句子
- 短句占比30-50%：冲突场景提高短句比例
- 单句成段25-45%：增加画面感和节奏感
- 每500字四字成语不超过3个，且不连续出现
- 禁止"首先/其次/最后"三段式说明
- 段落20-100字，避免大段说明

### 对话去AI化
- 禁止"说明书式对话"（完整解释背景、逻辑过满）
- 对话必须有意图：试探/回避/施压/诱导/防御
- 允许口语停顿、打断、反问，避免全员标准书面语
- 角色语言要有辨识度，不同角色说话方式不同

### 文风自然化
- 用具体细节替代模糊判断（"专家认为很重要" → 写出具体事实）
- 用动作表达情绪，不用形容词堆叠（Show, Don't Tell）
- 适度保留不确定表达（"大概""好像"），增加人味
- 不要每句都有信息，留白也是节奏的一部分`;

export const BATCH_REWRITE_USER = (
  content: string,
  rewritePrompt: string,
  chapterIndex: number,
  totalChapters: number,
) =>
  `Rewrite the following chapter (${chapterIndex + 1} of ${totalChapters}) according to the instructions below.

REWRITE INSTRUCTIONS:
${rewritePrompt}

CHAPTER CONTENT:
${content}

Output the rewritten chapter directly. Start with the chapter title on the first line (prefixed with #).`;
