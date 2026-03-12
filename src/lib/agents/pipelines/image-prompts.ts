/**
 * Pipeline: image-prompts — runs image-generator agent.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { imageGeneratorAgent } from "../definitions";
import type { StoryboardResult } from "../definitions";

export const imagePromptsPipeline: PipelineDef = {
  name: "image-prompts",
  steps: [
    defineStep({
      id: "image-prompts",
      agent: imageGeneratorAgent,
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
