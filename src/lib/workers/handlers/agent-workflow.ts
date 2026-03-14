/**
 * Worker handlers for agent workflow tasks.
 * Each AGENT_* task type runs a specific pipeline via the agent runner.
 * Format-aware: supports "script" (screenplay), "novel" (rewrite), and "same" (auto-detect).
 */

import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionJson } from "@/lib/llm/client";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import { runPipeline } from "@/lib/agents/runner";
import {
  analysisPipeline,
  planningPipeline,
  writingPipeline,
  reviewPipeline,
  storyboardPipeline,
  imagePromptsPipeline,
} from "@/lib/agents/pipelines";
import {
  STYLE_ANALYSIS_SYSTEM,
  STYLE_ANALYSIS_USER,
} from "@/lib/llm/prompts/rewrite-script";
import type { StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";
import type { TaskPayload } from "@/lib/task/types";

// ─── Helpers ─────────────────────────────────────────────────────────

async function setupLLM(userId: string) {
  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);
  return { client, model: llmCfg.model };
}

async function getAgentProject(agentProjectId: string) {
  const project = await prisma.agentProject.findUniqueOrThrow({
    where: { id: agentProjectId },
    include: { episodes: { orderBy: { episodeNumber: "asc" } } },
  });
  return project;
}

async function updateProjectStatus(id: string, status: string, currentStep?: string) {
  await prisma.agentProject.update({
    where: { id },
    data: { status, currentStep },
  });
}

/** Check if this project uses visual pipeline (storyboard + image prompts) */
function needsVisualPipeline(outputFormat: string | null | undefined): boolean {
  return !outputFormat || outputFormat === "script";
}

// ─── AGENT_ANALYZE ───────────────────────────────────────────────────

export const handleAgentAnalyze = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;

  await updateProjectStatus(agentProjectId, "analyzing", "analyze");

  const project = await getAgentProject(agentProjectId);
  const { client, model } = await setupLLM(userId);

  const pipelineCtx = await runPipeline(analysisPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: { sourceText: project.sourceText },
    progressRange: [5, 80],
  });

  const analysisData = pipelineCtx.results["analyze"];

  // Style fingerprint analysis — extract writing style for rewrite/review
  ctx.publishText("\n\n📋 分析写作风格...\n");
  let styleData: StyleFingerprint | null = null;
  try {
    styleData = await chatCompletionJson<StyleFingerprint>(client, {
      model,
      systemPrompt: STYLE_ANALYSIS_SYSTEM,
      userPrompt: STYLE_ANALYSIS_USER(project.sourceText.slice(0, 6000)),
      temperature: 0.3,
    });
    ctx.publishText(`风格: ${styleData.contentType} | ${styleData.emotionalTone} | ${styleData.sentenceStyle}\n`);
  } catch {
    ctx.publishText("⚠️ 风格分析跳过\n");
  }

  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: {
      analysisData: analysisData as object,
      ...(styleData ? { styleData: styleData as object } : {}),
      status: "analyzed",
      currentStep: null,
    },
  });

  return { analysisData, styleData };
});

// ─── AGENT_PLAN ──────────────────────────────────────────────────────

export const handleAgentPlan = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;

  await updateProjectStatus(agentProjectId, "planning", "plan");

  const project = await getAgentProject(agentProjectId);
  if (!project.analysisData) throw new Error("Analysis must be completed before planning");

  const { client, model } = await setupLLM(userId);

  const pipelineCtx = await runPipeline(planningPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: {
      analysisReport: project.analysisData,
      sourceText: project.sourceText,
      durationPerEp: project.durationPerEp ?? "2-5分钟",
    },
    progressRange: [5, 80],
  });

  const planningData = pipelineCtx.results["plan"] as {
    totalEpisodes: number;
    episodes: Array<Record<string, unknown>>;
  };

  await ctx.reportProgress(85);

  // Create AgentEpisode records from the plan
  // LLM may return "number" or "episodeNumber" — handle both
  const episodeOps = planningData.episodes.map((ep, idx) => {
    const epNum = (ep.number ?? ep.episodeNumber ?? idx + 1) as number;
    const epTitle = (ep.title as string) ?? `第${epNum}集`;
    return prisma.agentEpisode.upsert({
      where: {
        agentProjectId_episodeNumber: {
          agentProjectId,
          episodeNumber: epNum,
        },
      },
      create: {
        agentProjectId,
        episodeNumber: epNum,
        title: epTitle,
        outline: JSON.stringify(ep),
        status: "planned",
      },
      update: {
        title: epTitle,
        outline: JSON.stringify(ep),
      },
    });
  });
  await prisma.$transaction(episodeOps);

  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: {
      planningData: planningData as object,
      targetEpisodes: planningData.totalEpisodes,
      status: "planned",
      currentStep: null,
    },
  });

  return { planningData };
});

