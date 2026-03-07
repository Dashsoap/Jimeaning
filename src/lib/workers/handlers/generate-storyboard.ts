import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletion } from "@/lib/llm/client";
import {
  STORYBOARD_PLAN_SYSTEM,
  STORYBOARD_PLAN_USER,
  STORYBOARD_DETAIL_SYSTEM,
  STORYBOARD_DETAIL_USER,
  VOICE_EXTRACT_SYSTEM,
  VOICE_EXTRACT_USER,
} from "@/lib/llm/prompts/generate-storyboard-text";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";
import { createScopedLogger } from "@/lib/logging";

const logger = createScopedLogger({ module: "generate-storyboard" });

interface PlanPanel {
  panelNumber: number;
  sceneDescription: string;
  location?: string;
  characters?: string[];
  shotType?: string;
  cameraAngle?: string;
  cameraMove?: string;
  durationMs?: number;
  sourceText?: string;
}

interface DetailPanel {
  panelNumber: number;
  sceneDescription: string;
  imagePrompt: string;
  cameraAngle?: string;
  cameraMove?: string;
  durationMs?: number;
}

interface VoiceLine {
  panelNumber: number;
  speaker: string;
  text: string;
  emotion?: string;
}

export const handleGenerateStoryboard = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId } = payload;

  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);
  const model = llmCfg.model;

  // Get all clips + characters + locations for the project
  const episodes = await prisma.episode.findMany({
    where: { projectId },
    include: { clips: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  const characters = await prisma.character.findMany({ where: { projectId } });
  const locations = await prisma.location.findMany({ where: { projectId } });

  const charDescriptions = characters
    .map((c) => `${c.name}: ${c.description}`)
    .join("\n");
  const locDescriptions = locations
    .map((l) => `${l.name}: ${l.description}`)
    .join("\n");

  // Count total clips for progress tracking
  // 3 phases per clip: plan + detail + voice
  let totalClips = 0;
  for (const ep of episodes) totalClips += ep.clips.length;
  const totalSteps = totalClips * 3;
  let completedSteps = 0;

  await ctx.reportProgress(0, totalSteps);

  let totalPanelsCreated = 0;
  let totalVoiceLinesCreated = 0;

  for (const episode of episodes) {
    for (const clip of episode.clips) {
      const clipContent = clip.description || clip.title || "";
      const screenplay = clip.screenplay || null;

      // ── Phase 1: Storyboard Planning ─────────────────────────────────
      logger.info("Phase 1: Planning storyboard", { clipId: clip.id });

      const planResult = await chatCompletion(client, {
        model,
        systemPrompt: STORYBOARD_PLAN_SYSTEM,
        userPrompt: STORYBOARD_PLAN_USER(
          clipContent,
          screenplay,
          charDescriptions,
          locDescriptions,
        ),
        responseFormat: "json",
      });

      const planParsed = JSON.parse(planResult);
      const planPanels: PlanPanel[] = (planParsed.panels || []).filter(
        (p: PlanPanel) => p.sceneDescription,
      );

      completedSteps++;
      await ctx.reportProgress(completedSteps, totalSteps);

      // ── Phase 2: Detail Refinement + Image Prompt ────────────────────
      logger.info("Phase 2: Refining details", { clipId: clip.id, panelCount: planPanels.length });

      const planPanelsJson = JSON.stringify(planPanels, null, 2);
      const detailResult = await chatCompletion(client, {
        model,
        systemPrompt: STORYBOARD_DETAIL_SYSTEM,
        userPrompt: STORYBOARD_DETAIL_USER(
          planPanelsJson,
          charDescriptions,
          locDescriptions,
        ),
        responseFormat: "json",
      });

      const detailParsed = JSON.parse(detailResult);
      const detailPanels: DetailPanel[] = detailParsed.panels || [];

      // Merge plan + detail data and save panels
      const savedPanels: Array<{ id: string; panelNumber: number }> = [];
      for (let i = 0; i < planPanels.length; i++) {
        const plan = planPanels[i];
        const detail = detailPanels.find((d) => d.panelNumber === plan.panelNumber) || {} as DetailPanel;

        const panel = await prisma.panel.create({
          data: {
            clipId: clip.id,
            sceneDescription: detail.sceneDescription || plan.sceneDescription,
            cameraAngle: detail.cameraAngle || plan.cameraAngle,
            shotType: plan.shotType,
            cameraMove: detail.cameraMove || plan.cameraMove,
            imagePrompt: detail.imagePrompt || null,
            durationMs: detail.durationMs || plan.durationMs || 3000,
            sortOrder: i,
          },
        });
        savedPanels.push({ id: panel.id, panelNumber: plan.panelNumber });
        totalPanelsCreated++;
      }

      completedSteps++;
      await ctx.reportProgress(completedSteps, totalSteps);

      // ── Phase 3: Voice Line Extraction ───────────────────────────────
      // Only extract if there's dialogue or screenplay content
      const hasDialogue = clip.dialogue || (screenplay && screenplay.includes('"dialogue"'));
      if (hasDialogue && savedPanels.length > 0) {
        logger.info("Phase 3: Extracting voice lines", { clipId: clip.id });

        const voiceResult = await chatCompletion(client, {
          model,
          systemPrompt: VOICE_EXTRACT_SYSTEM,
          userPrompt: VOICE_EXTRACT_USER(
            clipContent,
            screenplay,
            JSON.stringify(planPanels.map((p) => ({
              panelNumber: p.panelNumber,
              sceneDescription: p.sceneDescription,
              characters: p.characters,
            })), null, 2),
          ),
          responseFormat: "json",
        });

        const voiceParsed = JSON.parse(voiceResult);
        const voiceLines: VoiceLine[] = voiceParsed.voiceLines || [];

        // Match voice lines to saved panels by panelNumber
        for (const vl of voiceLines) {
          const matchedPanel = savedPanels.find((sp) => sp.panelNumber === vl.panelNumber);
          if (!matchedPanel || !vl.text) continue;

          // Try to find character by name
          const character = vl.speaker && vl.speaker !== "NARRATOR"
            ? characters.find((c) => c.name === vl.speaker)
            : null;

          await prisma.voiceLine.create({
            data: {
              panelId: matchedPanel.id,
              characterId: character?.id || null,
              text: vl.text,
            },
          });
          totalVoiceLinesCreated++;
        }
      }

      completedSteps++;
      await ctx.reportProgress(completedSteps, totalSteps);
    }

    await prisma.episode.update({
      where: { id: episode.id },
      data: { status: "storyboarded" },
    });
  }

  logger.info("Storyboard generation complete", {
    totalClips,
    totalPanelsCreated,
    totalVoiceLinesCreated,
  });

  return { totalClips, totalPanels: totalPanelsCreated, totalVoiceLines: totalVoiceLinesCreated };
});
