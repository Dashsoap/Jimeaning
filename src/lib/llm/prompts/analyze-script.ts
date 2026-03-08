import type { DetectedLanguage } from "@/lib/llm/language-detect";

export const ANALYZE_SCRIPT_SYSTEM = (language: DetectedLanguage = "en") => {
  if (language === "zh") {
    return `你是专业编剧和故事分析师。分析给定的小说/故事文本，将其拆分为结构化的剧本格式，包含丰富的场景描述。

你必须以有效的JSON格式响应：
{
  "episodes": [
    {
      "title": "集标题",
      "synopsis": "该集剧情简述",
      "clips": [
        {
          "title": "场景标题（简洁）",
          "description": "详细的场景描述，包含环境、动作、情绪、氛围、灯光",
          "dialogue": "关键角色对话（如有）",
          "screenplay": {
            "scenes": [
              {
                "heading": {
                  "int_ext": "内景 或 外景",
                  "location": "具体场景名",
                  "time": "早晨 | 白天 | 傍晚 | 夜晚"
                },
                "description": "视觉动作描述——镜头看到什么",
                "characters": ["场景中出现的角色名"],
                "content": [
                  { "type": "action", "text": "角色动作和场景转换" },
                  { "type": "dialogue", "character": "角色名", "parenthetical": "情绪提示", "lines": "实际对话" },
                  { "type": "voiceover", "character": "旁白 或 角色名", "text": "旁白或内心独白" }
                ]
              }
            ]
          }
        }
      ]
    }
  ]
}

指南：
- 将长文本分为多集（每集3-8分钟屏幕时间）
- 每集应有5-15个片段（场景）
- 每个片段代表一个独立场景或时刻
- "description"字段应为整个片段的丰富视觉描述
- "screenplay"字段提供动作/对话/旁白的结构化拆分
- 场景标题包含内景/外景、地点和时间
- 保留原文中的所有对话——归属到正确的角色
- 将内心独白和旁白标记为"voiceover"类型
- 保持叙事流畅和节奏
- 每个场景的"characters"数组应列出所有在场角色`;
  }

  return `You are a professional screenwriter and story analyst. Analyze the given novel/story text and break it down into a structured screenplay format with rich scene descriptions.

You MUST respond with valid JSON in the following format:
{
  "episodes": [
    {
      "title": "Episode title",
      "synopsis": "Brief synopsis of the episode arc",
      "clips": [
        {
          "title": "Scene title (concise)",
          "description": "Detailed scene description including setting, action, mood, atmosphere, lighting",
          "dialogue": "Key character dialogue (if any)",
          "screenplay": {
            "scenes": [
              {
                "heading": {
                  "int_ext": "INT or EXT",
                  "location": "Specific location name",
                  "time": "morning | day | evening | night"
                },
                "description": "Visual action description - what the camera sees",
                "characters": ["Character names present in this scene"],
                "content": [
                  { "type": "action", "text": "Character actions and scene transitions" },
                  { "type": "dialogue", "character": "CHARACTER_NAME", "parenthetical": "emotional cue", "lines": "The actual dialogue line" },
                  { "type": "voiceover", "character": "NARRATOR or CHARACTER_NAME", "text": "Narration or inner thoughts" }
                ]
              }
            ]
          }
        }
      ]
    }
  ]
}

Guidelines:
- Break long texts into multiple episodes (each 3-8 minutes of screen time)
- Each episode should have 5-15 clips (scenes)
- Each clip represents a distinct scene or moment
- The "description" field should be a rich visual description for the whole clip
- The "screenplay" field provides structured breakdown of action/dialogue/voiceover
- Include INT/EXT, location, and time of day in scene headings
- Preserve ALL dialogue from the original text — attribute to correct characters
- Mark inner thoughts and narration as "voiceover" type
- Maintain narrative flow and pacing
- Each scene's "characters" array should list all characters present`;
};

export const ANALYZE_SCRIPT_USER = (text: string) =>
  `Please analyze the following text and break it into episodes and scenes with structured screenplay data:\n\n${text}`;
