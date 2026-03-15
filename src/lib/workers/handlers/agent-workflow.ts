/**
 * Worker handlers for agent workflow tasks.
 * Each AGENT_* task type runs a specific pipeline via the agent runner.
 * Format-aware: supports "script" (screenplay), "novel" (rewrite), and "same" (auto-detect).
 */

import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletion } from "@/lib/llm/client";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import { runPipeline, executeAgent } from "@/lib/agents/runner";
import {
  analysisPipeline,
  planningPipeline,
  writingPipeline,
  reviewPipeline,
  storyboardPipeline,
  imagePromptsPipeline,
  strategyPipeline,
} from "@/lib/agents/pipelines";
import { reflectAgent } from "@/lib/agents/definitions/reflect";
import { improveAgent } from "@/lib/agents/definitions/improve";
import { readerSimulatorAgent } from "@/lib/agents/definitions/reader-simulator";
import {
  CHAPTER_SUMMARY_SYSTEM,
  CHAPTER_SUMMARY_USER,
} from "@/lib/llm/prompts/rewrite-script";
import type { StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";
import type { TaskPayload } from "@/lib/task/types";
import type { RewriteStrategy } from "@/lib/agents/definitions/rewrite-strategist";
import type { ReflectOutput } from "@/lib/agents/definitions/reflect";

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

/** Check if this project is in novel rewrite mode */
function isNovelMode(outputFormat: string | null | undefined): boolean {
  return outputFormat === "novel" || outputFormat === "same";
}

/** Build chapter summaries string from project's accumulated summaries */
function buildPrevChapterSummaries(
  chapterSummaries: Record<string, { summary: string; tail: string }> | null,
  upToEpisode: number,
): string {
  if (!chapterSummaries) return "";
  const lines: string[] = [];
  for (let i = 1; i < upToEpisode; i++) {
    const entry = chapterSummaries[String(i)];
    if (entry) {
      lines.push(`第${i}集: ${entry.summary}`);
    }
  }
  return lines.join("\n");
}

/** Build transition instructions from strategy chapterPlans */
function buildTransitionInstructions(
  strategy: RewriteStrategy | null,
  episodeNumber: number,
): string {
  if (!strategy?.chapterPlans) return "";
  const plan = strategy.chapterPlans.find((p) => p.episodeNumber === episodeNumber);
  if (!plan) return "";
  const parts: string[] = [];
  if (plan.transitionFromPrev) parts.push(`从上集过渡: ${plan.transitionFromPrev}`);
  if (plan.transitionToNext) parts.push(`向下集过渡: ${plan.transitionToNext}`);
  if (plan.keySceneTreatment) parts.push(`关键场景处理: ${plan.keySceneTreatment}`);
  if (plan.emotionalArc) parts.push(`情绪走向: ${plan.emotionalArc}`);
  return parts.join("\n");
}

/** Generate chapter summary after writing */
async function generateChapterSummary(
  client: import("openai").default,
  model: string,
  script: string,
): Promise<string> {
  return chatCompletion(client, {
    model,
    systemPrompt: CHAPTER_SUMMARY_SYSTEM,
    userPrompt: CHAPTER_SUMMARY_USER(script),
    temperature: 0.3,
  });
}

/** Update accumulated chapter summaries on the project */
async function updateChapterSummaries(
  agentProjectId: string,
  episodeNumber: number,
  summary: string,
  tail: string,
) {
  const project = await prisma.agentProject.findUniqueOrThrow({
    where: { id: agentProjectId },
    select: { chapterSummaries: true },
  });
  const summaries = (project.chapterSummaries as Record<string, { summary: string; tail: string }>) ?? {};
  summaries[String(episodeNumber)] = { summary, tail };
  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { chapterSummaries: summaries },
  });
}

// ─── Shared Phase Logic ──────────────────────────────────────────────
// These functions contain the core logic for each pipeline phase.
// Both individual handlers and handleAgentAuto call these.

type LLMContext = { client: import("openai").default; model: string };
type TaskCtx = Parameters<Parameters<typeof withTaskLifecycle>[0]>[1];

/** Run analysis pipeline and save results */
async function runAnalysisPhase(
  agentProjectId: string,
  sourceText: string,
  llm: LLMContext,
  ctx: TaskCtx,
  progressRange: [number, number],
) {
  const pipelineCtx = await runPipeline(analysisPipeline, {
    ...llm, taskCtx: ctx,
    initialData: { sourceText },
    progressRange,
  });
  const analysisData = pipelineCtx.results["analyze"] as object;
  const styleData = pipelineCtx.results["style-analyze"] as object | undefined;
  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: {
      analysisData,
      ...(styleData ? { styleData } : {}),
    },
  });
  return { analysisData, styleData };
}

