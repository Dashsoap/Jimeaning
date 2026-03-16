/**
 * Pipeline: writing — runs script-writer agent for a single episode.
 * Format-aware: passes outputFormat + styleFingerprint from initialData.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { scriptWriterAgent } from "../definitions";
import type { OutputFormat, StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";

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
        outputFormat: (ctx.initialData.outputFormat as OutputFormat) || "script",
        styleFingerprint: ctx.initialData.styleFingerprint as StyleFingerprint | undefined,
        userFeedback: ctx.initialData.userFeedback as string | undefined,
        currentScript: ctx.initialData.currentScript as string | undefined,
      }),
    }),
  ],
};
