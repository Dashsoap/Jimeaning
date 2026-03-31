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
import type { RewriteStrategy, NameMapping } from "@/lib/agents/definitions/rewrite-strategist";
import type { ReflectOutput } from "@/lib/agents/definitions/reflect";
import { checkSimilarity, findDuplicateSegments } from "@/lib/text/similarity";
import { findOriginalNameResidues, forceReplaceNames } from "@/lib/text/name-check";

// ─── Helpers ─────────────────────────────────────────────────────────

export async function setupLLM(userId: string) {
  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);
  return { client, model: llmCfg.model };
}

export async function getAgentProject(agentProjectId: string) {
  const project = await prisma.agentProject.findUniqueOrThrow({
    where: { id: agentProjectId },
    include: { episodes: { orderBy: { episodeNumber: "asc" } } },
  });
  return project;
}

export async function updateProjectStatus(id: string, status: string, currentStep?: string) {
  await prisma.agentProject.update({
    where: { id },
    data: { status, currentStep },
  });
}

/** Derive project status from episode states instead of hardcoding */
export async function deriveAndUpdateProjectStatus(agentProjectId: string) {
  const project = await prisma.agentProject.findUniqueOrThrow({
    where: { id: agentProjectId },
    include: { episodes: { select: { status: true } } },
  });
  const episodes = project.episodes;
  let derivedStatus: string;

  if (episodes.length > 0 && episodes.every((e) => e.status === "completed")) {
    derivedStatus = "completed";
  } else if (project.strategyConfirmed) {
    derivedStatus = "strategy-confirmed";
  } else if (project.planningData) {
    derivedStatus = "planned";
  } else if (project.analysisData) {
    derivedStatus = "analyzed";
  } else {
    derivedStatus = "created";
  }

  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { status: derivedStatus, currentStep: null },
  });
}

/**
 * Merge Phase 3 video_prompt data back into storyboard shots.
 * Matches by shotNumber, adding video_prompt/shot_type/camera_move to each shot.
 */
export function mergeVideoPrompts(
  storyboardData: unknown,
  detailData: { panels?: Array<Record<string, unknown>> } | null,
): unknown {
  if (!detailData?.panels?.length) return storyboardData;

  // Build shotNumber → detail map (coerce to number for reliable matching)
  const detailMap = new Map<number, Record<string, unknown>>();
  for (const p of detailData.panels) {
    const num = Number(p.shotNumber ?? p.panel_number);
    if (!isNaN(num) && num > 0) detailMap.set(num, p);
  }

  // Deep clone storyboard to avoid mutation
  const sb = JSON.parse(JSON.stringify(storyboardData)) as Record<string, unknown>;

  // Navigate to shots (could be scenes[].shots[] or flat)
  const scenes = sb.scenes as Array<{ shots: Array<Record<string, unknown>> }> | undefined;
  if (scenes) {
    let globalIdx = 1;
    for (const scene of scenes) {
      for (const shot of scene.shots ?? []) {
        const shotNum = Number(shot.shotNumber) || globalIdx;
        const detail = detailMap.get(shotNum);
        if (detail) {
          shot.video_prompt = detail.video_prompt;
          if (detail.shot_type) shot.shot_type = detail.shot_type;
          if (detail.camera_move) shot.camera_move = detail.camera_move;
          if (detail.description) shot.detailDescription = detail.description;
        }
        globalIdx++;
      }
    }
  }

  return sb;
}

/** Check if this project uses visual pipeline (storyboard + image prompts) */
export function needsVisualPipeline(outputFormat: string | null | undefined): boolean {
  return !outputFormat || outputFormat === "script";
}