/** Upsert episodes from LLM plan output */
async function upsertEpisodesFromPlan(
  agentProjectId: string,
  episodes: Array<Record<string, unknown>>,
) {
  const episodeOps = episodes.map((ep, idx) => {
    const epNum = (ep.number ?? ep.episodeNumber ?? idx + 1) as number;
    const epTitle = (ep.title as string) ?? `第${epNum}集`;
    return prisma.agentEpisode.upsert({
      where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
      create: { agentProjectId, episodeNumber: epNum, title: epTitle, outline: JSON.stringify(ep), status: "planned" },
      update: { title: epTitle, outline: JSON.stringify(ep) },
    });
  });
  await prisma.$transaction(episodeOps);
}

/** Run planning pipeline and save results */
async function runPlanningPhase(
  agentProjectId: string,
  project: Awaited<ReturnType<typeof getAgentProject>>,
  llm: LLMContext,
  ctx: TaskCtx,
  progressRange: [number, number],
) {
  const pipelineCtx = await runPipeline(planningPipeline, {
    ...llm, taskCtx: ctx,
    initialData: {
      analysisReport: project.analysisData,
      sourceText: project.sourceText,
      durationPerEp: project.durationPerEp ?? "2-5分钟",
    },
    progressRange,
  });
  const planningData = pipelineCtx.results["plan"] as {
    totalEpisodes: number;
    episodes: Array<Record<string, unknown>>;
  };
  await upsertEpisodesFromPlan(agentProjectId, planningData.episodes);
  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { planningData: planningData as object, targetEpisodes: planningData.totalEpisodes },
  });
  return { planningData };
}

/** Save chapter notes from strategy to episodes */
async function saveChapterNotes(
  agentProjectId: string,
  episodes: Array<{ episodeNumber: number }>,
  chapterPlans: RewriteStrategy["chapterPlans"],
) {
  if (!chapterPlans) return;
  for (const plan of chapterPlans) {
    const ep = episodes.find((e) => e.episodeNumber === plan.episodeNumber);
    if (ep) {
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: plan.episodeNumber } },
        data: {
          chapterNotes: [
            ...plan.focusPoints.map((f: string) => `重点: ${f}`),
            plan.keySceneTreatment ? `关键场景: ${plan.keySceneTreatment}` : "",
            plan.emotionalArc ? `情绪弧线: ${plan.emotionalArc}` : "",
          ].filter(Boolean).join("\n"),
        },
      });
    }
  }
}

/** Run strategy pipeline and save results */
async function runStrategyPhase(
  agentProjectId: string,
  project: Awaited<ReturnType<typeof getAgentProject>>,
  llm: LLMContext,
  ctx: TaskCtx,
  progressRange: [number, number],
) {
  const analysis = project.analysisData as {
    characters?: Array<{ name: string; personality: string[]; appearance: string }>;
  };
  const styleFingerprint = project.styleData as unknown as StyleFingerprint;
  const episodeOutlines = project.episodes.map((ep) => ({
    episodeNumber: ep.episodeNumber,
    title: ep.title ?? `第${ep.episodeNumber}集`,
    outline: ep.outline ?? "",
  }));

  const pipelineCtx = await runPipeline(strategyPipeline, {
    ...llm, taskCtx: ctx,
    initialData: {
      episodeOutlines,
      styleFingerprint,
      characters: analysis.characters ?? [],
      sourceTextSample: project.sourceText.slice(0, 8000),
      totalEpisodes: project.episodes.length,
    },
    progressRange,
  });

  const strategy = pipelineCtx.results["strategy"] as RewriteStrategy;
  await saveChapterNotes(agentProjectId, project.episodes, strategy.chapterPlans);
  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { rewriteStrategy: strategy as object },
  });
  return { strategy };
}

interface EpisodeWriteParams {
  agentProjectId: string;
  episode: { episodeNumber: number; title: string | null; outline: string | null; chapterNotes: string | null };
  sourceText: string;
  outputFormat: string;
  analysis: { characters?: Array<{ name: string; personality: string[]; appearance: string }> } | null;
  styleFingerprint: StyleFingerprint | null;
  rewriteStrategy: RewriteStrategy | null;
  chapterSummaries: Record<string, { summary: string; tail: string }> | null;
}

