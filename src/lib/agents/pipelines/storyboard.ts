/**
 * Pipeline: storyboard — runs storyboard-director + visual-storyteller in sequence.
 * Only runs when outputFormat is "script" (visual pipeline not needed for novel rewrite).
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep, shouldRunVisualPipeline } from "../types";
import { storyboardDirectorAgent, visualStorytellerAgent } from "../definitions";
import type { StoryboardResult } from "../definitions";

export const storyboardPipeline: PipelineDef = {
  name: "storyboard",
  steps: [
    defineStep({
      id: "storyboard",
      agent: storyboardDirectorAgent,
      shouldRun: shouldRunVisualPipeline,
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
      shouldRun: shouldRunVisualPipeline,
      prepareInput: (ctx: PipelineContext) => ({
        episodeNumber: ctx.initialData.episodeNumber as number,
        script: ctx.initialData.script as string,
        storyboard: ctx.results["storyboard"] as StoryboardResult,
      }),
    }),
  ],
};