/** Check if this project is in novel rewrite mode */
export function isNovelMode(outputFormat: string | null | undefined): boolean {
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

export type LLMContext = { client: import("openai").default; model: string };
export type TaskCtx = Parameters<Parameters<typeof withTaskLifecycle>[0]>[1];

/** Run analysis pipeline and save results */
export async function runAnalysisPhase(
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

    // Extract source range offsets if available
    const sourceRange = ep.sourceRange as { start: number; end: number } | string | undefined;
    let sourceStart: number | undefined;
    let sourceEnd: number | undefined;
    if (sourceRange && typeof sourceRange === "object" && "start" in sourceRange) {
      sourceStart = sourceRange.start;
      sourceEnd = sourceRange.end;
    }

    return prisma.agentEpisode.upsert({
      where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
      create: {
        agentProjectId, episodeNumber: epNum, title: epTitle,
        outline: JSON.stringify(ep), status: "planned",
        ...(sourceStart !== undefined ? { sourceStart } : {}),
        ...(sourceEnd !== undefined ? { sourceEnd } : {}),
      },
      update: {
        title: epTitle, outline: JSON.stringify(ep),
        ...(sourceStart !== undefined ? { sourceStart } : {}),
        ...(sourceEnd !== undefined ? { sourceEnd } : {}),
      },
    });
  });
  await prisma.$transaction(episodeOps);
}