// ─── AGENT_WRITE ─────────────────────────────────────────────────────

export const handleAgentWrite = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const episodeNumber = data.episodeNumber as number;

  await updateProjectStatus(agentProjectId, "writing", `write-ep${episodeNumber}`);

  const project = await getAgentProject(agentProjectId);
  const analysis = project.analysisData as { characters?: Array<{ name: string; personality: string[]; appearance: string }> } | null;
  const outputFormat = project.outputFormat || "script";
  const styleFingerprint = project.styleData as StyleFingerprint | null;

  const episode = project.episodes.find((e) => e.episodeNumber === episodeNumber);
  if (!episode) throw new Error(`Episode ${episodeNumber} not found`);

  // Get previous episode ending for continuity
  const prevEpisode = project.episodes.find((e) => e.episodeNumber === episodeNumber - 1);
  const prevEnding = prevEpisode?.script
    ? prevEpisode.script.slice(-500)
    : undefined;

  const { client, model } = await setupLLM(userId);

  const pipelineCtx = await runPipeline(writingPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: {
      episodeNumber,
      episodeTitle: episode.title ?? `第${episodeNumber}集`,
      episodeOutline: episode.outline ?? "",
      sourceText: project.sourceText,
      previousEpisodeEnding: prevEnding,
      characters: analysis?.characters ?? [],
      outputFormat,
      styleFingerprint: styleFingerprint ?? undefined,
    },
    progressRange: [5, 90],
  });

  const result = pipelineCtx.results["write"] as { script: string };

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      script: result.script,
      scriptVersion: { increment: 1 },
      status: "drafted",
    },
  });

  await updateProjectStatus(agentProjectId, "planned", undefined);

  return { episodeNumber, scriptLength: result.script.length };
});

// ─── AGENT_REVIEW ────────────────────────────────────────────────────

export const handleAgentReview = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const episodeNumber = data.episodeNumber as number;

  await updateProjectStatus(agentProjectId, "reviewing", `review-ep${episodeNumber}`);

  const project = await getAgentProject(agentProjectId);
  const outputFormat = project.outputFormat || "script";
  const episode = project.episodes.find((e) => e.episodeNumber === episodeNumber);
  if (!episode?.script) throw new Error(`Episode ${episodeNumber} has no script to review`);

  const { client, model } = await setupLLM(userId);

  const pipelineCtx = await runPipeline(reviewPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: {
      episodeNumber,
      script: episode.script,
      sourceText: project.sourceText,
      analysisCharacters: project.analysisData
        ? JSON.stringify((project.analysisData as { characters?: unknown }).characters)
        : undefined,
      outputFormat,
    },
    progressRange: [5, 90],
  });

  const reviewResult = pipelineCtx.results["review"] as {
    totalScore: number;
    passed: boolean;
  };
  // Don't trust LLM's `passed` field — compute from score (≥35 = pass)
  const PASS_THRESHOLD = 35;
  const passed = reviewResult.totalScore >= PASS_THRESHOLD;

  // For novel format, reviewed = completed (no visual pipeline)
  const isVisual = needsVisualPipeline(outputFormat);
  const newStatus = passed
    ? (isVisual ? "reviewed" : "completed")
    : "review-failed";

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      reviewData: pipelineCtx.results["review"] as object,
      reviewScore: reviewResult.totalScore,
      status: newStatus,
    },
  });

  await updateProjectStatus(agentProjectId, "planned", undefined);

  return { episodeNumber, score: reviewResult.totalScore, passed };
});

