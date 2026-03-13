/**
 * Worker handlers for agent workflow tasks.
 * Each AGENT_* task type runs a specific pipeline via the agent runner.
 */

import { prisma } from "@/lib/prisma";
import { createLLMClient } from "@/lib/llm/client";
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
import type { TaskPayload } from "@/lib/task/types";
import type { PipelineDef } from "@/lib/agents/types";

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
    progressRange: [5, 95],
  });

  const analysisData = pipelineCtx.results["analyze"];

  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: {
      analysisData: analysisData as object,
      status: "analyzed",
      currentStep: null,
    },
  });

  return { analysisData };
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    },
    progressRange: [5, 90],
  });

  const reviewResult = pipelineCtx.results["review"] as {
    totalScore: number;
    passed: boolean;
  };

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      reviewData: pipelineCtx.results["review"] as object,
      reviewScore: reviewResult.totalScore,
      status: reviewResult.passed ? "reviewed" : "review-failed",
    },
  });

  await updateProjectStatus(agentProjectId, "planned", undefined);

  return { episodeNumber, score: reviewResult.totalScore, passed: reviewResult.passed };
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

  // Phase 1: Analysis (0-15%)
  if (!project.analysisData) {
    await updateProjectStatus(agentProjectId, "analyzing", "analyze");
    const analysisPipelineCtx = await runPipeline(analysisPipeline, {
      client, model, taskCtx: ctx,
      initialData: { sourceText: project.sourceText },
      progressRange: [0, 15],
    });
    await prisma.agentProject.update({
      where: { id: agentProjectId },
      data: { analysisData: analysisPipelineCtx.results["analyze"] as object },
    });
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

  // Phase 3: Write + Review + Storyboard + Image Prompts per episode (30-95%)
  // Skip already completed episodes — only process incomplete ones
  const incompleteEpisodes = episodes.filter((e) => e.status !== "completed");
  const perEpisodeProgress = incompleteEpisodes.length > 0 ? 65 / incompleteEpisodes.length : 65;

  for (let i = 0; i < incompleteEpisodes.length; i++) {
    // Re-fetch episode to get latest state (may have been partially done before)
    const freshEp = await prisma.agentEpisode.findUnique({
      where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: incompleteEpisodes[i].episodeNumber } },
    });
    if (!freshEp || freshEp.status === "completed") continue;

    const epNum = freshEp.episodeNumber;
    const baseProgress = 30 + i * perEpisodeProgress;

    // Write — skip if already has script
    let script = freshEp.script ?? "";
    if (!script) {
      await updateProjectStatus(agentProjectId, "writing", `write-ep${epNum}`);
      const prevEp = finalProject.episodes.find((e) => e.episodeNumber === epNum - 1);
      const writeCtx = await runPipeline(writingPipeline, {
        client, model, taskCtx: ctx,
        initialData: {
          episodeNumber: epNum,
          episodeTitle: freshEp.title ?? `第${epNum}集`,
          episodeOutline: freshEp.outline ?? "",
          sourceText: finalProject.sourceText,
          previousEpisodeEnding: prevEp?.script?.slice(-500),
          characters: analysis?.characters ?? [],
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
        },
        progressRange: [baseProgress + perEpisodeProgress * 0.3, baseProgress + perEpisodeProgress * 0.5],
      });
      const reviewResult = reviewCtx.results["review"] as { totalScore: number; passed: boolean };
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { reviewData: reviewCtx.results["review"] as object, reviewScore: reviewResult.totalScore },
      });
    }

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