/** Run write pipeline for a single episode and save results. Returns final script. */
async function runEpisodeWritePhase(
  params: EpisodeWriteParams,
  llm: LLMContext,
  ctx: TaskCtx,
  progressRange: [number, number],
): Promise<{ script: string; reflectResult?: ReflectOutput; improved: boolean }> {
  const { agentProjectId, episode, sourceText, outputFormat, analysis, styleFingerprint, rewriteStrategy, chapterSummaries } = params;
  const epNum = episode.episodeNumber;
  const useNovelMode = isNovelMode(outputFormat) && !!rewriteStrategy;

  // Get previous episode ending for continuity
  const prevEp = epNum > 1
    ? await prisma.agentEpisode.findUnique({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum - 1 } },
        select: { script: true },
      })
    : null;

  const initialData: Record<string, unknown> = {
    episodeNumber: epNum,
    episodeTitle: episode.title ?? `第${epNum}集`,
    episodeOutline: episode.outline ?? "",
    sourceText,
    previousEpisodeEnding: prevEp?.script?.slice(-500),
    characters: analysis?.characters ?? [],
    outputFormat,
    styleFingerprint: styleFingerprint ?? undefined,
  };

  if (useNovelMode) {
    // Re-fetch latest chapter summaries for cross-episode continuity
    const latestProject = await prisma.agentProject.findUniqueOrThrow({
      where: { id: agentProjectId },
      select: { chapterSummaries: true },
    });
    const latestSummaries = latestProject.chapterSummaries as Record<string, { summary: string; tail: string }> | null;

    initialData.rewriteStrategy = rewriteStrategy;
    initialData.chapterNotes = episode.chapterNotes ?? undefined;
    initialData.prevChapterSummaries = buildPrevChapterSummaries(latestSummaries ?? chapterSummaries, epNum);
    initialData.transitionInstructions = buildTransitionInstructions(rewriteStrategy, epNum);
    initialData.strategyContext = rewriteStrategy
      ? { globalStyle: rewriteStrategy.globalStyle, characterVoices: rewriteStrategy.characterVoices, chapterNotes: episode.chapterNotes ?? undefined }
      : undefined;
  }

  // Step 1: Write (always uses writingPipeline — reflect/improve handled below)
  const [writeStart, writeEnd] = [progressRange[0], progressRange[0] + (progressRange[1] - progressRange[0]) * (useNovelMode ? 0.4 : 1)];
  const pipelineCtx = await runPipeline(writingPipeline, {
    ...llm, taskCtx: ctx, initialData, progressRange: [writeStart, writeEnd],
  });

  const writeResult = pipelineCtx.results["write"] as { script: string };
  let currentScript = writeResult.script;
  let lastReflect: ReflectOutput | undefined;
  let improved = false;

  // Step 2: Multi-round reflect/improve loop (novel mode only)
  if (useNovelMode) {
    const MAX_ROUNDS = 3;
    const PASS_THRESHOLD = 56; // 80 × 70%

    const strategyCtx = initialData.strategyContext as {
      globalStyle: RewriteStrategy["globalStyle"];
      characterVoices?: RewriteStrategy["characterVoices"];
      chapterNotes?: string;
    } | undefined;

    const reflectProgressRange = progressRange[1] - writeEnd;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      // Reflect
      ctx.publishText(`\n📝 第${round}轮质量反思...\n`);
      const reflectResult = await executeAgent(reflectAgent, {
        originalText: sourceText,
        rewrittenText: currentScript,
        strategyContext: strategyCtx,
      }, llm.client, llm.model, ctx);
      lastReflect = reflectResult.parsed;

      ctx.publishText(`反思得分: ${lastReflect.totalScore}/80\n`);

      if (lastReflect.totalScore >= PASS_THRESHOLD) {
        ctx.publishText(`✅ 质量达标 (${lastReflect.totalScore}分)\n`);
        break;
      }

      if (round === MAX_ROUNDS) {
        ctx.publishText(`⚠️ 已达最大修改轮次，使用当前版本\n`);
        break;
      }

      // Improve
      ctx.publishText(`🔧 第${round}轮改进...\n`);
      const improveResult = await executeAgent(improveAgent, {
        rewrittenText: currentScript,
        reflectionFeedback: JSON.stringify({
          scores: lastReflect.scores,
          aiPatterns: lastReflect.aiPatterns,
          suggestions: lastReflect.suggestions,
          strategyViolations: lastReflect.strategyCompliance?.violations,
        }),
        strategyContext: strategyCtx
          ? {
              narrativeVoice: strategyCtx.globalStyle.narrativeVoice,
              toneAndRegister: strategyCtx.globalStyle.toneAndRegister,
              dialogueApproach: strategyCtx.globalStyle.dialogueApproach,
            }
          : undefined,
      }, llm.client, llm.model, ctx);

      currentScript = improveResult.parsed.script;
      improved = true;

      // Report progress proportionally
      const roundProgress = writeEnd + (reflectProgressRange * round) / MAX_ROUNDS;
      await ctx.reportProgress(Math.round(roundProgress));
    }

    // Step 3: Reader simulation (non-blocking, informational only)
    try {
      ctx.publishText(`\n📖 读者视角模拟...\n`);
      const readerResult = await executeAgent(readerSimulatorAgent, {
        script: currentScript,
        episodeNumber: epNum,
        isPaywallCandidate: epNum >= 3 && epNum <= 5,
      }, llm.client, llm.model, ctx);

      ctx.publishText(`读者参与度: ${readerResult.parsed.overallEngagement}/10\n`);
      if (readerResult.parsed.boringSegments.length > 0) {
        ctx.publishText(`⚠️ 发现${readerResult.parsed.boringSegments.length}处划走风险段落\n`);
      }

      // Attach reader simulation to reflectionData
      if (lastReflect) {
        (lastReflect as unknown as Record<string, unknown>).readerSimulation = readerResult.parsed;
      }
    } catch {
      // Reader simulation is optional, don't block workflow
      ctx.publishText(`⚠️ 读者模拟跳过\n`);
    }
  }

  const finalScript = currentScript;

  // Save episode
  await prisma.agentEpisode.update({
    where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
    data: {
      script: finalScript,
      scriptVersion: { increment: 1 },
      status: "drafted",
      rewriteAttempt: { increment: 1 },
      ...(lastReflect ? { reflectionData: lastReflect as object } : {}),
    },
  });

  // Generate chapter summary for novel mode
  if (useNovelMode) {
    try {
      const summary = await generateChapterSummary(llm.client, llm.model, finalScript);
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { chapterSummary: summary },
      });
      await updateChapterSummaries(agentProjectId, epNum, summary, finalScript.slice(-500));
    } catch {
      // Non-critical, continue
    }
  }

  return { script: finalScript, reflectResult: lastReflect, improved };
}

