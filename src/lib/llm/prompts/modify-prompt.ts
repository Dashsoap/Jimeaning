/**
 * Prompt template for AI-powered image prompt modification.
 * User provides current prompt + modification instruction → LLM returns updated prompt.
 */

export const MODIFY_PROMPT_SYSTEM = `You are an expert at refining prompts for AI image generation.
Given a current image prompt and a user modification instruction, output an updated image prompt.

Rules:
1. Keep the subject identity and scene continuity unless the user asks to change it.
2. Apply only the requested modifications; preserve other valid details.
3. Output concise, detailed English prompts suitable for AI image generation (50-150 words).
4. Focus on visual composition: subject, action, framing, lighting, atmosphere, style.
5. Do NOT include text/words to be rendered in the image.

You MUST respond with valid JSON only:
{
  "image_prompt": "the updated image prompt"
}`;

export function MODIFY_PROMPT_USER(
  currentPrompt: string,
  modifyInstruction: string,
  characterDescriptions?: string,
  locationDescription?: string
): string {
  let prompt = `Current image prompt:\n${currentPrompt}\n\nModification instruction:\n${modifyInstruction}`;

  if (characterDescriptions) {
    prompt += `\n\nCharacter references:\n${characterDescriptions}`;
  }
  if (locationDescription) {
    prompt += `\n\nLocation context:\n${locationDescription}`;
  }

  return prompt;
}
