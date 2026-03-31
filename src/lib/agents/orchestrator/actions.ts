/**
 * Action Registry: wraps existing phase functions as orchestrator actions.
 * Each action directly delegates to the exported functions in agent-workflow.ts.
 */

import { prisma } from "@/lib/prisma";
import { runPipeline } from "@/lib/agents/runner";
import {
  reviewPipeline,
  storyboardPipeline,
  imagePromptsPipeline,
} from "@/lib/agents/pipelines";
import {
  getAgentProject,
  runAnalysisPhase,
  runPlanningPhase,
  runStrategyPhase,
  runEpisodeWritePhase,
  runPostProcessChecks,
  updateProjectStatus,
  deriveAndUpdateProjectStatus,
  needsVisualPipeline,
  mergeVideoPrompts,
} from "@/lib/workers/handlers/agent-workflow";
import { forceReplaceNames } from "@/lib/text/name-check";
import type { StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";
import type { RewriteStrategy, NameMapping } from "@/lib/agents/definitions/rewrite-strategist";
import type { ActionDef } from "./types";

// ─── Helper: get a fresh episode from DB ────────────────────────────

async function getEpisode(agentProjectId: string, episodeNumber: number) {
  return prisma.agentEpisode.findUniqueOrThrow({
    where: { agentProjectId_episodeNumber: { agentProjectId, episodeNumber } },
  });
}

// ─── Action Definitions ─────────────────────────────────────────────

const runAnalysisAction: ActionDef = {
  name: "run_analysis",
  description: "分析原文，提取人物、主题、情节骨架、风格指纹",
  parameters: { type: "object", properties: {}, required: [] },
  preconditions: "尚未完成分析（phases.analysis.done === false）",
  async execute(_params, ctx) {
    const project = await getAgentProject(ctx.agentProjectId);
    if (project.analysisData) {
      return { success: true, summary: "分析已完成，跳过" };
    }
    await updateProjectStatus(ctx.agentProjectId, "analyzing", "analyze");
    ctx.taskCtx.publishText("\n📊 开始分析原文...\n");
    const result = await runAnalysisPhase(
      ctx.agentProjectId, project.sourceText, ctx.llm, ctx.taskCtx, [0, 100],
    );
    const chars = (result.analysisData as { characters?: { name: string }[] })?.characters;
    return {
      success: true,
      summary: `分析完成: ${chars?.length ?? 0}个角色`,
    };
  },
};

const runPlanningAction: ActionDef = {
  name: "run_planning",
  description: "根据分析结果规划分集大纲",
  parameters: { type: "object", properties: {}, required: [] },
  preconditions: "分析已完成，尚未规划（phases.analysis.done && !phases.planning.done）",
  async execute(_params, ctx) {
    const project = await getAgentProject(ctx.agentProjectId);
    if (project.planningData) {
      return { success: true, summary: "规划已完成，跳过" };
    }
    if (!project.analysisData) {
      return { success: false, summary: "前置条件不满足: 未完成分析" };
    }
    await updateProjectStatus(ctx.agentProjectId, "planning", "plan");
    ctx.taskCtx.publishText("\n📋 开始规划集数...\n");
    const { planningData } = await runPlanningPhase(
      ctx.agentProjectId, project, ctx.llm, ctx.taskCtx, [0, 100],
    );
    return {
      success: true,
      summary: `规划完成: ${planningData.totalEpisodes}集`,
    };
  },
};

const runStrategyAction: ActionDef = {
  name: "run_strategy",
  description: "设计全局改写策略（仅小说模式）。完成后需暂停等待用户确认",
  parameters: { type: "object", properties: {}, required: [] },
  preconditions: "小说模式，分析和规划已完成，尚未设计策略",
  async execute(_params, ctx) {
    const project = await getAgentProject(ctx.agentProjectId);
    if (project.rewriteStrategy) {
      if (!project.strategyConfirmed) {
        return {
          success: true,
          summary: "策略已设计但未确认",
          shouldPause: true,
          pauseReason: "strategy-designed",
        };
      }
      return { success: true, summary: "策略已确认，跳过" };
    }
    await updateProjectStatus(ctx.agentProjectId, "planning", "strategy");
    ctx.taskCtx.publishText("\n📐 设计改写策略...\n");
    const { strategy } = await runStrategyPhase(
      ctx.agentProjectId, project, ctx.llm, ctx.taskCtx, [0, 100],
    );
    await updateProjectStatus(ctx.agentProjectId, "strategy-designed", "paused-strategy");
    ctx.taskCtx.publishText(`\n✅ 策略设计完成\n📄 ${strategy.humanReadableSummary?.slice(0, 200)}...\n`);
    ctx.taskCtx.publishText("\n⏸️ 请审阅改写策略后，点击「确认并执行」继续\n");
    return {
      success: true,
      summary: "策略设计完成，等待用户确认",
      shouldPause: true,
      pauseReason: "strategy-designed",
    };
  },
};

const writeEpisodeAction: ActionDef = {
  name: "write_episode",
  description: "写作/改写指定集数的剧本或小说",
  parameters: {
    type: "object",
    properties: {
      episodeNumber: { type: "number", description: "集数编号" },
      userFeedback: { type: "string", description: "用户反馈（可选，用于重写）" },
    },
    required: ["episodeNumber"],
  },
  preconditions: "规划已完成，该集尚未有剧本或需要重写",
  async execute(params, ctx) {
    const episodeNumber = params.episodeNumber as number;
    const userFeedback = params.userFeedback as string | undefined;
    const project = await getAgentProject(ctx.agentProjectId);
    const episode = await getEpisode(ctx.agentProjectId, episodeNumber);

    if (episode.script && !userFeedback) {
      return { success: true, summary: `第${episodeNumber}集已有剧本，跳过` };
    }

    await updateProjectStatus(ctx.agentProjectId, "writing", `write-ep${episodeNumber}`);
    ctx.taskCtx.publishText(`\n📝 第${episodeNumber}集写作中...\n`);

    const result = await runEpisodeWritePhase({
      agentProjectId: ctx.agentProjectId,
      episode,
      sourceText: project.sourceText,
      outputFormat: project.outputFormat || "script",
      analysis: project.analysisData as { characters?: Array<{ name: string; personality: string[]; appearance: string }> } | null,
      styleFingerprint: project.styleData as unknown as StyleFingerprint | null,
      rewriteStrategy: project.rewriteStrategy as unknown as RewriteStrategy | null,
      chapterSummaries: project.chapterSummaries as Record<string, { summary: string; tail: string }> | null,
      userFeedback,
      rewriteIntensity: project.rewriteIntensity,
    }, ctx.llm, ctx.taskCtx, [0, 100]);

    return {
      success: true,
      summary: `第${episodeNumber}集写作完成 (${result.script.length}字)${result.reflectResult ? ` 反思${result.reflectResult.totalScore}分` : ""}`,
    };
  },
};

const reviewEpisodeAction: ActionDef = {
  name: "review_episode",
  description: "审核指定集数的剧本质量",
  parameters: {
    type: "object",
    properties: {
      episodeNumber: { type: "number", description: "集数编号" },
    },
    required: ["episodeNumber"],
  },
  preconditions: "该集已有剧本，尚未审核",
  async execute(params, ctx) {
    const episodeNumber = params.episodeNumber as number;
    const project = await getAgentProject(ctx.agentProjectId);
    const episode = await getEpisode(ctx.agentProjectId, episodeNumber);

    if (!episode.script) {
      return { success: false, summary: `第${episodeNumber}集尚无剧本` };
    }
    if (episode.reviewScore) {
      return { success: true, summary: `第${episodeNumber}集已审核 (${episode.reviewScore}分)` };
    }

    const outputFormat = project.outputFormat || "script";
    const styleData = project.styleData as { contentType?: string } | null;
    const reviewSourceText = (episode.sourceStart != null && episode.sourceEnd != null)
      ? project.sourceText.slice(episode.sourceStart, episode.sourceEnd)
      : project.sourceText;

    await updateProjectStatus(ctx.agentProjectId, "reviewing", `review-ep${episodeNumber}`);
    ctx.taskCtx.publishText(`\n🔍 审核第${episodeNumber}集...\n`);

    const pipelineCtx = await runPipeline(reviewPipeline, {
      ...ctx.llm, taskCtx: ctx.taskCtx,
      initialData: {
        episodeNumber,
        script: episode.script,
        sourceText: reviewSourceText,
        outputFormat,
        contentType: styleData?.contentType,
      },
      progressRange: [0, 100],
    });

    const reviewResult = pipelineCtx.results["review"] as { totalScore: number; passed: boolean };
    const PASS_THRESHOLD = 49;
    const passed = reviewResult.totalScore >= PASS_THRESHOLD;
    const isVisual = needsVisualPipeline(outputFormat);
    const newStatus = passed ? (isVisual ? "reviewed" : "completed") : "review-failed";

    await prisma.agentEpisode.update({
      where: { agentProjectId_episodeNumber: { agentProjectId: ctx.agentProjectId, episodeNumber } },
      data: {
        reviewData: pipelineCtx.results["review"] as object,
        reviewScore: reviewResult.totalScore,
        status: newStatus,
      },
    });

    return {
      success: true,
      summary: `第${episodeNumber}集审核: ${reviewResult.totalScore}分 — ${passed ? "通过" : "未通过"}`,
    };
  },
};

const storyboardEpisodeAction: ActionDef = {
  name: "storyboard_episode",
  description: "为指定集数生成分镜脚本（仅剧本模式）",
  parameters: {
    type: "object",
    properties: {
      episodeNumber: { type: "number", description: "集数编号" },
    },
    required: ["episodeNumber"],
  },
  preconditions: "剧本模式，该集已审核通过，尚未分镜",
  async execute(params, ctx) {
    const episodeNumber = params.episodeNumber as number;
    const project = await getAgentProject(ctx.agentProjectId);
    const episode = await getEpisode(ctx.agentProjectId, episodeNumber);

    if (!episode.script) {
      return { success: false, summary: `第${episodeNumber}集尚无剧本` };
    }
    if (episode.storyboard) {
      return { success: true, summary: `第${episodeNumber}集已有分镜，跳过` };
    }

    const analysis = project.analysisData as { characters?: Array<{ name: string; appearance: string }> } | null;
    await updateProjectStatus(ctx.agentProjectId, "storyboarding", `storyboard-ep${episodeNumber}`);
    ctx.taskCtx.publishText(`\n🎬 分镜第${episodeNumber}集...\n`);

    const pipelineCtx = await runPipeline(storyboardPipeline, {
      ...ctx.llm, taskCtx: ctx.taskCtx,
      initialData: {
        episodeNumber,
        script: episode.script,
        characters: analysis?.characters ?? [],
        outputFormat: project.outputFormat || "script",
      },
      progressRange: [0, 100],
    });

    const storyboardData = pipelineCtx.results["storyboard"];
    const visualData = pipelineCtx.results["visual-narrative"];
    const detailData = pipelineCtx.results["storyboard-detail"] as { panels?: Array<Record<string, unknown>> } | null;

    const mergedStoryboard = mergeVideoPrompts(storyboardData, detailData);

    await prisma.agentEpisode.update({
      where: { agentProjectId_episodeNumber: { agentProjectId: ctx.agentProjectId, episodeNumber } },
      data: {
        storyboard: JSON.stringify({ storyboard: mergedStoryboard, visualNarrative: visualData }),
        status: "storyboarded",
      },
    });

    return { success: true, summary: `第${episodeNumber}集分镜完成` };
  },
};

const generateImagePromptsAction: ActionDef = {
  name: "generate_image_prompts",
  description: "为指定集数生成图片提示词（仅剧本模式）",
  parameters: {
    type: "object",
    properties: {
      episodeNumber: { type: "number", description: "集数编号" },
    },
    required: ["episodeNumber"],
  },
  preconditions: "剧本模式，该集已分镜，尚未生成图片提示词",
  async execute(params, ctx) {
    const episodeNumber = params.episodeNumber as number;
    const project = await getAgentProject(ctx.agentProjectId);
    const episode = await getEpisode(ctx.agentProjectId, episodeNumber);

    if (!episode.storyboard) {
      return { success: false, summary: `第${episodeNumber}集尚无分镜` };
    }
    if (episode.imagePrompts) {
      return { success: true, summary: `第${episodeNumber}集已有图片提示词，跳过` };
    }

    const storyboardParsed = JSON.parse(episode.storyboard);
    const analysis = project.analysisData as { characters?: Array<{ name: string; appearance: string }> } | null;
    const characterCards = (analysis?.characters ?? []).map((c) => ({ name: c.name, promptDescription: c.appearance }));

    await updateProjectStatus(ctx.agentProjectId, "imaging", `images-ep${episodeNumber}`);
    ctx.taskCtx.publishText(`\n🖼️ 生成图片提示词 第${episodeNumber}集...\n`);

    const pipelineCtx = await runPipeline(imagePromptsPipeline, {
      ...ctx.llm, taskCtx: ctx.taskCtx,
      initialData: {
        episodeNumber,
        storyboard: storyboardParsed.storyboard,
        characterCards,
        outputFormat: project.outputFormat || "script",
      },
      progressRange: [0, 100],
    });

    await prisma.agentEpisode.update({
      where: { agentProjectId_episodeNumber: { agentProjectId: ctx.agentProjectId, episodeNumber } },
      data: {
        imagePrompts: JSON.stringify(pipelineCtx.results["image-prompts"]),
        status: "completed",
      },
    });

    return { success: true, summary: `第${episodeNumber}集图片提示词完成` };
  },
};

const runPostProcessAction: ActionDef = {
  name: "run_post_process",
  description: "对改写后的集数执行后处理检查（雷同度、原名残留、字数保真）",
  parameters: {
    type: "object",
    properties: {
      episodeNumber: { type: "number", description: "集数编号" },
    },
    required: ["episodeNumber"],
  },
  preconditions: "小说模式，该集已有剧本",
  async execute(params, ctx) {
    const episodeNumber = params.episodeNumber as number;
    const project = await getAgentProject(ctx.agentProjectId);
    const episode = await getEpisode(ctx.agentProjectId, episodeNumber);

    if (!episode.script) {
      return { success: false, summary: `第${episodeNumber}集尚无剧本` };
    }

    const epSourceText = (episode.sourceStart != null && episode.sourceEnd != null)
      ? project.sourceText.slice(episode.sourceStart, episode.sourceEnd)
      : project.sourceText;

    const rewriteStrategy = project.rewriteStrategy as unknown as RewriteStrategy | null;
    const nameMapping = (rewriteStrategy as unknown as { nameMapping?: NameMapping })?.nameMapping;

    // Force-replace original names
    let finalScript = episode.script;
    if (nameMapping) {
      const replaceResult = forceReplaceNames(finalScript, nameMapping);
      if (replaceResult.replacementCount > 0) {
        finalScript = replaceResult.text;
        ctx.taskCtx.publishText(`🔄 强制替换了 ${replaceResult.replacementCount} 处原名残留\n`);
        await prisma.agentEpisode.update({
          where: { agentProjectId_episodeNumber: { agentProjectId: ctx.agentProjectId, episodeNumber } },
          data: { script: finalScript },
        });
      }
    }

    const postResult = await runPostProcessChecks(epSourceText, finalScript, nameMapping, ctx.taskCtx);

    const existingReflection = episode.reflectionData as Record<string, unknown> | null;
    const updatedReflection = { ...(existingReflection ?? {}), postProcess: postResult };

    let episodeStatus = "completed";
    if (!postResult.similarityPassed) {
      episodeStatus = "similarity-failed";
    }

    await prisma.agentEpisode.update({
      where: { agentProjectId_episodeNumber: { agentProjectId: ctx.agentProjectId, episodeNumber } },
      data: {
        reflectionData: updatedReflection as object,
        similarityScore: postResult.similarityScore,
        status: episodeStatus,
      },
    });

    return {
      success: true,
      summary: `后处理完成: 雷同度${(postResult.similarityScore * 100).toFixed(1)}% ${postResult.similarityPassed ? "✅" : "⚠️"}`,
    };
  },
};

const markEpisodeCompleteAction: ActionDef = {
  name: "mark_episode_complete",
  description: "将指定集数标记为已完成",
  parameters: {
    type: "object",
    properties: {
      episodeNumber: { type: "number", description: "集数编号" },
    },
    required: ["episodeNumber"],
  },
  preconditions: "该集所有必要步骤已完成",
  async execute(params, ctx) {
    const episodeNumber = params.episodeNumber as number;
    await prisma.agentEpisode.update({
      where: { agentProjectId_episodeNumber: { agentProjectId: ctx.agentProjectId, episodeNumber } },
      data: { status: "completed" },
    });
    return { success: true, summary: `第${episodeNumber}集标记完成` };
  },
};

const finishAction: ActionDef = {
  name: "finish",
  description: "所有集数完成后调用，更新项目最终状态",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string", description: "完成总结" },
    },
    required: [],
  },
  preconditions: "所有集数已完成",
  async execute(params, ctx) {
    const summary = (params.summary as string) || "全部完成";
    await deriveAndUpdateProjectStatus(ctx.agentProjectId);
    ctx.taskCtx.publishText(`\n🎉 ${summary}\n`);
    return { success: true, summary };
  },
};

// ─── Registry ───────────────────────────────────────────────────────

export const ACTION_REGISTRY: ActionDef[] = [
  runAnalysisAction,
  runPlanningAction,
  runStrategyAction,
  writeEpisodeAction,
  reviewEpisodeAction,
  storyboardEpisodeAction,
  generateImagePromptsAction,
  runPostProcessAction,
  markEpisodeCompleteAction,
  finishAction,
];

export function getAction(name: string): ActionDef | undefined {
  return ACTION_REGISTRY.find((a) => a.name === name);
}

/** Convert action registry to OpenAI tool definitions */
export function actionsToTools() {
  return ACTION_REGISTRY.map((action) => ({
    type: "function" as const,
    function: {
      name: action.name,
      description: `${action.description}\n前提: ${action.preconditions}`,
      parameters: action.parameters,
    },
  }));
}