// ─── AGENT_STORYBOARD ────────────────────────────────────────────────

export const handleAgentStoryboard = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const episodeNumber = data.episodeNumber as number;

  await updateProjectStatus(agentProjectId, "storyboarding", `storyboard-ep${episodeNumber}`);

  const project = await getAgentProject(agentProjectId);
  const analysis = project.analysisData as { characters?: Array<{ name: string; appearance: string }> } | null;
  const episode = project.episodes.find((e) => e.episodeNumber === episodeNumber);
  if (!episode?.script) throw new Error(`Episode ${episodeNumber} has no script`);

  const { client, model } = await setupLLM(userId);

  const pipelineCtx = await runPipeline(storyboardPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: {
      episodeNumber,
      script: episode.script,
      characters: analysis?.characters ?? [],
      outputFormat: project.outputFormat || "script",
    },
    progressRange: [5, 90],
  });

  // Combine storyboard + visual narrative annotations
  const storyboardData = pipelineCtx.results["storyboard"];
  const visualData = pipelineCtx.results["visual-narrative"];

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      storyboard: JSON.stringify({ storyboard: storyboardData, visualNarrative: visualData }),
      status: "storyboarded",
    },
  });

  await updateProjectStatus(agentProjectId, "planned", undefined);

  return { episodeNumber, storyboard: storyboardData };
});

// ─── AGENT_IMAGE_PROMPTS ─────────────────────────────────────────────

export const handleAgentImagePrompts = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const episodeNumber = data.episodeNumber as number;

  await updateProjectStatus(agentProjectId, "imaging", `images-ep${episodeNumber}`);

  const project = await getAgentProject(agentProjectId);
  const episode = project.episodes.find((e) => e.episodeNumber === episodeNumber);
  if (!episode?.storyboard) throw new Error(`Episode ${episodeNumber} has no storyboard`);

  const storyboardParsed = JSON.parse(episode.storyboard);
  const analysis = project.analysisData as {
    characters?: Array<{ name: string; appearance: string }>;
  } | null;

  // Build character cards from analysis
  const characterCards = (analysis?.characters ?? []).map((c) => ({
    name: c.name,
    promptDescription: c.appearance,
  }));

  const { client, model } = await setupLLM(userId);

  const pipelineCtx = await runPipeline(imagePromptsPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: {
      episodeNumber,
      storyboard: storyboardParsed.storyboard,
      characterCards,
      outputFormat: project.outputFormat || "script",
    },
    progressRange: [5, 90],
  });

  const imageResult = pipelineCtx.results["image-prompts"];

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      imagePrompts: JSON.stringify(imageResult),
      status: "completed",
    },
  });

  await updateProjectStatus(agentProjectId, "planned", undefined);

  return { episodeNumber, imagePrompts: imageResult };
});

// ─── AGENT_AUTO (Full pipeline) ──────────────────────────────────────

