/**
 * Pipeline: novel-rewrite — write + reflect + improve cycle for novel mode.
 * The reflect step always runs in novel mode.
 * The improve step only runs if reflect score < 40.
 */

import type { PipelineDef, PipelineContext } from "../types";
import { defineStep } from "../types";
import { scriptWriterAgent } from "../definitions";
import { reflectAgent } from "../definitions";
import { improveAgent } from "../definitions";
import type { OutputFormat, StyleFingerprint } from "@/lib/llm/prompts/rewrite-script";
import type { ReflectOutput } from "../definitions";

export const novelRewritePipeline: PipelineDef = {
  name: "novel-rewrite",
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
        outputFormat: (ctx.initialData.outputFormat as OutputFormat) || "novel",
        styleFingerprint: ctx.initialData.styleFingerprint as StyleFingerprint | undefined,
        rewriteStrategy: ctx.initialData.rewriteStrategy,
        chapterNotes: ctx.initialData.chapterNotes as string | undefined,
        prevChapterSummaries: ctx.initialData.prevChapterSummaries as string | undefined,
        transitionInstructions: ctx.initialData.transitionInstructions as string | undefined,
      }),
    }),
    defineStep({
      id: "reflect",
      agent: reflectAgent,
      prepareInput: (ctx: PipelineContext) => {
        const writeResult = ctx.results["write"] as { script: string };
        return {
          originalText: ctx.initialData.sourceText as string,
          rewrittenText: writeResult.script,
          strategyContext: ctx.initialData.strategyContext as ReflectInput["strategyContext"],
        };
      },
    }),
    defineStep({
      id: "improve",
      agent: improveAgent,
      shouldRun: (ctx: PipelineContext) => {
        const reflectResult = ctx.results["reflect"] as ReflectOutput | undefined;
        if (!reflectResult) return false;
        return reflectResult.totalScore < 40;
      },
      prepareInput: (ctx: PipelineContext) => {
        const writeResult = ctx.results["write"] as { script: string };
        const reflectResult = ctx.results["reflect"] as ReflectOutput;
        return {
          rewrittenText: writeResult.script,
          reflectionFeedback: JSON.stringify({
            scores: reflectResult.scores,
            aiPatterns: reflectResult.aiPatterns,
            suggestions: reflectResult.suggestions,
            strategyViolations: reflectResult.strategyCompliance?.violations,
          }),
          strategyContext: ctx.initialData.strategyContext
            ? {
                narrativeVoice: (ctx.initialData.strategyContext as { globalStyle: { narrativeVoice: string } }).globalStyle.narrativeVoice,
                toneAndRegister: (ctx.initialData.strategyContext as { globalStyle: { toneAndRegister: string } }).globalStyle.toneAndRegister,
                dialogueApproach: (ctx.initialData.strategyContext as { globalStyle: { dialogueApproach: string } }).globalStyle.dialogueApproach,
              }
            : undefined,
        };
      },
    }),
  ],
};

// Type import for prepareInput
import type { ReflectInput } from "../definitions";