/** Run planning pipeline and save results */
export async function runPlanningPhase(
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
      outputFormat: project.outputFormat || "script",
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
export async function runStrategyPhase(
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
      rewriteIntensity: project.rewriteIntensity,
      preserveDimensions: (project.preserveDimensions as string[] | null) ?? undefined,
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

export interface EpisodeWriteParams {
  agentProjectId: string;
  episode: { episodeNumber: number; title: string | null; outline: string | null; chapterNotes: string | null; sourceStart?: number | null; sourceEnd?: number | null };
  sourceText: string;
  outputFormat: string;
  analysis: { characters?: Array<{ name: string; personality: string[]; appearance: string }> } | null;
  styleFingerprint: StyleFingerprint | null;
  rewriteStrategy: RewriteStrategy | null;
  chapterSummaries: Record<string, { summary: string; tail: string }> | null;
  userFeedback?: string;
  rewriteIntensity?: number;
}

/** Run write pipeline for a single episode and save results. Returns final script. */
export async function runEpisodeWritePhase(
  params: EpisodeWriteParams,
  llm: LLMContext,
  ctx: TaskCtx,
  progressRange: [number, number],
): Promise<{ script: string; reflectResult?: ReflectOutput; improved: boolean }> {
  const { agentProjectId, episode, sourceText: fullSourceText, outputFormat, analysis, styleFingerprint, rewriteStrategy, chapterSummaries, userFeedback, rewriteIntensity } = params;
  const epNum = episode.episodeNumber;
  const useNovelMode = isNovelMode(outputFormat) && !!rewriteStrategy;

  // Slice source text by chapter offsets if available
  const sourceText = (episode.sourceStart != null && episode.sourceEnd != null)
    ? fullSourceText.slice(episode.sourceStart, episode.sourceEnd)
    : fullSourceText;

  // Get previous episode ending for continuity
  const prevEp = epNum > 1
    ? await prisma.agentEpisode.findUnique({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum - 1 } },
        select: { script: true },
      })
    : null;

  // If user gave feedback, fetch current script for context
  let existingScript: string | undefined;
  if (userFeedback) {
    const currentEp = await prisma.agentEpisode.findUnique({
      where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
      select: { script: true },
    });
    existingScript = currentEp?.script ?? undefined;
  }

  const initialData: Record<string, unknown> = {
    episodeNumber: epNum,
    episodeTitle: episode.title ?? `第${epNum}集`,
    episodeOutline: episode.outline ?? "",
    sourceText,
    previousEpisodeEnding: prevEp?.script?.slice(-500),
    characters: analysis?.characters ?? [],
    outputFormat,
    styleFingerprint: styleFingerprint ?? undefined,
    rewriteIntensity,
    ...(userFeedback ? { userFeedback, currentScript: existingScript } : {}),
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
    // Adjust threshold by intensity: lower intensity = more rewrite = higher quality bar
    const thresholdByIntensity: Record<number, number> = { 1: 70, 2: 65, 3: 63, 4: 58, 5: 50 };
    const PASS_THRESHOLD = thresholdByIntensity[rewriteIntensity ?? 3] ?? 63;

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

      ctx.publishText(`反思得分: ${lastReflect.totalScore}/90\n`);

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

// ─── Post-Processing Validation ────────────────────────────────────────

interface PostProcessResult {
  similarityScore: number;
  similarityPassed: boolean;
  duplicateSegments: string[];
  nameResidues: Array<{ original: string; category: string; count: number }>;
  nameCheckPassed: boolean;
  wordCountRatio: number;
  wordCountPassed: boolean;
}

/** Run post-processing checks on a rewritten episode (novel mode) */
export async function runPostProcessChecks(
  originalText: string,
  rewrittenText: string,
  nameMapping: NameMapping | undefined,
  ctx: TaskCtx,
): Promise<PostProcessResult> {
  // 1. Similarity check
  ctx.publishText(`   🔍 雷同度检测...\n`);
  const simResult = checkSimilarity(originalText, rewrittenText);
  const SIMILARITY_THRESHOLD = 0.05; // 5%
  const similarityPassed = simResult.overallSimilarity < SIMILARITY_THRESHOLD;
  ctx.publishText(`   📊 雷同度: ${(simResult.overallSimilarity * 100).toFixed(1)}% ${similarityPassed ? "✅" : "⚠️"}\n`);
  if (simResult.duplicateSegments.length > 0) {
    ctx.publishText(`   ⚠️ 发现${simResult.duplicateSegments.length}处重复片段\n`);
  }

  // 2. Name residue check
  let nameResidues: PostProcessResult["nameResidues"] = [];
  let nameCheckPassed = true;
  if (nameMapping) {
    ctx.publishText(`   🔍 原名残留检查...\n`);
    const nameResult = findOriginalNameResidues(rewrittenText, nameMapping);
    nameResidues = nameResult.residues;
    nameCheckPassed = nameResult.passed;
    if (!nameCheckPassed) {
      ctx.publishText(`   ⚠️ 发现${nameResult.totalResidues}处原名残留:\n`);
      for (const r of nameResult.residues.slice(0, 5)) {
        ctx.publishText(`      "${r.original}" (${r.category}) × ${r.count}\n`);
      }
    } else {
      ctx.publishText(`   ✅ 原名已全部替换\n`);
    }
  }

  // 3. Word count check
  const wordCountRatio = rewrittenText.length / Math.max(originalText.length, 1);
  const wordCountPassed = wordCountRatio >= 0.8 && wordCountRatio <= 1.2;
  ctx.publishText(`   📏 字数保真: ${(wordCountRatio * 100).toFixed(0)}% (原文${originalText.length}字 → 改写${rewrittenText.length}字) ${wordCountPassed ? "✅" : "⚠️"}\n`);

  return {
    similarityScore: simResult.overallSimilarity,
    similarityPassed,
    duplicateSegments: simResult.duplicateSegments,
    nameResidues,
    nameCheckPassed,
    wordCountRatio,
    wordCountPassed,
  };
}

// ─── AGENT_ANALYZE ───────────────────────────────────────────────────

export const handleAgentAnalyze = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;

  await updateProjectStatus(agentProjectId, "analyzing", "analyze");
  const project = await getAgentProject(agentProjectId);
  const llm = await setupLLM(userId);

  ctx.publishText("\n📊 开始分析原文...\n");
  const result = await runAnalysisPhase(agentProjectId, project.sourceText, llm, ctx, [5, 90]);

  // Summarize analysis results
  const analysisObj = result.analysisData as { characters?: Array<{ name: string }>; themes?: string[] } | undefined;
  if (analysisObj) {
    const charNames = analysisObj.characters?.map((c) => c.name).join(", ") ?? "";
    const themes = analysisObj.themes?.slice(0, 3).join(", ") ?? "";
    if (charNames) ctx.publishText(`👥 发现角色: ${charNames}\n`);
    if (themes) ctx.publishText(`🎭 主题: ${themes}\n`);
  }

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

  ctx.publishText("\n📋 开始规划集数...\n");
  const result = await runPlanningPhase(agentProjectId, project, llm, ctx, [5, 85]);

  // Summarize planning results
  const planData = result.planningData as { totalEpisodes?: number; episodes?: Array<{ title?: string }> } | undefined;
  if (planData) {
    ctx.publishText(`📺 共 ${planData.totalEpisodes ?? planData.episodes?.length ?? 0} 集\n`);
    if (planData.episodes) {
      planData.episodes.forEach((ep, i) => {
        ctx.publishText(`   ${i + 1}. ${ep.title ?? `第${i + 1}集`}\n`);
      });
    }
  }

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

  ctx.publishText("\n📐 设计改写策略...\n");
  const result = await runStrategyPhase(agentProjectId, project, llm, ctx, [5, 90]);

  const strategy = result.strategy;
  if (strategy.humanReadableSummary) {
    ctx.publishText(`\n📄 ${strategy.humanReadableSummary.slice(0, 300)}\n`);
  }

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

  const userFeedback = data.userFeedback as string | undefined;
  ctx.publishText(`\n📝 第${episodeNumber}集: ${episode.title ?? "无标题"}${userFeedback ? " (根据意见重写)" : ""}\n`);
  if (userFeedback) {
    ctx.publishText(`💬 用户意见: ${userFeedback}\n`);
  }

  const result = await runEpisodeWritePhase({
    agentProjectId,
    episode,
    sourceText: project.sourceText,
    outputFormat: project.outputFormat || "script",
    analysis: project.analysisData as { characters?: Array<{ name: string; personality: string[]; appearance: string }> } | null,
    styleFingerprint: project.styleData as unknown as StyleFingerprint | null,
    rewriteStrategy: project.rewriteStrategy as unknown as RewriteStrategy | null,
    chapterSummaries: project.chapterSummaries as Record<string, { summary: string; tail: string }> | null,
    userFeedback,
    rewriteIntensity: project.rewriteIntensity,
  }, llm, ctx, [5, 90]);

  ctx.publishText(`\n✅ 第${episodeNumber}集写作完成 (${result.script.length}字)${result.reflectResult ? ` 反思评分: ${result.reflectResult.totalScore}/90` : ""}${result.improved ? " [已改进]" : ""}\n`);

  // Post-processing checks for novel mode
  let postProcess: PostProcessResult | undefined;
  if (isNovelMode(project.outputFormat)) {
    const epSourceText = (episode.sourceStart != null && episode.sourceEnd != null)
      ? project.sourceText.slice(episode.sourceStart, episode.sourceEnd)
      : project.sourceText;
    const nameMapping = (project.rewriteStrategy as unknown as { nameMapping?: NameMapping })?.nameMapping;

    // Force-replace original names before checks (deterministic, no LLM needed)
    let finalScript = result.script;
    if (nameMapping) {
      const replaceResult = forceReplaceNames(finalScript, nameMapping);
      if (replaceResult.replacementCount > 0) {
        finalScript = replaceResult.text;
        ctx.publishText(`   🔄 强制替换了 ${replaceResult.replacementCount} 处原名残留\n`);
        // Update the episode with corrected script
        await prisma.agentEpisode.update({
          where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber } },
          data: { script: finalScript },
        });
      }
    }

    postProcess = await runPostProcessChecks(epSourceText, finalScript, nameMapping, ctx);

    const existingReflection = result.reflectResult as Record<string, unknown> | undefined;
    const updatedReflection = { ...(existingReflection ?? {}), postProcess };

    await prisma.agentEpisode.update({
      where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber } },
      data: {
        reflectionData: updatedReflection as object,
        similarityScore: postProcess.similarityScore,
      },
    });
  }

  await deriveAndUpdateProjectStatus(agentProjectId);

  return {
    episodeNumber,
    scriptLength: result.script.length,
    reflectScore: result.reflectResult?.totalScore,
    improved: result.improved,
    ...(postProcess ? {
      similarityScore: postProcess.similarityScore,
      nameCheckPassed: postProcess.nameCheckPassed,
      wordCountRatio: postProcess.wordCountRatio,
    } : {}),
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

  // Use sliced source text if offsets available
  const episodeSourceText = (episode.sourceStart != null && episode.sourceEnd != null)
    ? project.sourceText.slice(episode.sourceStart, episode.sourceEnd)
    : project.sourceText;

  const { client, model } = await setupLLM(userId);

  ctx.publishText(`\n🔍 审核第${episodeNumber}集...\n`);

  const pipelineCtx = await runPipeline(reviewPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: {
      episodeNumber,
      script: episode.script,
      sourceText: episodeSourceText,
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

  ctx.publishText(`\n${passed ? "✅" : "❌"} 第${episodeNumber}集审核: ${reviewResult.totalScore}分 — ${passed ? "通过" : "未通过"}\n`);

  await deriveAndUpdateProjectStatus(agentProjectId);

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

  ctx.publishText(`\n🎬 分镜第${episodeNumber}集...\n`);

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

  // Combine storyboard + visual narrative + detail (video_prompt)
  const storyboardData = pipelineCtx.results["storyboard"];
  const visualData = pipelineCtx.results["visual-narrative"];
  const detailData = pipelineCtx.results["storyboard-detail"] as { panels?: Array<Record<string, unknown>> } | null;

  // Merge Phase 3 video_prompt back into storyboard shots
  const mergedStoryboard = mergeVideoPrompts(storyboardData, detailData);

  const sbScenes = (mergedStoryboard as { scenes?: { shots?: unknown[] }[] })?.scenes ?? [];
  const panelCount = sbScenes.reduce((n, sc) => n + (sc.shots?.length ?? 0), 0) || "?";
  ctx.publishText(`✅ 分镜完成: ${panelCount}个镜头\n`);

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      storyboard: JSON.stringify({ storyboard: mergedStoryboard, visualNarrative: visualData }),
      status: "storyboarded",
    },
  });

  await deriveAndUpdateProjectStatus(agentProjectId);

  return { episodeNumber, storyboard: mergedStoryboard };
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

  ctx.publishText(`\n🖼️ 生成图片提示词 第${episodeNumber}集...\n`);

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
  ctx.publishText(`✅ 图片提示词生成完成\n`);

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      imagePrompts: JSON.stringify(imageResult),
      status: "completed",
    },
  });

  await deriveAndUpdateProjectStatus(agentProjectId);

  return { episodeNumber, imagePrompts: imageResult };
});

