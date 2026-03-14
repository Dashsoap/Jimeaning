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
  strategyPipeline,
  novelRewritePipeline,
} from "@/lib/agents/pipelines";
import {
  STYLE_ANALYSIS_SYSTEM,
  STYLE_ANALYSIS_USER,
  CHAPTER_SUMMARY_SYSTEM,
  CHAPTER_SUMMARY_USER,
} from "@/lib/llm/prompts/rewrite-script";
import type { StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";
import type { TaskPayload } from "@/lib/task/types";
import type { RewriteStrategy } from "@/lib/agents/definitions/rewrite-strategist";
import type { ReflectOutput } from "@/lib/agents/definitions/reflect";
import { chatCompletion } from "@/lib/llm/client";

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

// ─── AGENT_REWRITE_STRATEGY ──────────────────────────────────────

export const handleAgentRewriteStrategy = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const agentProjectId = data.agentProjectId as string;

  await updateProjectStatus(agentProjectId, "planning", "strategy");

  const project = await getAgentProject(agentProjectId);
  if (!project.analysisData) throw new Error("Analysis must be completed before strategy design");
  if (!project.planningData) throw new Error("Planning must be completed before strategy design");
  if (!project.styleData) throw new Error("Style analysis must be completed before strategy design");

  const analysis = project.analysisData as {
    characters?: Array<{ name: string; personality: string[]; appearance: string }>;
  };
  const styleFingerprint = project.styleData as unknown as StyleFingerprint;

  const episodeOutlines = project.episodes.map((ep) => ({
    episodeNumber: ep.episodeNumber,
    title: ep.title ?? `第${ep.episodeNumber}集`,
    outline: ep.outline ?? "",
  }));

  const { client, model } = await setupLLM(userId);

  const pipelineCtx = await runPipeline(strategyPipeline, {
    client,
    model,
    taskCtx: ctx,
    initialData: {
      episodeOutlines,
      styleFingerprint,
      characters: analysis.characters ?? [],
      sourceTextSample: project.sourceText.slice(0, 8000),
      totalEpisodes: project.episodes.length,
    },
    progressRange: [5, 85],
  });

  const strategy = pipelineCtx.results["strategy"] as RewriteStrategy;

  // Save chapter notes to each episode
  if (strategy.chapterPlans) {
    for (const plan of strategy.chapterPlans) {
      const ep = project.episodes.find((e) => e.episodeNumber === plan.episodeNumber);
      if (ep) {
        await prisma.agentEpisode.update({
          where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: plan.episodeNumber } },
          data: {
            chapterNotes: [
              ...plan.focusPoints.map((f) => `重点: ${f}`),
              plan.keySceneTreatment ? `关键场景: ${plan.keySceneTreatment}` : "",
              plan.emotionalArc ? `情绪弧线: ${plan.emotionalArc}` : "",
            ].filter(Boolean).join("\n"),
          },
        });
      }
    }
  }

  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: {
      rewriteStrategy: strategy as object,
      status: "strategy-designed",
      currentStep: null,
    },
  });

  return { strategy };
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
  const styleFingerprint = project.styleData as unknown as StyleFingerprint | null;
  const rewriteStrategy = project.rewriteStrategy as unknown as RewriteStrategy | null;
  const chapterSummaries = project.chapterSummaries as Record<string, { summary: string; tail: string }> | null;
  const useNovelMode = isNovelMode(outputFormat) && !!rewriteStrategy;

  const episode = project.episodes.find((e) => e.episodeNumber === episodeNumber);
  if (!episode) throw new Error(`Episode ${episodeNumber} not found`);

  // Get previous episode ending for continuity (fresh DB query, not stale cache)
  const prevEp = episodeNumber > 1
    ? await prisma.agentEpisode.findUnique({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: episodeNumber - 1 } },
        select: { script: true },
      })
    : null;
  const prevEnding = prevEp?.script?.slice(-500);

  const { client, model } = await setupLLM(userId);

  // Choose pipeline based on mode
  const pipeline = useNovelMode ? novelRewritePipeline : writingPipeline;

  const initialData: Record<string, unknown> = {
    episodeNumber,
    episodeTitle: episode.title ?? `第${episodeNumber}集`,
    episodeOutline: episode.outline ?? "",
    sourceText: project.sourceText,
    previousEpisodeEnding: prevEnding,
    characters: analysis?.characters ?? [],
    outputFormat,
    styleFingerprint: styleFingerprint ?? undefined,
  };

  if (useNovelMode) {
    initialData.rewriteStrategy = rewriteStrategy;
    initialData.chapterNotes = episode.chapterNotes ?? undefined;
    initialData.prevChapterSummaries = buildPrevChapterSummaries(chapterSummaries, episodeNumber);
    initialData.transitionInstructions = buildTransitionInstructions(rewriteStrategy, episodeNumber);
    initialData.strategyContext = rewriteStrategy
      ? { globalStyle: rewriteStrategy.globalStyle, characterVoices: rewriteStrategy.characterVoices, chapterNotes: episode.chapterNotes }
      : undefined;
  }

  const pipelineCtx = await runPipeline(pipeline, {
    client, model, taskCtx: ctx,
    initialData,
    progressRange: [5, 80],
  });

  // Get final script (from improve if ran, otherwise from write)
  const improveResult = pipelineCtx.results["improve"] as { script: string } | undefined;
  const writeResult = pipelineCtx.results["write"] as { script: string };
  const finalScript = improveResult?.script ?? writeResult.script;
  const reflectResult = pipelineCtx.results["reflect"] as ReflectOutput | undefined;

  await prisma.agentEpisode.update({
    where: {
      agentProjectId_episodeNumber: { agentProjectId, episodeNumber },
    },
    data: {
      script: finalScript,
      scriptVersion: { increment: 1 },
      status: "drafted",
      rewriteAttempt: { increment: 1 },
      ...(reflectResult ? { reflectionData: reflectResult as object } : {}),
    },
  });

  // Generate and store chapter summary for cross-episode continuity (novel mode)
  if (useNovelMode) {
    try {
      ctx.publishText("\n\n📝 生成章节摘要...\n");
      const summary = await generateChapterSummary(client, model, finalScript);
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber } },
        data: { chapterSummary: summary },
      });
      await updateChapterSummaries(agentProjectId, episodeNumber, summary, finalScript.slice(-500));
      ctx.publishText(`摘要: ${summary.slice(0, 100)}...\n`);
    } catch {
      ctx.publishText("⚠️ 章节摘要生成跳过\n");
    }
  }

  await updateProjectStatus(agentProjectId, project.strategyConfirmed ? "strategy-confirmed" : "planned", undefined);

  return {
    episodeNumber,
    scriptLength: finalScript.length,
    reflectScore: reflectResult?.totalScore,
    improved: !!improveResult,
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
  const isNovel = isNovelMode(outputFormat);

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

  // Phase 2: Planning (15-28%)
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
      progressRange: [15, 28],
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
  await ctx.reportProgress(28);

  // Phase 2.5: Strategy Design (28-38%) — novel mode only, pause for user confirmation
  if (isNovel) {
    const projectForStrategy = await getAgentProject(agentProjectId);
    if (!projectForStrategy.rewriteStrategy) {
      await updateProjectStatus(agentProjectId, "planning", "strategy");
      ctx.publishText("\n\n📐 设计改写策略...\n");

      const analysisForStrategy = projectForStrategy.analysisData as {
        characters?: Array<{ name: string; personality: string[]; appearance: string }>;
      };
      const styleForStrategy = projectForStrategy.styleData as unknown as StyleFingerprint;

      const strategyCtx = await runPipeline(strategyPipeline, {
        client, model, taskCtx: ctx,
        initialData: {
          episodeOutlines: projectForStrategy.episodes.map((ep) => ({
            episodeNumber: ep.episodeNumber,
            title: ep.title ?? `第${ep.episodeNumber}集`,
            outline: ep.outline ?? "",
          })),
          styleFingerprint: styleForStrategy,
          characters: analysisForStrategy?.characters ?? [],
          sourceTextSample: projectForStrategy.sourceText.slice(0, 8000),
          totalEpisodes: projectForStrategy.episodes.length,
        },
        progressRange: [28, 38],
      });

      const strategy = strategyCtx.results["strategy"] as RewriteStrategy;

      // Save chapter notes to episodes
      if (strategy.chapterPlans) {
        for (const plan of strategy.chapterPlans) {
          const ep = projectForStrategy.episodes.find((e) => e.episodeNumber === plan.episodeNumber);
          if (ep) {
            await prisma.agentEpisode.update({
              where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: plan.episodeNumber } },
              data: {
                chapterNotes: [
                  ...plan.focusPoints.map((f) => `重点: ${f}`),
                  plan.keySceneTreatment ? `关键场景: ${plan.keySceneTreatment}` : "",
                  plan.emotionalArc ? `情绪弧线: ${plan.emotionalArc}` : "",
                ].filter(Boolean).join("\n"),
              },
            });
          }
        }
      }

      await prisma.agentProject.update({
        where: { id: agentProjectId },
        data: {
          rewriteStrategy: strategy as object,
          status: "strategy-designed",
          currentStep: null,
        },
      });

      ctx.publishText(`\n✅ 改写策略设计完成\n📄 ${strategy.humanReadableSummary?.slice(0, 200)}...\n`);
      ctx.publishText("\n⏸️ 请审阅改写策略后，点击「确认并执行」继续\n");

      // PAUSE — auto mode stops here for novel. User must confirm strategy then trigger execute.
      return { paused: true, reason: "strategy-designed" };
    }

    // Strategy exists but not confirmed — also pause
    if (!projectForStrategy.strategyConfirmed) {
      ctx.publishText("\n⏸️ 改写策略已设计，等待用户确认...\n");
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
      if (freshEp.script && freshEp.reviewScore) {
        await prisma.agentEpisode.update({
          where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: freshEp.episodeNumber } },
          data: { status: "completed" },
        });
        continue;
      }
    }

    const epNum = freshEp.episodeNumber;
    const baseProgress = 38 + i * perEpisodeProgress;

    // Write — skip if already has script
    let script = freshEp.script ?? "";
    if (!script) {
      await updateProjectStatus(agentProjectId, "writing", `write-ep${epNum}`);
      const prevEp = epNum > 1
        ? await prisma.agentEpisode.findUnique({
            where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum - 1 } },
            select: { script: true },
          })
        : null;

      // Use novel rewrite pipeline if strategy exists
      const useNovelPipeline = isNovel && !!rewriteStrategy;
      const writePipeline = useNovelPipeline ? novelRewritePipeline : writingPipeline;

      const writeInitialData: Record<string, unknown> = {
        episodeNumber: epNum,
        episodeTitle: freshEp.title ?? `第${epNum}集`,
        episodeOutline: freshEp.outline ?? "",
        sourceText: finalProject.sourceText,
        previousEpisodeEnding: prevEp?.script?.slice(-500),
        characters: analysis?.characters ?? [],
        outputFormat,
        styleFingerprint: styleFingerprint ?? undefined,
      };

      if (useNovelPipeline) {
        // Re-fetch latest chapter summaries
        const latestProject = await prisma.agentProject.findUniqueOrThrow({
          where: { id: agentProjectId },
          select: { chapterSummaries: true },
        });
        const latestSummaries = latestProject.chapterSummaries as Record<string, { summary: string; tail: string }> | null;

        writeInitialData.rewriteStrategy = rewriteStrategy;
        writeInitialData.chapterNotes = freshEp.chapterNotes ?? undefined;
        writeInitialData.prevChapterSummaries = buildPrevChapterSummaries(latestSummaries ?? chapterSummaries, epNum);
        writeInitialData.transitionInstructions = buildTransitionInstructions(rewriteStrategy, epNum);
        writeInitialData.strategyContext = {
          globalStyle: rewriteStrategy!.globalStyle,
          characterVoices: rewriteStrategy!.characterVoices,
          chapterNotes: freshEp.chapterNotes,
        };
      }

      const writeCtx = await runPipeline(writePipeline, {
        client, model, taskCtx: ctx,
        initialData: writeInitialData,
        progressRange: [baseProgress, baseProgress + perEpisodeProgress * (isNovel ? 0.7 : 0.3)],
      });

      // Get best script (improve > write)
      const improveRes = writeCtx.results["improve"] as { script: string } | undefined;
      const writeRes = writeCtx.results["write"] as { script: string };
      script = improveRes?.script ?? writeRes.script;
      const reflectRes = writeCtx.results["reflect"] as ReflectOutput | undefined;

      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: {
          script,
          scriptVersion: { increment: 1 },
          status: "drafted",
          rewriteAttempt: { increment: 1 },
          ...(reflectRes ? { reflectionData: reflectRes as object } : {}),
        },
      });

      // Generate chapter summary for novel mode
      if (useNovelPipeline) {
        try {
          const summary = await generateChapterSummary(client, model, script);
          await prisma.agentEpisode.update({
            where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
            data: { chapterSummary: summary },
          });
          await updateChapterSummaries(agentProjectId, epNum, summary, script.slice(-500));
        } catch {
          // Non-critical, continue
        }
      }
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
        progressRange: [baseProgress + perEpisodeProgress * (isNovel ? 0.7 : 0.3), baseProgress + perEpisodeProgress * (isNovel ? 0.9 : 0.5)],
      });
      const reviewResult = reviewCtx.results["review"] as { totalScore: number; passed: boolean };

      const reviewStatus = !isVisual ? "completed" : undefined;
      await prisma.agentEpisode.update({
        where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber: epNum } },
        data: {
          reviewData: reviewCtx.results["review"] as object,
          reviewScore: reviewResult.totalScore,
          ...(reviewStatus ? { status: reviewStatus } : {}),
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

    // Image prompts
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
