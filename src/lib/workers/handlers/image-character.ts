import { prisma } from "@/lib/prisma";
import { createImageGenerator } from "@/lib/generators/factory";
import { resolveImageConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleImageCharacter = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const characterId = data.characterId as string;
  const appearanceIndex = typeof data.appearanceIndex === "number" ? data.appearanceIndex : undefined;
  const prompt = data.prompt as string | undefined;

  if (!characterId) throw new Error("Missing required field: characterId");

  const character = await prisma.character.findFirst({
    where: { id: characterId, userId },
  });
  if (!character) throw new Error("Character not found");

  await ctx.reportProgress(10);

  // Build image prompt
  let baseDescription = character.description || "";

  // If targeting a specific appearance, use its description
  if (appearanceIndex !== undefined) {
    const appearance = await prisma.characterAppearance.findUnique({
      where: { characterId_appearanceIndex: { characterId, appearanceIndex } },
    });
    if (appearance?.description) {
      baseDescription = appearance.description;
    }
  }

  const imagePrompt =
    prompt ||
    `Character portrait: ${character.name}. ${baseDescription}. High quality, detailed character design, consistent style.`.trim();

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
    if (appearanceIndex !== undefined) {
      // Save to appearance record
      const appearance = await prisma.characterAppearance.findUnique({
        where: { characterId_appearanceIndex: { characterId, appearanceIndex } },
      });
      if (appearance) {
        // Append to candidate images
        const existing: string[] = appearance.candidateImages
          ? JSON.parse(appearance.candidateImages)
          : [];
        existing.push(imageUrl);

        await prisma.characterAppearance.update({
          where: { id: appearance.id },
          data: {
            candidateImages: JSON.stringify(existing),
            // Auto-select if first image and nothing selected yet
            ...(appearance.selectedIndex === null && existing.length === 1
              ? { selectedIndex: 0, imageUrl }
              : {}),
          },
        });
      }

      // Also update character's main imageUrl if this is the primary appearance (index 0)
      if (appearanceIndex === 0 && !character.imageUrl) {
        await prisma.character.update({
          where: { id: characterId },
          data: { imageUrl },
        });
      }
    } else {
      // Legacy: save directly to character
      await prisma.character.update({
        where: { id: characterId },
        data: { imageUrl },
      });
    }
  }

  return { characterId, appearanceIndex, imageUrl };
});
