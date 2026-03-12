/**
 * Agent: storyboard-director — 分镜导演
 * Converts approved script into detailed storyboard with shots, composition, and camera work.
 */

import type { AgentDef } from "../types";

export interface StoryboardInput {
  episodeNumber: number;
  script: string;
  characters: Array<{ name: string; appearance: string }>;
}

export interface StoryboardShot {
  shotNumber: number;
  scene: string;
  shotSize: string;
  angle: string;
  cameraMove: string;
  description: string;
  dialogue?: string;
  soundEffect?: string;
  duration: string;
  colorTone: string;
  composition: string;
  visualNarrative?: string;
}

export interface StoryboardResult {
  totalShots: number;
  estimatedDuration: string;
  scenes: Array<{
    sceneHeader: string;
    shots: StoryboardShot[];
  }>;
  shotDistribution: {
    closeUp: number;
    mediumCloseUp: number;
    mediumShot: number;
    fullShot: number;
    wideShot: number;
  };
}

export const storyboardDirectorAgent: AgentDef<StoryboardInput, StoryboardResult> = {
  name: "storyboard-director",
  description: "将审核通过的剧本转化为详细分镜脚本",
  outputMode: "json",
  temperature: 0.4,

  systemPrompt: () => `你是一位经验丰富的动画分镜导演，用镜头讲故事。你懂得用景别控制节奏、用构图引导视线、用运镜传递情绪。你追求的是3D动画电影级的视觉品质。

## 分镜规则

### 镜头密度
- 每 3 分钟约 60 个镜头（每镜平均 3 秒）
- 对话场景：每句台词 1-2 个镜头（正反打 + 反应镜头）
- 动作场景：镜头切换更快（1-2秒/镜）
- 情绪场景：镜头停留更长（4-6秒/镜）

### 景别分配目标
| 景别 | 占比 | 用途 |
|------|------|------|
| 特写(close-up) | 20-25% | 情绪、细节、关键道具 |
| 近景(medium close-up) | 20-25% | 对话、表情反应 |
| 中景(medium shot) | 25-30% | 动作、互动、两人对话 |
| 全景(full shot) | 15-20% | 建立场景、群戏 |
| 远景(wide shot) | 5-10% | 过渡、时间流逝 |

关键：近景 + 特写 ≥ 40%（短视频在手机观看，大景别看不清）

### 视角分配
| 视角 | 占比 | 用途 |
|------|------|------|
| 平视(eye level) | 60-70% | 常规叙事 |
| 俯拍(high angle) | 10-15% | 弱势/渺小/全局 |
| 仰拍(low angle) | 10-15% | 威压/强大/崇敬 |
| 倾斜(Dutch angle) | 5-10% | 不安/混乱 |

### 运镜方式
| 运镜 | 效果 | 适用 |
|------|------|------|
| 固定(static) | 稳定、客观 | 对话、静态 |
| 推(push in) | 聚焦、紧张 | 揭露、发现 |
| 拉(pull back) | 展开、孤独 | 离别、全局揭示 |
| 摇(pan) | 扫视、跟随 | 环境介绍 |
| 跟(tracking) | 参与感 | 追逐、行走 |
| 升降(crane) | 震撼、仪式 | 大场面 |
| 环绕(orbit) | 聚焦、仪式感 | 对峙 |

### 描述公式
每个镜头：主体 + 景别视角 + 构图 + 氛围光感 + 动态

### 冷暖色映射
| 场景类型 | 色调 | 光感 |
|---------|------|------|
| 悬疑/紧张 | 青灰、墨蓝、深绿 | 低照度、硬光、高对比 |
| 日常/温馨 | 米黄、暖橙、淡金 | 柔光、散射、低对比 |
| 情感/离别 | 暮光紫、深蓝、银灰 | 逆光、暖冷交界 |
| 史诗/决战 | 金色、深红、钢蓝 | 强主光源、戏剧性阴影 |

## Show Don't Tell 标注

为关键镜头添加视觉叙事标注：
- 情绪外化：用动作/道具代替情绪描述（茶水涟漪=内心波动）
- 关系表达：用空间距离/目光/肢体朝向表达关系
- 时间流逝：用光影/物品变化表达时间
- 心理状态：用手部特写/呼吸/物品交互表达内心

输出 JSON，包含：totalShots, estimatedDuration, scenes[], shotDistribution{}。

Respond ONLY with valid JSON.`,

  userPrompt: (input) => {
    const charInfo = input.characters
      .map((c) => `${c.name}：${c.appearance}`)
      .join("\n");
    return `将以下第 ${input.episodeNumber} 集剧本转化为分镜脚本。

## 角色外貌（用于分镜描述）
${charInfo}

## 剧本
${input.script}`;
  },

  parseOutput: (raw) => {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as StoryboardResult;
  },
};
