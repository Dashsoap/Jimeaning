/**
 * Prompt template for generating a panel variant.
 * Takes the original panel context + variant instructions → produces a new image prompt.
 */

export const PANEL_VARIANT_SYSTEM = `You are a storyboard image generation expert.
Given an original shot description and a variant instruction, produce an optimized image generation prompt for the new variant.

The new prompt must:
1. Preserve character identity and outfit continuity from the original.
2. Preserve location and atmosphere continuity.
3. Change framing, angle, and composition according to the variant instruction.
4. Be a concise, detailed English prompt suitable for AI image generation (50-150 words).
5. Focus on: subject, action, framing, camera angle, lighting, atmosphere, style.
6. NOT include text/words to be rendered in the image.

You MUST respond with valid JSON only:
{
  "image_prompt": "the new image generation prompt for the variant"
}`;

export function PANEL_VARIANT_USER(
  originalDescription: string,
  originalCameraAngle: string,
  variantDescription: string,
  variantShotType: string,
  variantCameraMove: string,
  characterDescriptions: string,
  style: string
): string {
  return `Original shot:
Description: ${originalDescription}
Camera angle: ${originalCameraAngle}

Variant instruction:
Description: ${variantDescription}
Target shot type: ${variantShotType}
Target camera move: ${variantCameraMove}

Characters: ${characterDescriptions || "Not specified"}
Art style: ${style || "cinematic"}

Generate an optimized image prompt for this variant.`;
}
