/**
 * Types for the AI Orchestrator that replaces hardcoded control flow.
 * The orchestrator is a thin decision layer using LLM tool calling.
 */

import type OpenAI from "openai";
import type { TaskContext } from "@/lib/workers/shared";

// ─── Project State (serialized for LLM context) ────────────────────

export interface OrchestratorState {
  projectId: string;
  outputFormat: "script" | "novel" | "same";
  rewriteIntensity: number;
  phases: {
    analysis: { done: boolean; characterCount?: number };
    planning: { done: boolean; episodeCount?: number };
    strategy: { done: boolean; confirmed: boolean };
  };
  episodes: Array<{
    number: number;
    status: string;
    hasScript: boolean;
    reviewScore?: number;
    similarityScore?: number;
    hasStoryboard: boolean;
    hasImagePrompts: boolean;
    rewriteAttempt: number;
  }>;
  summary: {
    completedCount: number;
    failedCount: number;
    pendingCount: number;
  };
}

// ─── Action Definitions ─────────────────────────────────────────────

export interface ActionContext {
  agentProjectId: string;
  userId: string;
  llm: { client: OpenAI; model: string };
  taskCtx: TaskContext;
}

export interface ActionResult {
  success: boolean;
  summary: string;
  shouldPause?: boolean;
  pauseReason?: string;
}

export interface ActionDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema for tool params
  preconditions: string; // Human-readable for LLM
  execute: (params: Record<string, unknown>, context: ActionContext) => Promise<ActionResult>;
}

// ─── Orchestrator Config & Logging ──────────────────────────────────

export interface OrchestratorConfig {
  maxIterations: number;
  maxConsecutiveErrors: number;
  maxHistoryMessages: number;
  orchestratorLlm: {
    apiKey: string;
    baseUrl?: string;
    model: string;
  };
}

export interface OrchestratorLogEntry {
  iteration: number;
  reasoning: string;
  action: string;
  params: Record<string, unknown>;
  result: string;
  success: boolean;
  timestamp: number;
}

export interface OrchestratorResult {
  completed: boolean;
  paused: boolean;
  pauseReason?: string;
  iterations: number;
  log: OrchestratorLogEntry[];
}