export const handleAgentAuto = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const targetEpisodes = data.targetEpisodes as number[] | undefined;

  const project = await getAgentProject(agentProjectId);
  const { client, model } = await setupLLM(userId);
  const outputFormat = project.outputFormat || "script";
  const isVisual = needsVisualPipeline(outputFormat);

  // Phase 1: Analysis (0-15%)
  if (!project.analysisData) {
    await updateProjectStatus(agentProjectId, "analyzing", "analyze");
    const analysisPipelineCtx = await runPipeline(analysisPipeline, {
      client, model, taskCtx: ctx,
      initialData: { sourceText: project.sourceText },
      progressRange: [0, 12],
    });
    await prisma.agentProject.update({
      where: { id: agentProjectId },
      data: { analysisData: analysisPipelineCtx.results["analyze"] as object },
    });

    // Style fingerprint analysis
    ctx.publishText("\n\n📋 分析写作风格...\n");
    try {
      const styleData = await chatCompletionJson<StyleFingerprint>(client, {
        model,
        systemPrompt: STYLE_ANALYSIS_SYSTEM,
        userPrompt: STYLE_ANALYSIS_USER(project.sourceText.slice(0, 6000)),
        temperature: 0.3,
      });
      await prisma.agentProject.update({
        where: { id: agentProjectId },
        data: { styleData: styleData as object },
      });
      ctx.publishText(`风格: ${styleData.contentType} | ${styleData.emotionalTone}\n`);
    } catch {
      ctx.publishText("⚠️ 风格分析跳过\n");
    }
  }
  await ctx.reportProgress(15);

  // Phase 2: Planning (15-30%)
  const freshProject = await getAgentProject(agentProjectId);
  if (!freshProject.planningData) {
    await updateProjectStatus(agentProjectId, "planning", "plan");
    const planPipelineCtx = await runPipeline(planningPipeline, {
      client, model, taskCtx: ctx,
      initialData: {
        analysisReport: freshProject.analysisData,
        sourceText: freshProject.sourceText,
        durationPerEp: freshProject.durationPerEp ?? "2-5分钟",
      },
      progressRange: [15, 30],
    });
    const planData = planPipelineCtx.results["plan"] as {
      totalEpisodes: number;
      episodes: Array<Record<string, unknown>>;
    };

    const episodeOps = planData.episodes.map((ep, idx) => {
      const epNum = (ep.number ?? ep.episodeNumber ?? idx + 1) as number;
      const epTitle = (ep.title as string) ?? `第${epNum}集`;
      return prisma.agentEpisode.upsert({
        where: {
          agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum },
        },
        create: {
          agentProjectId, episodeNumber: epNum,
          title: epTitle, outline: JSON.stringify(ep), status: "planned",
        },
        update: { title: epTitle, outline: JSON.stringify(ep) },
      });
    });
    await prisma.$transaction(episodeOps);
    await prisma.agentProject.update({
      where: { id: agentProjectId },
      data: { planningData: planData as object, targetEpisodes: planData.totalEpisodes },
    });
  }
  await ctx.reportProgress(30);

  // Determine which episodes to process
  const finalProject = await getAgentProject(agentProjectId);
  const episodes = targetEpisodes
    ? finalProject.episodes.filter((e) => targetEpisodes.includes(e.episodeNumber))
    : finalProject.episodes;

  const analysis = finalProject.analysisData as {
    characters?: Array<{ name: string; personality: string[]; appearance: string }>;
  } | null;
  const styleFingerprint = finalProject.styleData as StyleFingerprint | null;

  // Phase 3: Write + Review [+ Storyboard + Image Prompts] per episode (30-95%)
  // Skip already completed episodes — only process incomplete ones
  const incompleteEpisodes = episodes.filter((e) => e.status !== "completed");
  const perEpisodeProgress = incompleteEpisodes.length > 0 ? 65 / incompleteEpisodes.length : 65;

  for (let i = 0; i < incompleteEpisodes.length; i++) {
    // Re-fetch episode to get latest state (may have been partially done before)
    const freshEp = await prisma.agentEpisode.findUnique({
      where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: incompleteEpisodes[i].episodeNumber } },
    });
    if (!freshEp || freshEp.status === "completed") continue;

    // Check completion based on format
    if (isVisual) {
      if (freshEp.script && freshEp.reviewScore && freshEp.storyboard && freshEp.imagePrompts) {
        await prisma.agentEpisode.update({
          where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: freshEp.episodeNumber } },
          data: { status: "completed" },
        });
        continue;
      }
    } else {
      // Novel format: completed after review
      if (freshEp.script && freshEp.reviewScore) {
        await prisma.agentEpisode.update({
          where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: freshEp.episodeNumber } },
          data: { status: "completed" },
        });
        continue;
      }
    }

    const epNum = freshEp.episodeNumber;
    const baseProgress = 30 + i * perEpisodeProgress;

    // Write — skip if already has script
    let script = freshEp.script ?? "";
    if (!script) {
      await updateProjectStatus(agentProjectId, "writing", `write-ep${epNum}`);
      // Fetch previous episode's LATEST script from DB (not stale cache)
      const prevEp = epNum > 1
        ? await prisma.agentEpisode.findUnique({
            where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum - 1 } },
            select: { script: true },
          })
        : null;
      const writeCtx = await runPipeline(writingPipeline, {
        client, model, taskCtx: ctx,
        initialData: {
          episodeNumber: epNum,
          episodeTitle: freshEp.title ?? `第${epNum}集`,
          episodeOutline: freshEp.outline ?? "",
          sourceText: finalProject.sourceText,
          previousEpisodeEnding: prevEp?.script?.slice(-800),
          characters: analysis?.characters ?? [],
          outputFormat,
          styleFingerprint: styleFingerprint ?? undefined,
        },
        progressRange: [baseProgress, baseProgress + perEpisodeProgress * 0.3],
      });
      script = (writeCtx.results["write"] as { script: string }).script;
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { script, scriptVersion: { increment: 1 }, status: "drafted" },
      });
    }

    // Review — skip if already reviewed
    if (!freshEp.reviewScore) {
      await updateProjectStatus(agentProjectId, "reviewing", `review-ep${epNum}`);
      const reviewCtx = await runPipeline(reviewPipeline, {
        client, model, taskCtx: ctx,
        initialData: {
          episodeNumber: epNum,
          script,
          sourceText: finalProject.sourceText,
          outputFormat,
        },
        progressRange: [baseProgress + perEpisodeProgress * 0.3, baseProgress + perEpisodeProgress * 0.5],
      });
      const reviewResult = reviewCtx.results["review"] as { totalScore: number; passed: boolean };

      // For novel format, reviewed = completed
      const reviewStatus = !isVisual ? "completed" : undefined;
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: {
          reviewData: reviewCtx.results["review"] as object,
          reviewScore: reviewResult.totalScore,
          ...(reviewStatus ? { status: reviewStatus } : {}),
        },
      });

      // Skip visual pipeline for novel format
      if (!isVisual) continue;
    }

    // Visual pipeline — only for screenplay format
    if (!isVisual) continue;

    // Storyboard — skip if already has storyboard data
    let storyboardData: unknown = null;
    if (!freshEp.storyboard) {
      await updateProjectStatus(agentProjectId, "storyboarding", `storyboard-ep${epNum}`);
      const sbCtx = await runPipeline(storyboardPipeline, {
        client, model, taskCtx: ctx,
        initialData: {
          episodeNumber: epNum,
          script,
          characters: analysis?.characters ?? [],
          outputFormat,
        },
        progressRange: [baseProgress + perEpisodeProgress * 0.5, baseProgress + perEpisodeProgress * 0.75],
      });
      storyboardData = sbCtx.results["storyboard"];
      const visualData = sbCtx.results["visual-narrative"];
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { storyboard: JSON.stringify({ storyboard: storyboardData, visualNarrative: visualData }) },
      });
    } else {
      const parsed = JSON.parse(freshEp.storyboard);
      storyboardData = parsed.storyboard ?? parsed;
    }

    // Image prompts — skip if already has image prompts
    if (!freshEp.imagePrompts) {
      await updateProjectStatus(agentProjectId, "imaging", `images-ep${epNum}`);
      const characterCards = (analysis?.characters ?? []).map((c) => ({
        name: c.name, promptDescription: c.appearance,
      }));
      const imgCtx = await runPipeline(imagePromptsPipeline, {
        client, model, taskCtx: ctx,
        initialData: {
          episodeNumber: epNum,
          storyboard: storyboardData,
          characterCards,
          outputFormat,
        },
        progressRange: [baseProgress + perEpisodeProgress * 0.75, baseProgress + perEpisodeProgress],
      });
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { imagePrompts: JSON.stringify(imgCtx.results["image-prompts"]), status: "completed" },
      });
    } else {
      // All steps done, mark completed
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { status: "completed" },
      });
    }
  }

  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { status: "completed", currentStep: null },
  });

  return { completed: episodes.map((e) => e.episodeNumber) };
});
