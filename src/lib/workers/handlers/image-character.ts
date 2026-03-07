import { prisma } from "@/lib/prisma";
import { createImageGenerator } from "@/lib/generators/factory";
import { resolveImageConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleImageCharacter = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const characterId = data.characterId as string;
  const prompt = data.prompt as string | undefined;

  if (!characterId) throw new Error("Missing required field: characterId");

  const character = await prisma.character.findFirst({
    where: { id: characterId, userId },
  });
  if (!character) throw new Error("Character not found");

  await ctx.reportProgress(10);

  // Build image prompt from character info or user-provided prompt
  const imagePrompt =
    prompt ||
    `Character portrait: ${character.name}. ${character.description || ""}. High quality, detailed character design, consistent style.`.trim();

  // Generate image
  await ctx.reportProgress(30);
  const { provider, config } = await resolveImageConfig(userId);
  const generator = createImageGenerator(provider, config);

  const result = await generator.generate({
    prompt: imagePrompt,
    width: 1024,
    height: 1024,
  });

  const imageUrl =
    result.url || (result.base64 ? `data:image/png;base64,${result.base64}` : null);

  if (imageUrl) {
    await prisma.character.update({
      where: { id: characterId },
      data: { imageUrl },
    });
  }

  return { characterId, imageUrl };
});
