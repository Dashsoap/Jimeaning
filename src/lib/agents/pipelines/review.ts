/**
 * Pipeline: review — runs review-director agent.
 * Format-aware: passes outputFormat from initialData.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { reviewDirectorAgent } from "../definitions";
import type { OutputFormat } from "@/lib/llm/prompts/rewrite-script";

export const reviewPipeline: PipelineDef = {
  name: "review",
  steps: [
    defineStep({
      id: "review",
      agent: reviewDirectorAgent,
      prepareInput: (ctx: PipelineContext) => ({
        episodeNumber: ctx.initialData.episodeNumber as number,
        script: ctx.initialData.script as string,
        sourceText: ctx.initialData.sourceText as string,
        analysisCharacters: ctx.initialData.analysisCharacters as string | undefined,
        outputFormat: (ctx.initialData.outputFormat as OutputFormat) || "script",
        contentType: ctx.initialData.contentType as string | undefined,
      }),
    }),
  ],
};