// ─── AGENT_ANALYZE ───────────────────────────────────────────────────

export const handleAgentAnalyze = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;

  await updateProjectStatus(agentProjectId, "analyzing", "analyze");
  const project = await getAgentProject(agentProjectId);
  const llm = await setupLLM(userId);

  const result = await runAnalysisPhase(agentProjectId, project.sourceText, llm, ctx, [5, 90]);
  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { status: "analyzed", currentStep: null },
  });

  return result;
});

// ─── AGENT_PLAN ──────────────────────────────────────────────────────

export const handleAgentPlan = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;

  await updateProjectStatus(agentProjectId, "planning", "plan");
  const project = await getAgentProject(agentProjectId);
  if (!project.analysisData) throw new Error("Analysis must be completed before planning");
  const llm = await setupLLM(userId);

  const result = await runPlanningPhase(agentProjectId, project, llm, ctx, [5, 85]);
  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { status: "planned", currentStep: null },
  });

  return result;
});

// ─── AGENT_REWRITE_STRATEGY ──────────────────────────────────────

export const handleAgentRewriteStrategy = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;

  await updateProjectStatus(agentProjectId, "planning", "strategy");
  const project = await getAgentProject(agentProjectId);
  if (!project.analysisData) throw new Error("Analysis must be completed before strategy design");
  if (!project.planningData) throw new Error("Planning must be completed before strategy design");
  if (!project.styleData) throw new Error("Style analysis must be completed before strategy design");
  const llm = await setupLLM(userId);

  const result = await runStrategyPhase(agentProjectId, project, llm, ctx, [5, 90]);
  await updateProjectStatus(agentProjectId, "strategy-designed", undefined);
  return result;
});

// ─── AGENT_WRITE ─────────────────────────────────────────────────────

