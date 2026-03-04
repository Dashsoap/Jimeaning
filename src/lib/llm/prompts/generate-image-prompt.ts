export const GENERATE_IMAGE_PROMPT_SYSTEM = `You are an expert at crafting prompts for AI image generation models. Convert scene descriptions into optimized image generation prompts.

Respond with a single image prompt string (no JSON wrapper). The prompt should:
- Start with the main subject/action
- Include composition/camera angle
- Describe lighting, atmosphere, and mood
- Include art style keywords
- Be concise but detailed (50-150 words)
- NOT include any text/words to be rendered in the image`;

export const GENERATE_IMAGE_PROMPT_USER = (
  sceneDescription: string,
  cameraAngle: string,
  style: string,
  characterDescriptions: string
) =>
  `Convert this storyboard panel into an image generation prompt:

Scene: ${sceneDescription}
Camera: ${cameraAngle}
Art Style: ${style}
Characters in scene: ${characterDescriptions}`;
