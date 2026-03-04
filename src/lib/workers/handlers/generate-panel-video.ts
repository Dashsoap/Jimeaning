import { prisma } from "@/lib/prisma";
import { createVideoGenerator } from "@/lib/generators/factory";
import { resolveVideoConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleGeneratePanelVideo = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const panelId = data.panelId as string;

  const panel = await prisma.panel.findUniqueOrThrow({
    where: { id: panelId },
  });

  if (!panel.imageUrl) {
    throw new Error("Panel has no image — generate image first");
  }

  await ctx.reportProgress(20);

  const { provider, config } = await resolveVideoConfig(userId);
  const generator = createVideoGenerator(provider, config);

  await ctx.reportProgress(40);

  const result = await generator.generate({
    imageUrl: panel.imageUrl,
    prompt: panel.sceneDescription || undefined,
    durationMs: panel.durationMs,
  });

  const videoUrl = result.url;
  if (videoUrl) {
    await prisma.panel.update({
      where: { id: panelId },
      data: { videoUrl },
    });
  }

  return { panelId, videoUrl, externalId: result.externalId };
});
