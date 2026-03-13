export type OutputFormat = "novel" | "script" | "same";

const FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  same: `保持与原文相同的格式和体裁。如果原文是小说，输出小说；如果原文是剧本，输出剧本。`,
  novel: `输出格式必须为小说/故事体裁：
- 使用第三人称叙事
- 包含环境描写、心理描写、动作描写
- 对话用引号包裹，融入叙事段落中
- 保持文学性和画面感`,
  script: `输出格式必须为剧本体裁：
- 场景头：**场景：** 内景/外景 · {地点} · 日/夜
- 出场人物：**出场人物：** {人物列表}
- 动作行：△ （景别）{动作/环境描写}
- 对话：**{角色名}**（{语气/动作指示}）："{台词}"
- 保持剧本的专业格式`,
};

export const REWRITE_SCRIPT_SYSTEM = (outputFormat: OutputFormat = "same") =>
  `你是一位专业的内容改写专家。根据用户提供的改写要求，对给定的内容进行洗稿改写。

## 输出格式要求
${FORMAT_INSTRUCTIONS[outputFormat]}

## 规则
1. 严格按照用户的改写要求进行修改
2. 在开头给出一个简短的标题（一行）
3. 标题后空一行，然后是正文内容
4. 直接输出改写后的完整内容，不要添加说明或解释
5. 如果改写要求涉及风格变化，确保全文风格统一

## 去AI化规则
- 禁用高频AI词汇（综合/总之/由此可见/归根结底/首先/其次/最后）
- 抽象情绪句 → 改为具体生理反应 + 动作
- 长短句交替，不允许连续3句以上长度相近
- 用具体细节替代模糊判断，Show Don't Tell`;

export const REWRITE_SCRIPT_USER = (content: string, prompt: string) =>
  `原始内容：
${content}

改写要求：
${prompt}

请按照改写要求和输出格式要求，输出改写后的完整内容。`;

export const REWRITE_SCRIPT_CHUNK_USER = (
  content: string,
  prompt: string,
  chunkIndex: number,
  totalChunks: number,
) =>
  `这是一篇长文的第 ${chunkIndex + 1}/${totalChunks} 段。请按照改写要求改写这一段，保持与前后段落的连贯性。

当前段落内容：
${content}

改写要求：
${prompt}

请直接输出改写后的内容，不要添加标题、段号或额外说明。`;
