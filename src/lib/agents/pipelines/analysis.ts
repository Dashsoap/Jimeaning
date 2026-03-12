/**
 * Pipeline: analysis — runs novel-analyzer agent.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { novelAnalyzerAgent } from "../definitions";

export const analysisPipeline: PipelineDef = {
  name: "analysis",
  steps: [
    defineStep({
      id: "analyze",
      agent: novelAnalyzerAgent,
      prepareInput: (ctx: PipelineContext) => ({
        sourceText: ctx.initialData.sourceText as string,
        segmentIndex: ctx.initialData.segmentIndex as number | undefined,
        totalSegments: ctx.initialData.totalSegments as number | undefined,
      }),
    }),
  ],
};
