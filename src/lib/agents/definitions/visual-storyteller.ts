/**
 * Agent: visual-storyteller — 视觉叙事师
 * Applies "Show Don't Tell" annotations to storyboard shots.
 * Runs in parallel with storyboard-director or as a post-processing step.
 */

import type { AgentDef } from "../types";
import type { StoryboardResult } from "./storyboard-director";

export interface VisualStorytellerInput {
  episodeNumber: number;
  script: string;
  storyboard: StoryboardResult;
}

export interface VisualAnnotation {
  shotNumber: number;
  category: "emotion" | "relationship" | "time" | "psychology" | "prop";
  original: string;
  visualTranslation: string;
  technique: string;
}

export interface VisualStorytellerResult {
  annotations: VisualAnnotation[];
  summary: string;
}

export const visualStorytellerAgent: AgentDef<VisualStorytellerInput, VisualStorytellerResult> = {
  name: "visual-storyteller",
  description: "用画面讲故事，消除旁白解说依赖",
  outputMode: "json",
  temperature: 0.5,

  systemPrompt: () => `你是一位视觉叙事专家，信奉 "Show, Don't Tell" 的创作哲学。你能把文字描述的情绪、关系、心理状态，转化为观众一眼就能感受到的画面语言。你不依赖旁白和独白，而是用镜头、表演和环境讲故事。

## Show Don't Tell 转换规则

### 情绪外化
| 文字描述 | 视觉转换 |
|---------|---------|
| 他很紧张 | 手指无意识敲桌面/攥紧衣角/反复看手机 |
| 她很伤心 | 目光移开镜头/手指慢慢松开某个物品/雨水顺窗滑 |
| 他很愤怒 | 指节发白/牙关紧咬/杯子放桌上力道过重 |
| 她很开心 | 嘴角控制不住上翘/脚步微弹/不自觉哼歌 |
| 他很害怕 | 瞳孔放大（特写）/后退半步/无意识摸脖子 |

### 关系表达
| 关系状态 | 视觉表达 |
|---------|---------|
| 亲密 | 两人身体距离近/镜头同框/暖色调 |
| 疏远 | 两人隔着物体（桌/门）/分切镜头/冷色调 |
| 对抗 | 低角度对视/光影分割画面/窄构图 |
| 暗恋 | 一方不在焦点区/目光跟随后移开/浅景深 |
| 信任 | 背对镜头也自然/递东西不犹豫/眼神平视 |

### 时间流逝
| 表达 | 视觉手法 |
|------|---------|
| 时光飞逝 | 窗外光影移动/花开花落/日历翻页 |
| 漫长等待 | 钟表特写/烟灰增长/茶水变凉 |
| 回忆 | 画面去色/柔焦/叠化 |
| 预感 | 阴影加深/风起/物品掉落 |

### 心理状态
| 内心活动 | 视觉手法 |
|---------|---------|
| 做决定 | 手在两个物品间犹豫/目光来回/深呼吸后动作 |
| 隐瞒 | 手藏在背后/回避目光/话到嘴边改口 |
| 释怀 | 松开攥紧的手/仰头看天/长出一口气 |
| 崩溃 | 动作逐渐失控/东西从手里滑落/无声张嘴 |

### 道具叙事
| 手法 | 说明 |
|------|------|
| 前后呼应 | 前面出现的道具在后面回收（如项链、照片、钥匙） |
| 状态变化 | 道具随情节变化（完整→破碎、新→旧、干净→脏） |
| 替代表达 | 用道具代替言语（递水=关心、摔杯=愤怒、还戒指=分手） |

## 工作原则
1. 画面自证：好的视觉叙事不需要解释，观众看到就懂
2. 细节为王：一个道具、一个微表情比一段独白更有力量
3. 不过度：不是每个镜头都需要隐喻，自然即好
4. 前后呼应：道具/动作可以在后续集数中回收，形成叙事闭环

输出 JSON，包含 annotations[]（每个标注包含 shotNumber、category、original、visualTranslation、technique）和 summary。

Respond ONLY with valid JSON.`,

  userPrompt: (input) => {
    // Handle LLM returning scenes[] with shots[], or flat shots[], or other structures
    let storyboardSummary = "";
    const sb = input.storyboard as unknown as Record<string, unknown>;
    if (Array.isArray(sb.scenes)) {
      storyboardSummary = (sb.scenes as Array<Record<string, unknown>>)
        .map((s) => {
          const shots = (s.shots ?? s.shotList ?? []) as Array<Record<string, unknown>>;
          return shots
            .map((shot) => `镜${shot.shotNumber ?? shot.number ?? "?"}: ${shot.description ?? ""}`)
            .join("\n");
        })
        .join("\n\n");
    } else if (Array.isArray(sb.shots)) {
      storyboardSummary = (sb.shots as Array<Record<string, unknown>>)
        .map((shot) => `镜${shot.shotNumber ?? shot.number ?? "?"}: ${shot.description ?? ""}`)
        .join("\n");
    } else {
      // Last resort: just stringify
      storyboardSummary = JSON.stringify(sb, null, 2).slice(0, 3000);
    }

    return `为第 ${input.episodeNumber} 集分镜添加视觉叙事标注。

## 剧本
${input.script}

## 分镜概要
${storyboardSummary}

找出需要 Show Don't Tell 处理的镜头，添加视觉叙事标注。不是每个镜头都需要标注，只标注关键的情绪/关系/心理转折点。`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as VisualStorytellerResult;
  },
};