// ─── AGENT_AUTO (Full pipeline) ──────────────────────────────────────

export const handleAgentAuto = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;
  const targetEpisodes = data.targetEpisodes as number[] | undefined;

  // ─── Orchestrator mode (feature flag) ─────────────────────────
  if (process.env.USE_ORCHESTRATOR === "true") {
    const { runOrchestratorLoop } = await import("@/lib/agents/orchestrator");
    const { resolveOrchestratorLlmConfig } = await import("@/lib/providers/resolve");

    const project = await getAgentProject(agentProjectId);
    const orchLlm = await resolveOrchestratorLlmConfig(userId, project.orchestratorModelKey);

    ctx.publishText("\n🚀 编排器模式启动\n");
    const result = await runOrchestratorLoop(agentProjectId, userId, ctx, {
      orchestratorLlm: orchLlm,
    });

    if (result.paused) {
      return { paused: true, reason: result.pauseReason };
    }
    return { completed: result.completed, iterations: result.iterations };
  }
  // ─── Legacy hardcoded pipeline (below) ─────────────────────────

  const project = await getAgentProject(agentProjectId);
  const llm = await setupLLM(userId);
  const outputFormat = project.outputFormat || "script";
  const isVisual = needsVisualPipeline(outputFormat);
  const isNovel = isNovelMode(outputFormat);

  ctx.publishText("\n🚀 开始自动执行全流程\n");

  // Phase 1: Analysis (0-15%)
  if (!project.analysisData) {
    ctx.publishText("\n📊 阶段1: 分析原文...\n");
    await updateProjectStatus(agentProjectId, "analyzing", "analyze");
    const { analysisData: autoAnalysis } = await runAnalysisPhase(agentProjectId, project.sourceText, llm, ctx, [0, 15]);
    const autoAnalysisObj = autoAnalysis as { characters?: Array<{ name: string }>; themes?: string[] } | undefined;
    if (autoAnalysisObj?.characters) {
      ctx.publishText(`👥 角色: ${autoAnalysisObj.characters.map((c) => c.name).join(", ")}\n`);
    }
    if (autoAnalysisObj?.themes) {
      ctx.publishText(`🎭 主题: ${autoAnalysisObj.themes.slice(0, 3).join(", ")}\n`);
    }
  } else {
    ctx.publishText("\n📊 阶段1: 分析 — 已完成，跳过\n");
  }
  await ctx.reportProgress(15);

  // Phase 2: Planning (15-28%)
  const freshProject = await getAgentProject(agentProjectId);
  if (!freshProject.planningData) {
    ctx.publishText("\n📋 阶段2: 规划集数...\n");
    await updateProjectStatus(agentProjectId, "planning", "plan");
    const { planningData: autoPlan } = await runPlanningPhase(agentProjectId, freshProject, llm, ctx, [15, 28]);
    ctx.publishText(`📺 共 ${autoPlan.totalEpisodes} 集\n`);
    if (autoPlan.episodes) {
      autoPlan.episodes.forEach((ep: Record<string, unknown>, i: number) => {
        ctx.publishText(`   ${i + 1}. ${(ep.title as string) ?? `第${i + 1}集`}\n`);
      });
    }
  } else {
    ctx.publishText("\n📋 阶段2: 规划 — 已完成，跳过\n");
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

    ctx.publishText(`\n📝 第${epNum}集: ${freshEp.title ?? "无标题"}\n`);

    // Write — skip if already has script
    let script = freshEp.script ?? "";
    if (!script) {
      ctx.publishText(`   ✍️ 写作中...\n`);
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
        rewriteIntensity: finalProject.rewriteIntensity,
      }, llm, ctx, [baseProgress, baseProgress + perEpisodeProgress * (isNovel ? 0.7 : 0.3)]);
      script = writeResult.script;
      ctx.publishText(`   ✅ 写作完成 (${script.length}字)\n`);
    } else {
      ctx.publishText(`   ✍️ 写作 — 已完成，跳过\n`);
    }

    // Review — skip if already reviewed
    if (!freshEp.reviewScore) {
      const PASS_THRESHOLD_AUTO = 49;
      const MAX_SCRIPT_FIX_ROUNDS = 2;
      let passedAuto = false;
      let latestReviewResult: { totalScore: number; issues?: Array<{ description?: string }> } | null = null;

      // Initial review
      // Use sliced source text for review
      const reviewSourceText = (freshEp.sourceStart != null && freshEp.sourceEnd != null)
        ? finalProject.sourceText.slice(freshEp.sourceStart, freshEp.sourceEnd)
        : finalProject.sourceText;
      ctx.publishText(`   🔍 审核中...\n`);
      await updateProjectStatus(agentProjectId, "reviewing", `review-ep${epNum}`);
      const reviewCtx = await runPipeline(reviewPipeline, {
        ...llm, taskCtx: ctx,
        initialData: {
          episodeNumber: epNum,
          script,
          sourceText: reviewSourceText,
          outputFormat,
          contentType: (styleFingerprint as { contentType?: string } | null)?.contentType,
        },
        progressRange: [baseProgress + perEpisodeProgress * (isNovel ? 0.7 : 0.3), baseProgress + perEpisodeProgress * (isNovel ? 0.9 : 0.5)],
      });
      latestReviewResult = reviewCtx.results["review"] as { totalScore: number; issues?: Array<{ description?: string }> };
      passedAuto = latestReviewResult.totalScore >= PASS_THRESHOLD_AUTO;
      ctx.publishText(`   ${passedAuto ? "✅" : "❌"} 审核: ${latestReviewResult.totalScore}分 — ${passedAuto ? "通过" : "未通过"}\n`);

      // Script mode auto-fix loop: rewrite incorporating review feedback (max 2 rounds)
      if (!passedAuto && !isNovel && isVisual) {
        for (let fixRound = 1; fixRound <= MAX_SCRIPT_FIX_ROUNDS && !passedAuto; fixRound++) {
          // Summarize review issues as feedback
          const issuesSummary = (latestReviewResult?.issues ?? [])
            .map((iss) => (typeof iss === "string" ? iss : iss.description ?? ""))
            .filter(Boolean)
            .join("; ");
          const feedbackText = `审核未通过(${latestReviewResult?.totalScore}分)，请根据以下问题修改: ${issuesSummary}`;

          ctx.publishText(`   🔧 自动修改第${fixRound}轮...\n`);
          await updateProjectStatus(agentProjectId, "writing", `fix-ep${epNum}-r${fixRound}`);
          const fixResult = await runEpisodeWritePhase({
            agentProjectId,
            episode: freshEp,
            sourceText: finalProject.sourceText,
            outputFormat,
            analysis,
            styleFingerprint,
            rewriteStrategy,
            chapterSummaries,
            userFeedback: feedbackText,
            rewriteIntensity: finalProject.rewriteIntensity,
          }, llm, ctx, [baseProgress + perEpisodeProgress * 0.5, baseProgress + perEpisodeProgress * 0.6]);
          script = fixResult.script;
          ctx.publishText(`   ✅ 修改完成 (${script.length}字)\n`);

          // Re-review
          ctx.publishText(`   🔍 重新审核...\n`);
          await updateProjectStatus(agentProjectId, "reviewing", `review-ep${epNum}-r${fixRound}`);
          const reReviewCtx = await runPipeline(reviewPipeline, {
            ...llm, taskCtx: ctx,
            initialData: {
              episodeNumber: epNum,
              script,
              sourceText: reviewSourceText,
              outputFormat,
              contentType: (styleFingerprint as { contentType?: string } | null)?.contentType,
            },
            progressRange: [baseProgress + perEpisodeProgress * 0.6, baseProgress + perEpisodeProgress * 0.7],
          });
          latestReviewResult = reReviewCtx.results["review"] as { totalScore: number; issues?: Array<{ description?: string }> };
          passedAuto = latestReviewResult.totalScore >= PASS_THRESHOLD_AUTO;
          ctx.publishText(`   ${passedAuto ? "✅" : "⚠️"} 重审: ${latestReviewResult.totalScore}分 — ${passedAuto ? "通过" : `未通过(第${fixRound}轮)`}\n`);
        }
      }

      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: {
          reviewData: latestReviewResult as object,
          reviewScore: latestReviewResult!.totalScore,
          ...(!isVisual ? { status: "completed" } : {}),
        },
      });

      // Post-processing checks for novel mode
      if (isNovel && script) {
        const epSourceText = (freshEp.sourceStart != null && freshEp.sourceEnd != null)
          ? finalProject.sourceText.slice(freshEp.sourceStart, freshEp.sourceEnd)
          : finalProject.sourceText;
        const nameMapping = (rewriteStrategy as unknown as { nameMapping?: NameMapping })?.nameMapping;

        // Force-replace original names (deterministic, no LLM needed)
        let correctedScript = script;
        if (nameMapping) {
          const replaceResult = forceReplaceNames(correctedScript, nameMapping);
          if (replaceResult.replacementCount > 0) {
            correctedScript = replaceResult.text;
            ctx.publishText(`   🔄 强制替换了 ${replaceResult.replacementCount} 处原名残留\n`);
            await prisma.agentEpisode.update({
              where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
              data: { script: correctedScript },
            });
          }
        }

        const postResult = await runPostProcessChecks(epSourceText, correctedScript, nameMapping, ctx);

        // Save post-processing results
        const existingReflection = (await prisma.agentEpisode.findUnique({
          where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
          select: { reflectionData: true },
        }))?.reflectionData as Record<string, unknown> | null;

        const updatedReflection = {
          ...(existingReflection ?? {}),
          postProcess: postResult,
        };

        let episodeStatus = "completed";
        if (!postResult.similarityPassed) {
          episodeStatus = "similarity-failed";
          ctx.publishText(`   ⚠️ 第${epNum}集雷同度未通过 (${(postResult.similarityScore * 100).toFixed(1)}%)，标记为需人工处理\n`);
        }

        await prisma.agentEpisode.update({
          where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
          data: {
            reflectionData: updatedReflection as object,
            similarityScore: postResult.similarityScore,
            ...(!isVisual ? { status: episodeStatus } : {}),
          },
        });
      }

      if (!isVisual) continue;
    }

    if (!isVisual) continue;

    // Storyboard
    let storyboardData: unknown = null;
    if (!freshEp.storyboard) {
      ctx.publishText(`   🎬 分镜中...\n`);
      await updateProjectStatus(agentProjectId, "storyboarding", `storyboard-ep${epNum}`);
      const sbCtx = await runPipeline(storyboardPipeline, {
        ...llm, taskCtx: ctx,
        initialData: { episodeNumber: epNum, script, characters: analysis?.characters ?? [], outputFormat },
        progressRange: [baseProgress + perEpisodeProgress * 0.5, baseProgress + perEpisodeProgress * 0.75],
      });
      const detailData = sbCtx.results["storyboard-detail"] as { panels?: Array<Record<string, unknown>> } | null;
      storyboardData = mergeVideoPrompts(sbCtx.results["storyboard"], detailData);
      const sbPanelCount = Array.isArray(storyboardData) ? storyboardData.length : "?";
      ctx.publishText(`   ✅ 分镜完成: ${sbPanelCount}个镜头\n`);
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { storyboard: JSON.stringify({ storyboard: storyboardData, visualNarrative: sbCtx.results["visual-narrative"] }) },
      });
    } else {
      ctx.publishText(`   🎬 分镜 — 已完成，跳过\n`);
      const parsed = JSON.parse(freshEp.storyboard);
      storyboardData = parsed.storyboard ?? parsed;
    }

    // Image prompts
    if (!freshEp.imagePrompts) {
      ctx.publishText(`   🖼️ 生成图片提示词...\n`);
      await updateProjectStatus(agentProjectId, "imaging", `images-ep${epNum}`);
      const characterCards = (analysis?.characters ?? []).map((c) => ({ name: c.name, promptDescription: c.appearance }));
      const imgCtx = await runPipeline(imagePromptsPipeline, {
        ...llm, taskCtx: ctx,
        initialData: { episodeNumber: epNum, storyboard: storyboardData, characterCards, outputFormat },
        progressRange: [baseProgress + perEpisodeProgress * 0.75, baseProgress + perEpisodeProgress],
      });
      ctx.publishText(`   ✅ 图片提示词完成\n`);
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { imagePrompts: JSON.stringify(imgCtx.results["image-prompts"]), status: "completed" },
      });
    } else {
      ctx.publishText(`   🖼️ 图片提示词 — 已完成，跳过\n`);
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: { status: "completed" },
      });
    }
  }

  ctx.publishText(`\n🎉 全部完成! 共 ${episodes.length} 集\n`);

  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { status: "completed", currentStep: null },
  });

  return { completed: episodes.map((e) => e.episodeNumber) };
});
