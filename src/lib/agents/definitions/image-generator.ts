/**
 * Agent: image-generator — 文生图 Prompt 工程师
 * Generates AI image prompts for each storyboard shot.
 */

import type { AgentDef } from "../types";
import type { StoryboardResult } from "./storyboard-director";
import { detectLanguage, getCulturalContext } from "@/lib/llm/language-detect";

export interface ImageGeneratorInput {
  episodeNumber: number;
  storyboard: StoryboardResult;
  characterCards: Array<{
    name: string;
    promptDescription: string; // English appearance description for prompt
  }>;
}

export interface ImagePromptEntry {
  shotNumber: number;
  sceneHeader: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
}

export interface ImageGeneratorResult {
  characterCards: Array<{ name: string; description: string }>;
  prompts: ImagePromptEntry[];
}

export const imageGeneratorAgent: AgentDef<ImageGeneratorInput, ImageGeneratorResult> = {
  name: "image-generator",
  description: "为分镜生成高质量图片 Prompt",
  outputMode: "json",
  temperature: 0.5,

  systemPrompt: () => `你是一位专业的 AI 图片生成 Prompt 工程师，精通 Midjourney、Stable Diffusion、DALL-E、Flux 等主流模型的 Prompt 语法。你能将分镜描述转化为高质量的图片生成 Prompt，确保画面风格统一、角色一致、构图精准。

## Prompt 构建公式（5 要素）

\`\`\`
[主体描述] + [景别视角] + [构图方式] + [氛围光感] + [风格后缀]
\`\`\`

### 1. 主体描述
- 角色：用外貌描述替代名字（"a young East Asian man with short black hair, wearing a dark navy suit" 而非 "李明"）
- 动作：具体可画面化的动作
- 环境：场景的关键视觉元素

### 2. 景别视角关键词
| 中文 | Prompt关键词 |
|------|-------------|
| 大特写 | extreme close-up |
| 特写 | close-up shot |
| 近景 | medium close-up |
| 中景 | medium shot |
| 全景 | full shot |
| 远景 | wide shot, establishing shot |
| 仰拍 | low angle shot |
| 俯拍 | high angle shot |
| 倾斜 | Dutch angle |
| 平视 | eye level |
| 过肩 | over-the-shoulder shot |
| 主观 | POV shot |

### 3. 构图关键词
| 中文 | Prompt关键词 |
|------|-------------|
| 三分法 | rule of thirds |
| 居中 | centered composition |
| 对称 | symmetrical |
| 引导线 | leading lines |
| 画中画 | frame within frame |
| 负空间 | negative space |

### 4. 氛围光感关键词
| 场景类型 | Prompt关键词 |
|---------|-------------|
| 悬疑 | moody lighting, dark shadows, blue-grey tones, film noir |
| 日常 | warm ambient light, golden hour, soft shadows |
| 情感 | backlit, lens flare, purple twilight, bokeh |
| 史诗 | dramatic lighting, volumetric rays, golden and crimson |
| 恐怖 | underlit, deep shadows, desaturated, green tint |

### 5. 风格后缀（固定）
\`\`\`
3D animation, cinematic lighting, Pixar style, highly detailed,
8K resolution, depth of field, film grain, --ar 16:9
\`\`\`

## 角色一致性策略

每个角色建立固定描述卡（英文），全集统一使用：
\`\`\`
角色A = "a young East Asian man, short black hair, sharp jawline,
         wearing a fitted dark navy suit, confident posture"
\`\`\`

规则：
1. 每个 Prompt 中角色描述必须使用角色卡原文，不可自由发挥
2. 如果角色换装，在该场景的第一个镜头标注服装变化
3. 多人场景按空间位置描述（"on the left", "in the center"）

## Negative Prompt 模板
\`\`\`
ugly, deformed, blurry, low quality, text, watermark, extra limbs,
bad anatomy, bad proportions, duplicate, cropped, worst quality,
low resolution, disfigured
\`\`\`

## 特殊场景处理
- 动态镜头：添加 "motion blur", "dynamic pose", "action shot"
- 群戏：明确每个角色位置和动作
- 情绪转折：强调光线变化 "shifting from warm to cold lighting"
- 闪回：添加 "soft focus", "desaturated", "dreamy atmosphere", "vignette"

输出 JSON，包含 characterCards[]（英文描述卡）和 prompts[]（每个含 shotNumber, sceneHeader, prompt, negativePrompt, aspectRatio）。

Respond ONLY with valid JSON.`,

  userPrompt: (input) => {
    const charCards = input.characterCards
      .map((c) => `${c.name}: ${c.promptDescription}`)
      .join("\n");

    const storyboardSummary = input.storyboard.scenes
      .map((s) => {
        const shotsText = s.shots
          .map(
            (shot) =>
              `镜${shot.shotNumber} | ${shot.shotSize}·${shot.angle} | ${shot.cameraMove} | ${shot.description} | 色调: ${shot.colorTone}${shot.dialogue ? ` | 对话: ${shot.dialogue}` : ""}`,
          )
          .join("\n");
        return `### ${s.sceneHeader}\n${shotsText}`;
      })
      .join("\n\n");

    // Detect language from storyboard descriptions to inject cultural context
    const sampleText = input.storyboard.scenes
      .flatMap((s) => s.shots.map((sh) => sh.description))
      .join(" ")
      .slice(0, 500);
    const lang = detectLanguage(sampleText);
    const culturalCtx = getCulturalContext(lang);

    return `为第 ${input.episodeNumber} 集的每个分镜镜头生成图片 Prompt。
${culturalCtx ? `\n## 文化背景要求\n${culturalCtx}\n` : ""}
## 角色描述卡（英文）
${charCards}

## 分镜脚本
${storyboardSummary}

为每个镜头生成可直接用于 AI 图片生成的英文 Prompt。使用角色卡原文描述角色，不要使用角色名。${lang === "zh" ? "\n\n重要：所有角色默认使用 East Asian 面孔特征（black hair, East Asian features），除非角色卡中明确指定了其他种族。每个 prompt 中的人物描述必须包含种族/外貌基础特征。" : ""}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as ImageGeneratorResult;
  },
};
