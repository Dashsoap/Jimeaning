/**
 * Pipeline: writing — runs script-writer agent for a single episode.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { scriptWriterAgent } from "../definitions";

export const writingPipeline: PipelineDef = {
  name: "writing",
  steps: [
    defineStep({
      id: "write",
      agent: scriptWriterAgent,
      prepareInput: (ctx: PipelineContext) => ({
        episodeNumber: ctx.initialData.episodeNumber as number,
        episodeTitle: ctx.initialData.episodeTitle as string,
        episodeOutline: ctx.initialData.episodeOutline as string,
        sourceText: ctx.initialData.sourceText as string,
        previousEpisodeEnding: ctx.initialData.previousEpisodeEnding as string | undefined,
        characters: ctx.initialData.characters as Array<{
          name: string;
          personality: string[];
          appearance: string;
        }>,
      }),
    }),
  ],
};
