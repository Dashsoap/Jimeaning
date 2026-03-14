/**
 * Pipeline: strategy — runs rewrite-strategist agent to design overall rewrite strategy.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { rewriteStrategistAgent } from "../definitions";
import type { StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";

export const strategyPipeline: PipelineDef = {
  name: "strategy",
  steps: [
    defineStep({
      id: "strategy",
      agent: rewriteStrategistAgent,
      prepareInput: (ctx: PipelineContext) => ({
        episodeOutlines: ctx.initialData.episodeOutlines as Array<{
          episodeNumber: number;
          title: string;
          outline: string;
        }>,
        styleFingerprint: ctx.initialData.styleFingerprint as StyleFingerprint,
        characters: ctx.initialData.characters as Array<{
          name: string;
          personality: string[];
          appearance: string;
        }>,
        sourceTextSample: ctx.initialData.sourceTextSample as string,
        totalEpisodes: ctx.initialData.totalEpisodes as number,
      }),
    }),
  ],
};
