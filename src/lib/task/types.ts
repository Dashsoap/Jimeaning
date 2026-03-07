export enum TaskType {
  ANALYZE_SCRIPT = "ANALYZE_SCRIPT",
  EXTRACT_ENTITIES = "EXTRACT_ENTITIES",
  GENERATE_STORYBOARD = "GENERATE_STORYBOARD",
  GENERATE_IMAGE_PROMPT = "GENERATE_IMAGE_PROMPT",
  GENERATE_PANEL_IMAGE = "GENERATE_PANEL_IMAGE",
  GENERATE_PANEL_VIDEO = "GENERATE_PANEL_VIDEO",
  GENERATE_VOICE_LINE = "GENERATE_VOICE_LINE",
  COMPOSE_VIDEO = "COMPOSE_VIDEO",
  BATCH_GENERATE = "BATCH_GENERATE",
  REVERSE_SCRIPT = "REVERSE_SCRIPT",
  REWRITE_SCRIPT = "REWRITE_SCRIPT",
  PANEL_VARIANT = "PANEL_VARIANT",
  AI_MODIFY_PROMPT = "AI_MODIFY_PROMPT",
  ANALYZE_SHOT_VARIANTS = "ANALYZE_SHOT_VARIANTS",
  IMAGE_CHARACTER = "IMAGE_CHARACTER",
  IMAGE_LOCATION = "IMAGE_LOCATION",
  EPISODE_SPLIT = "EPISODE_SPLIT",
  ANALYZE_NOVEL = "ANALYZE_NOVEL",
}

export const QUEUE_NAMES = {
  text: "jimeaning-text",
  image: "jimeaning-image",
  video: "jimeaning-video",
  voice: "jimeaning-voice",
} as const;

export interface TaskPayload {
  taskId: string;
  userId: string;
  projectId?: string;
  type: TaskType;
  data: Record<string, unknown>;
}

export interface TaskProgress {
  taskId: string;
  projectId?: string;
  progress: number;
  totalSteps: number;
  status: "running" | "completed" | "failed";
  message?: string;
  errorCode?: string;
  textChunk?: string;
}
