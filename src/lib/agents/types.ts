/**
 * Agent framework types.
 *
 * An Agent = named LLM call unit (system prompt + user prompt + output parser).
 * A Pipeline = ordered list of Steps that compose Agents.
 * The Runner executes a Pipeline within a TaskContext (withTaskLifecycle).
 */

import type OpenAI from "openai";
import type { TaskContext } from "@/lib/workers/shared";

// ─── Agent Definition ────────────────────────────────────────────────

/** An Agent is a named LLM call unit */
export interface AgentDef<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** Build system prompt from input */
  systemPrompt: (input: TInput) => string;
  /** Build user prompt from input */
  userPrompt: (input: TInput) => string;
  temperature?: number;
  /** "json" = structured, "text" = freeform, "stream" = streaming to SSE */
  outputMode?: "json" | "text" | "stream";
  /** Parse raw LLM output into typed result. Identity if omitted. */
  parseOutput?: (raw: string, input: TInput) => TOutput;
}

// ─── Pipeline Step ───────────────────────────────────────────────────

export interface PipelineStep<TInput = unknown, TOutput = unknown> {
  /** Step ID used to reference results (e.g. "draft", "review") */
  id: string;
  agent: AgentDef<TInput, TOutput>;
  /** Transform pipeline context into this agent's input */
  prepareInput: (ctx: PipelineContext) => TInput;
  /** Skip this step if condition returns false */
  shouldRun?: (ctx: PipelineContext) => boolean;
}

/** Multiple steps running in parallel */
export interface ParallelStepGroup {
  id: string;
  execution: "parallel";
  steps: PipelineStep[];
}

export type PipelineEntry = PipelineStep | ParallelStepGroup;

export function isParallelGroup(entry: PipelineEntry): entry is ParallelStepGroup {
  return "execution" in entry && entry.execution === "parallel";
}

/** Helper to define a pipeline step with proper type inference, then erase to PipelineStep */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineStep<TInput, TOutput>(step: PipelineStep<TInput, TOutput>): PipelineStep<any, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return step as PipelineStep<any, any>;
}

// ─── Pipeline ────────────────────────────────────────────────────────

export interface PipelineDef {
  name: string;
  steps: PipelineEntry[];
}

// ─── Context (accumulates results) ──────────────────────────────────

export interface PipelineContext {
  results: Record<string, unknown>;
  initialData: Record<string, unknown>;
  stepMetrics: StepMetric[];
}

export interface StepMetric {
  stepId: string;
  agentName: string;
  durationMs: number;
  outputLength: number;
  status: "success" | "skipped" | "error";
  error?: string;
}

// ─── Runner Options ──────────────────────────────────────────────────

export interface RunPipelineOptions {
  client: OpenAI;
  model: string;
  taskCtx: TaskContext;
  initialData: Record<string, unknown>;
  /** Progress range this pipeline occupies, e.g. [10, 95] */
  progressRange?: [number, number];
}
