import { prisma } from "@/lib/prisma";
import { createVideoGenerator } from "@/lib/generators/factory";
import { resolveVideoConfig, resolveProviderConfig, mapToVideoProvider } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";
import { createScopedLogger } from "@/lib/logging";
import {
  collectReferenceImages,
  buildVideoPromptWithReferences,
  parseCharacterNamesFromActingNotes,
  matchCharacterNamesFromText,
} from "@/lib/video/build-prompt";

const logger = createScopedLogger({ module: "generate-panel-video" });

export const handleGeneratePanelVideo = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const panelId = data.panelId as string;

  const panel = await prisma.panel.findUniqueOrThrow({
    where: { id: panelId },
    include: {
      clip: {
        include: {
          episode: { select: { projectId: true } },
        },
      },
    },
  });

  if (!panel.imageUrl) {
    throw new Error("Panel has no image — generate image first");
  }

  const projectId = panel.clip.episode.projectId;

  await ctx.reportProgress(10);

  // ─── Collect reference images (adapted from anime-ai-studio directorService) ──

  const [characters, locations] = await Promise.all([
    prisma.character.findMany({
      where: { projectId, imageUrl: { not: null } },
      select: { name: true, imageUrl: true },
    }),
    prisma.location.findMany({
      where: { projectId, imageUrl: { not: null } },
      select: { name: true, imageUrl: true },
    }),
  ]);

  // Parse character names from actingNotes or match from sceneDescription
  let characterNames = parseCharacterNamesFromActingNotes(panel.actingNotes);
  if (characterNames.length === 0) {
    characterNames = matchCharacterNamesFromText(
      panel.sceneDescription,
      characters.map((c) => c.name),
    );
  }

  const referenceImages = collectReferenceImages(
    panel.imageUrl,
    characters,
    locations,
    characterNames,
    panel.sceneDescription,
  );

  logger.info("Collected reference images", {
    panelId,
    refCount: referenceImages.length,
    types: referenceImages.map((r) => `${r.type}:${r.name}`),
  });

  await ctx.reportProgress(20);

  const videoModelKey = data.videoModel as string | undefined;
  let provider: "openai" | "fal" | "google" | "liblib";
  let config;
  if (videoModelKey) {
    const resolved = await resolveProviderConfig(userId, "video", videoModelKey);
    provider = mapToVideoProvider(resolved.provider);
    config = resolved.config;
  } else {
    const resolved = await resolveVideoConfig(userId);
    provider = resolved.provider;
    config = resolved.config;
  }
  const generator = createVideoGenerator(provider, config);

  await ctx.reportProgress(40);

  // Build video prompt
  const basePrompt = panel.videoPrompt || panel.sceneDescription || "";
  // LiblibAI Kling doesn't support reference image instructions in prompt
  // (it interprets "图1是..." as a question, not a generation prompt)
  const useEnhancedPrompt = provider !== "liblib";
  const finalPrompt = useEnhancedPrompt
    ? buildVideoPromptWithReferences(referenceImages, basePrompt, panel)
    : basePrompt;

  logger.info("Built video prompt", {
    panelId,
    promptLength: finalPrompt.length,
    enhanced: useEnhancedPrompt,
  });

  // Check for first-last-frame mode
  let lastFrameImageUrl: string | undefined;
  if (panel.videoGenerationMode === "firstlastframe") {
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
    prompt: finalPrompt,
    durationMs: panel.durationMs,
    lastFrameImageUrl,
    referenceImages: referenceImages.filter((r) => r.type !== "keyframe"), // exclude keyframe (already in imageUrl)
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
