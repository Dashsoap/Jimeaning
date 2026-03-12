/**
 * Pipeline: storyboard — runs storyboard-director + visual-storyteller in sequence.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { storyboardDirectorAgent, visualStorytellerAgent } from "../definitions";
import type { StoryboardResult } from "../definitions";

export const storyboardPipeline: PipelineDef = {
  name: "storyboard",
  steps: [
    defineStep({
      id: "storyboard",
      agent: storyboardDirectorAgent,
      prepareInput: (ctx: PipelineContext) => ({
        episodeNumber: ctx.initialData.episodeNumber as number,
        script: ctx.initialData.script as string,
        characters: ctx.initialData.characters as Array<{
          name: string;
          appearance: string;
        }>,
      }),
    }),
    defineStep({
      id: "visual-narrative",
      agent: visualStorytellerAgent,
      prepareInput: (ctx: PipelineContext) => ({
        episodeNumber: ctx.initialData.episodeNumber as number,
        script: ctx.initialData.script as string,
        storyboard: ctx.results["storyboard"] as StoryboardResult,
      }),
    }),
  ],
};
