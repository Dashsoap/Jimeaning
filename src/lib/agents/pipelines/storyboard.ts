/**
 * Pipeline: storyboard — runs storyboard-director + visual-storyteller + storyboard-detail in sequence.
 * Only runs when outputFormat is "script" (visual pipeline not needed for novel rewrite).
 *
 * Phase 1: storyboard-director — generates scene breakdown with shots
 * Phase 2: visual-storyteller — adds "Show Don't Tell" annotations
 * Phase 3: storyboard-detail — generates dynamic video_prompt for each shot
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep, shouldRunVisualPipeline } from "../types";
import {
  storyboardDirectorAgent,
  visualStorytellerAgent,
  storyboardDetailAgent,
} from "../definitions";
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
    defineStep({
      id: "storyboard-detail",
      agent: storyboardDetailAgent,
      shouldRun: shouldRunVisualPipeline,
      prepareInput: (ctx: PipelineContext) => ({
        storyboard: ctx.results["storyboard"] as StoryboardResult,
        characters: ctx.initialData.characters as Array<{
          name: string;
          appearance: string;
        }>,
      }),
    }),
  ],
};
