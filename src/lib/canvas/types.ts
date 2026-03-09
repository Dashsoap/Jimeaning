/**
 * Canvas stage types for tldraw infinite canvas.
 * Adapted from anime-ai-studio.
 */

export type CanvasStage =
  | "script"
  | "assets"
  | "storyboard"
  | "voice"
  | "compose";

export interface StageAreaConfig {
  stage: CanvasStage;
  label: string;
  x: number;
  y: number;
  width: number;
  color: string;
}
