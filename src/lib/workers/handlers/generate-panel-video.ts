import { prisma } from "@/lib/prisma";
import { createVideoGenerator } from "@/lib/generators/factory";
import { resolveVideoConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";
import { createScopedLogger } from "@/lib/logging";

const logger = createScopedLogger({ module: "generate-panel-video" });

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

  // Use videoPrompt (from Stage 3) if available, fallback to sceneDescription
  const prompt = panel.videoPrompt || panel.sceneDescription || undefined;

  // Check for first-last-frame mode
  let lastFrameImageUrl: string | undefined;
  if (panel.videoGenerationMode === "firstlastframe") {
    // Find next panel in the same clip by sortOrder
    const nextPanel = await prisma.panel.findFirst({
      where: {
        clipId: panel.clipId,
        sortOrder: { gt: panel.sortOrder },
      },
      orderBy: { sortOrder: "asc" },
      select: { imageUrl: true },
    });

    if (nextPanel?.imageUrl) {
      lastFrameImageUrl = nextPanel.imageUrl;
      logger.info("Using first-last-frame mode", {
        panelId,
        hasLastFrame: true,
      });
    }
  }

  const result = await generator.generate({
    imageUrl: panel.imageUrl,
    prompt,
    durationMs: panel.durationMs,
    lastFrameImageUrl,
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
