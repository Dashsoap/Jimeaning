/**
 * Pipeline: planning — runs episode-architect agent.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { episodeArchitectAgent } from "../definitions";
import type { AnalysisResult } from "../definitions";

export const planningPipeline: PipelineDef = {
  name: "planning",
  steps: [
    defineStep({
      id: "plan",
      agent: episodeArchitectAgent,
      prepareInput: (ctx: PipelineContext) => ({
        analysisReport: ctx.initialData.analysisReport as AnalysisResult,
        sourceText: ctx.initialData.sourceText as string,
        durationPerEp: ctx.initialData.durationPerEp as string | undefined,
      }),
    }),
  ],
};
