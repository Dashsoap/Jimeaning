/**
 * Pipeline: analysis — runs novel-analyzer + style-analyzer agents.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { novelAnalyzerAgent, styleAnalyzerAgent } from "../definitions";

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
    defineStep({
      id: "style-analyze",
      agent: styleAnalyzerAgent,
      prepareInput: (ctx: PipelineContext) => ({
        sourceTextSample: ctx.initialData.sourceText as string,
      }),
    }),
  ],
};
