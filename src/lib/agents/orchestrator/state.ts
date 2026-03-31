/**
 * Serialize AgentProject + AgentEpisodes from DB into OrchestratorState.
 * This is the "world model" the orchestrator LLM reads each iteration.
 * Estimated ~200-500 tokens for a 10-episode project.
 */

import { prisma } from "@/lib/prisma";
import type { OrchestratorState } from "./types";

export async function serializeProjectState(
  agentProjectId: string,
): Promise<OrchestratorState> {
  const project = await prisma.agentProject.findUniqueOrThrow({
    where: { id: agentProjectId },
    include: {
      episodes: {
        orderBy: { episodeNumber: "asc" },
        select: {
          episodeNumber: true,
          status: true,
          script: true,
          reviewScore: true,
          similarityScore: true,
          storyboard: true,
          imagePrompts: true,
          rewriteAttempt: true,
        },
      },
    },
  });

  const episodes = project.episodes.map((ep) => ({
    number: ep.episodeNumber,
    status: ep.status,
    hasScript: !!ep.script,
    reviewScore: ep.reviewScore ?? undefined,
    similarityScore: ep.similarityScore ?? undefined,
    hasStoryboard: !!ep.storyboard,
    hasImagePrompts: !!ep.imagePrompts,
    rewriteAttempt: ep.rewriteAttempt,
  }));

  const completedCount = episodes.filter((e) => e.status === "completed").length;
  const failedCount = episodes.filter((e) =>
    e.status === "review-failed" || e.status === "similarity-failed",
  ).length;

  return {
    projectId: agentProjectId,
    outputFormat: (project.outputFormat as OrchestratorState["outputFormat"]) || "script",
    rewriteIntensity: project.rewriteIntensity,
    phases: {
      analysis: {
        done: !!project.analysisData,
        characterCount: project.analysisData
          ? ((project.analysisData as { characters?: unknown[] }).characters?.length ?? 0)
          : undefined,
      },
      planning: {
        done: !!project.planningData,
        episodeCount: project.episodes.length || undefined,
      },
      strategy: {
        done: !!project.rewriteStrategy,
        confirmed: project.strategyConfirmed,
      },
    },
    episodes,
    summary: {
      completedCount,
      failedCount,
      pendingCount: episodes.length - completedCount - failedCount,
    },
  };
}
