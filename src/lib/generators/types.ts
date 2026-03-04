// ─── Generator Interfaces ────────────────────────────────────────────────

export interface GenerateResult {
  url?: string;
  base64?: string;
  externalId?: string; // for async polling
}

// ─── Image Generator ────────────────────────────────────────────────────

export interface ImageGenerateParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  style?: string;
  model?: string;
}

export interface ImageGenerator {
  generate(params: ImageGenerateParams): Promise<GenerateResult>;
}

// ─── Video Generator ────────────────────────────────────────────────────

export interface VideoGenerateParams {
  imageUrl: string;
  prompt?: string;
  durationMs?: number;
  model?: string;
}

export interface VideoGenerator {
  generate(params: VideoGenerateParams): Promise<GenerateResult>;
}

// ─── Audio Generator (TTS) ──────────────────────────────────────────────

export interface AudioGenerateParams {
  text: string;
  voiceId?: string;
  model?: string;
  speed?: number;
}

export interface AudioGenerator {
  generate(params: AudioGenerateParams): Promise<GenerateResult>;
}

// ─── Provider Config ────────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export type ImageProviderType = "openai" | "fal" | "google-gemini";
export type VideoProviderType = "openai" | "fal";
export type AudioProviderType = "openai" | "fish-audio" | "elevenlabs";