export const handleAgentWrite = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const episodeNumber = data.episodeNumber as number;

  await updateProjectStatus(agentProjectId, "writing", `write-ep${episodeNumber}`);
  const project = await getAgentProject(agentProjectId);
  const episode = project.episodes.find((e) => e.episodeNumber === episodeNumber);
  if (!episode) throw new Error(`Episode ${episodeNumber} not found`);
  const llm = await setupLLM(userId);

  const result = await runEpisodeWritePhase({
    agentProjectId,
    episode,
    sourceText: project.sourceText,
    outputFormat: project.outputFormat || "script",
    analysis: project.analysisData as { characters?: Array<{ name: string; personality: string[]; appearance: string }> } | null,
    styleFingerprint: project.styleData as unknown as StyleFingerprint | null,
    rewriteStrategy: project.rewriteStrategy as unknown as RewriteStrategy | null,
    chapterSummaries: project.chapterSummaries as Record<string, { summary: string; tail: string }> | null,
  }, llm, ctx, [5, 90]);

  await updateProjectStatus(agentProjectId, project.strategyConfirmed ? "strategy-confirmed" : "planned", undefined);

  return {
    episodeNumber,
    scriptLength: result.script.length,
    reflectScore: result.reflectResult?.totalScore,
    improved: result.improved,
  };
});

// ─── AGENT_REVIEW ────────────────────────────────────────────────────

