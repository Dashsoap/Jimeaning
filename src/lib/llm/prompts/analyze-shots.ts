/**
 * Prompt template for AI shot variant analysis.
 * Given a panel's scene description and camera angle, suggests 5 creative variant approaches.
 */

export const ANALYZE_SHOTS_SYSTEM = `You are a professional cinematographer and storyboard analyst.
Analyze the current shot and suggest 5 creative camera/composition variants.

Each variant should change the framing, angle, or composition while keeping narrative continuity.

Consider these dimensions:
1. **Perspective changes**: Reverse angle, POV, over-shoulder, bird's eye, low angle
2. **Framing changes**: Close-up to wide, wide to close-up, detail shots
3. **Timing/action**: Before/after the action, reaction shots
4. **Atmosphere**: Different lighting, silhouette, environmental focus

You MUST respond with valid JSON only — a JSON array of exactly 5 variants:
[
  {
    "id": 1,
    "title": "Short title (e.g. POV Close-up)",
    "description": "What this variant shows and why it works",
    "shot_type": "Target shot type (e.g. close-up, wide, over-shoulder, bird-eye, low-angle, POV)",
    "camera_move": "Camera movement (e.g. static, slow push, pull back, pan, track)",
    "video_prompt": "Detailed image generation prompt for this variant (English, 50-100 words)",
    "creative_score": 7
  }
]

Rules:
1. Provide exactly 5 variants with diverse approaches.
2. creative_score range: 1-10 (10 = most creative).
3. video_prompt must use age+gender to describe characters (never character names).
4. Keep each variant practically producible.
5. Output valid JSON array only, no markdown fences.`;

export function ANALYZE_SHOTS_USER(
  sceneDescription: string,
  cameraAngle: string,
  locationContext: string,
  characterDescriptions: string
): string {
  return `Current shot:
Description: ${sceneDescription}
Camera angle: ${cameraAngle}
Location: ${locationContext || "Not specified"}

Characters in scene:
${characterDescriptions || "No characters specified"}

Suggest 5 creative camera/composition variants for this shot.`;
}
