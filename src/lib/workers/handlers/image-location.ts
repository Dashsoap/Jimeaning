import { prisma } from "@/lib/prisma";
import { createImageGenerator } from "@/lib/generators/factory";
import { resolveImageConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleImageLocation = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const locationId = data.locationId as string;
  const prompt = data.prompt as string | undefined;

  if (!locationId) throw new Error("Missing required field: locationId");

  const location = await prisma.location.findFirst({
    where: { id: locationId, userId },
  });
  if (!location) throw new Error("Location not found");

  await ctx.reportProgress(10);

  // Build image prompt from location info or user-provided prompt
  const imagePrompt =
    prompt ||
    `Scene/location: ${location.name}. ${location.description || ""}. Cinematic composition, detailed environment, atmospheric lighting.`.trim();

  // Generate image
  await ctx.reportProgress(30);
  const { provider, config } = await resolveImageConfig(userId);
  const generator = createImageGenerator(provider, config);

  const result = await generator.generate({
    prompt: imagePrompt,
    width: 1024,
    height: 576, // 16:9 for locations
  });

  const imageUrl =
    result.url || (result.base64 ? `data:image/png;base64,${result.base64}` : null);

  if (imageUrl) {
    await prisma.location.update({
      where: { id: locationId },
      data: { imageUrl },
    });
  }

  return { locationId, imageUrl };
});