export const handleAgentReview = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const episodeNumber = data.episodeNumber as number;

  await updateProjectStatus(agentProjectId, "reviewing", `review-ep${episodeNumber}`);

  const project = await getAgentProject(agentProjectId);
  const outputFormat = project.outputFormat || "script";
  const styleData = project.styleData as { contentType?: string } | null;
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
      contentType: styleData?.contentType,
    },
    progressRange: [5, 90],
  });

  const reviewResult = pipelineCtx.results["review"] as {
    totalScore: number;
    passed: boolean;
  };
  // Don't trust LLM's `passed` field — compute from score (≥49 = pass, 70×70%)
  const PASS_THRESHOLD = 49;
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
  const llm = await setupLLM(userId);
  const outputFormat = project.outputFormat || "script";
  const isVisual = needsVisualPipeline(outputFormat);
  const isNovel = isNovelMode(outputFormat);

  // Phase 1: Analysis (0-15%)
  if (!project.analysisData) {
    await updateProjectStatus(agentProjectId, "analyzing", "analyze");
    await runAnalysisPhase(agentProjectId, project.sourceText, llm, ctx, [0, 15]);
  }
  await ctx.reportProgress(15);

  // Phase 2: Planning (15-28%)
  const freshProject = await getAgentProject(agentProjectId);
  if (!freshProject.planningData) {
    await updateProjectStatus(agentProjectId, "planning", "plan");
    await runPlanningPhase(agentProjectId, freshProject, llm, ctx, [15, 28]);
  }
  await ctx.reportProgress(28);

  // Phase 2.5: Strategy Design (28-38%) — novel mode only, pause for user confirmation
  if (isNovel) {
    const projectForStrategy = await getAgentProject(agentProjectId);
    if (!projectForStrategy.rewriteStrategy) {
      await updateProjectStatus(agentProjectId, "planning", "strategy");
      ctx.publishText("\n\n📐 设计改写策略...\n");
      const { strategy } = await runStrategyPhase(agentProjectId, projectForStrategy, llm, ctx, [28, 38]);

      ctx.publishText(`\n✅ 改写策略设计完成\n📄 ${strategy.humanReadableSummary?.slice(0, 200)}...\n`);
      ctx.publishText("\n⏸️ 请审阅改写策略后，点击「确认并执行」继续\n");

      // PAUSE — task completes here; project.status = "strategy-designed".
      // User reviews strategy in UI, then calls POST /execute to resume.
      await updateProjectStatus(agentProjectId, "strategy-designed", "paused-strategy");
      return { paused: true, reason: "strategy-designed" };
    }

    if (!projectForStrategy.strategyConfirmed) {
      ctx.publishText("\n⏸️ 改写策略已设计，等待用户确认...\n");
      await updateProjectStatus(agentProjectId, "strategy-designed", "paused-strategy");
      return { paused: true, reason: "awaiting-confirmation" };
    }
  }
  await ctx.reportProgress(38);

  // Phase 3: Write + Review [+ Storyboard + Image Prompts] per episode (38-95%)
  const finalProject = await getAgentProject(agentProjectId);
  const episodes = targetEpisodes
    ? finalProject.episodes.filter((e) => targetEpisodes.includes(e.episodeNumber))
    : finalProject.episodes;

  const analysis = finalProject.analysisData as {
    characters?: Array<{ name: string; personality: string[]; appearance: string }>;
  } | null;
  const styleFingerprint = finalProject.styleData as unknown as StyleFingerprint | null;
  const rewriteStrategy = finalProject.rewriteStrategy as unknown as RewriteStrategy | null;
  const chapterSummaries = finalProject.chapterSummaries as Record<string, { summary: string; tail: string }> | null;

  const incompleteEpisodes = episodes.filter((e) => e.status !== "completed");
  const perEpisodeProgress = incompleteEpisodes.length > 0 ? 57 / incompleteEpisodes.length : 57;

  for (let i = 0; i < incompleteEpisodes.length; i++) {
    const freshEp = await prisma.agentEpisode.findUnique({
      where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: incompleteEpisodes[i].episodeNumber } },
    });
    if (!freshEp || freshEp.status === "completed") continue;

    // Check if episode is already fully done based on format
    const isFullyDone = isVisual
      ? !!(freshEp.script && freshEp.reviewScore && freshEp.storyboard && freshEp.imagePrompts)
      : !!(freshEp.script && freshEp.reviewScore);
    if (isFullyDone) {
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: freshEp.episodeNumber } },
        data: { status: "completed" },
      });
      continue;
    }

    const epNum = freshEp.episodeNumber;
    const baseProgress = 38 + i * perEpisodeProgress;

    // Write — skip if already has script
    let script = freshEp.script ?? "";
    if (!script) {
      await updateProjectStatus(agentProjectId, "writing", `write-ep${epNum}`);
      const writeResult = await runEpisodeWritePhase({
        agentProjectId,
        episode: freshEp,
        sourceText: finalProject.sourceText,
        outputFormat,
        analysis,
        styleFingerprint,
        rewriteStrategy,
        chapterSummaries,
      }, llm, ctx, [baseProgress, baseProgress + perEpisodeProgress * (isNovel ? 0.7 : 0.3)]);
      script = writeResult.script;
    }

    // Review — skip if already reviewed
    if (!freshEp.reviewScore) {
      await updateProjectStatus(agentProjectId, "reviewing", `review-ep${epNum}`);
      const reviewCtx = await runPipeline(reviewPipeline, {
        ...llm, taskCtx: ctx,
        initialData: {
          episodeNumber: epNum,
          script,
          sourceText: finalProject.sourceText,
          outputFormat,
          contentType: (styleFingerprint as { contentType?: string } | null)?.contentType,
        },
        progressRange: [baseProgress + perEpisodeProgress * (isNovel ? 0.7 : 0.3), baseProgress + perEpisodeProgress * (isNovel ? 0.9 : 0.5)],
      });
      const reviewResult = reviewCtx.results["review"] as { totalScore: number; passed: boolean };

      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: {
          reviewData: reviewCtx.results["review"] as object,
          reviewScore: reviewResult.totalScore,
          ...(!isVisual ? { status: "completed" } : {}),
        },
      });

      if (!isVisual) continue;
    }

    if (!isVisual) continue;

    // Storyboard
    let storyboardData: unknown = null;
    if (!freshEp.storyboard) {
      await updateProjectStatus(agentProjectId, "storyboarding", `storyboard-ep${epNum}`);
      const sbCtx = await runPipeline(storyboardPipeline, {
        ...llm, taskCtx: ctx,
        initialData: { episodeNumber: epNum, script, characters: analysis?.characters ?? [], outputFormat },
        progressRange: [baseProgress + perEpisodeProgress * 0.5, baseProgress + perEpisodeProgress * 0.75],
      });
      storyboardData = sbCtx.results["storyboard"];
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { storyboard: JSON.stringify({ storyboard: storyboardData, visualNarrative: sbCtx.results["visual-narrative"] }) },
      });
    } else {
      const parsed = JSON.parse(freshEp.storyboard);
      storyboardData = parsed.storyboard ?? parsed;
    }

    // Image prompts
    if (!freshEp.imagePrompts) {
      await updateProjectStatus(agentProjectId, "imaging", `images-ep${epNum}`);
      const characterCards = (analysis?.characters ?? []).map((c) => ({ name: c.name, promptDescription: c.appearance }));
      const imgCtx = await runPipeline(imagePromptsPipeline, {
        ...llm, taskCtx: ctx,
        initialData: { episodeNumber: epNum, storyboard: storyboardData, characterCards, outputFormat },
        progressRange: [baseProgress + perEpisodeProgress * 0.75, baseProgress + perEpisodeProgress],
      });
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { imagePrompts: JSON.stringify(imgCtx.results["image-prompts"]), status: "completed" },
      });
    } else {
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
