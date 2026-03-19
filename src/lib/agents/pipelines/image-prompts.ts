/**
 * Pipeline: image-prompts — runs image-generator agent.
 * Only runs when outputFormat is "script" (visual pipeline not needed for novel rewrite).
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep, shouldRunVisualPipeline } from "../types";
import { imageGeneratorAgent } from "../definitions";
import type { StoryboardResult } from "../definitions";

export const imagePromptsPipeline: PipelineDef = {
  name: "image-prompts",
  steps: [
    defineStep({
      id: "image-prompts",
      agent: imageGeneratorAgent,
      shouldRun: shouldRunVisualPipeline,
      prepareInput: (ctx: PipelineContext) => ({
        episodeNumber: ctx.initialData.episodeNumber as number,
        storyboard: ctx.initialData.storyboard as StoryboardResult,
        characterCards: ctx.initialData.characterCards as Array<{
          name: string;
          promptDescription: string;
        }>,
      }),
    }),
  ],
};
