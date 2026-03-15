/**
 * Pipeline runner: executes agent steps within a TaskContext.
 */

import { chatCompletion, chatCompletionStream } from "@/lib/llm/client";
import { createScopedLogger } from "@/lib/logging";
import type OpenAI from "openai";
import type { TaskContext } from "@/lib/workers/shared";
import type {
  AgentDef,
  PipelineContext,
  PipelineDef,
  PipelineEntry,
  PipelineStep,
  RunPipelineOptions,
  StepMetric,
} from "./types";
import { isParallelGroup } from "./types";

const logger = createScopedLogger({ module: "agent-runner" });

/** Build a short summary from parsed result for terminal display (max 500 chars) */
function buildResultSummary(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";

  const obj = parsed as Record<string, unknown>;
  const parts: string[] = [];

  // Common patterns in our agents' outputs
  if (obj.characters && Array.isArray(obj.characters)) {
    const names = obj.characters.map((c: Record<string, unknown>) => c.name || c.characterName).filter(Boolean);
    if (names.length > 0) parts.push(`角色: ${names.join(", ")}`);
  }
  if (obj.themes && Array.isArray(obj.themes)) {
    parts.push(`主题: ${(obj.themes as string[]).slice(0, 3).join(", ")}`);
  }
  if (obj.totalEpisodes) {
    parts.push(`集数: ${obj.totalEpisodes}`);
  }
  if (obj.episodes && Array.isArray(obj.episodes)) {
    const titles = obj.episodes.map((e: Record<string, unknown>) => e.title).filter(Boolean).slice(0, 5);
    if (titles.length > 0) parts.push(`集: ${titles.join(" / ")}`);
  }
  if (obj.totalScore !== undefined) {
    parts.push(`评分: ${obj.totalScore}`);
  }
  if (obj.passed !== undefined) {
    parts.push(obj.passed ? "✓ 通过" : "✗ 未通过");
  }
  if (obj.panels && Array.isArray(obj.panels)) {
    parts.push(`分镜: ${obj.panels.length}个`);
  }

  if (parts.length === 0) return "";
  const summary = parts.join(" | ");
  return `\n   ${summary.slice(0, 500)}`;
}

// ─── Execute a single agent ─────────────────────────────────────────

export async function executeAgent<TInput, TOutput>(
  agent: AgentDef<TInput, TOutput>,
  input: TInput,
  client: OpenAI,
  model: string,
  taskCtx: TaskContext,
): Promise<{ raw: string; parsed: TOutput }> {
  const systemPrompt = agent.systemPrompt(input);
  const userPrompt = agent.userPrompt(input);
  const temperature = agent.temperature ?? 0.7;
  const mode = agent.outputMode ?? "text";

  let raw: string;

  if (mode === "json") {
    raw = await chatCompletion(client, {
      model,
      systemPrompt,
      userPrompt,
      temperature,
      responseFormat: "json",
    });
  } else if (mode === "stream") {
    raw = await chatCompletionStream(client, {
      model,
      systemPrompt,
      userPrompt,
      temperature,
      onChunk: (delta) => taskCtx.publishText(delta),
    });
    await taskCtx.flushText();
  } else {
    raw = await chatCompletion(client, {
      model,
      systemPrompt,
      userPrompt,
      temperature,
    });
  }

  const parsed = agent.parseOutput
    ? agent.parseOutput(raw, input)
    : (raw as unknown as TOutput);

  return { raw, parsed };
}

// ─── Execute a single step ──────────────────────────────────────────

async function executeStep(
  step: PipelineStep,
  pipelineCtx: PipelineContext,
  client: OpenAI,
  model: string,
  taskCtx: TaskContext,
): Promise<StepMetric> {
  const startedAt = Date.now();

  // Conditional skip
  if (step.shouldRun && !step.shouldRun(pipelineCtx)) {
    logger.info(`Step "${step.id}" skipped`);
    return {
      stepId: step.id,
      agentName: step.agent.name,
      durationMs: 0,
      outputLength: 0,
      status: "skipped",
    };
  }

  logger.info(`Step "${step.id}" starting (agent: ${step.agent.name})`);

  // Announce step start to terminal
  taskCtx.publishText(`\n🤖 ${step.agent.description}...\n`);

  try {
    const input = step.prepareInput(pipelineCtx);
    const { raw, parsed } = await executeAgent(
      step.agent,
      input,
      client,
      model,
      taskCtx,
    );

    pipelineCtx.results[step.id] = parsed;

    const durationMs = Date.now() - startedAt;
    const durationSec = (durationMs / 1000).toFixed(1);
    logger.info(`Step "${step.id}" completed in ${durationMs}ms (${raw.length} chars)`);

    // Announce step completion (skip for stream mode — already streamed content)
    if (step.agent.outputMode !== "stream") {
      const summary = buildResultSummary(parsed);
      taskCtx.publishText(`✅ ${step.agent.name} 完成 (${raw.length}字, ${durationSec}s)${summary}\n`);
    } else {
      taskCtx.publishText(`\n✅ ${step.agent.name} 完成 (${raw.length}字, ${durationSec}s)\n`);
    }

    return {
      stepId: step.id,
      agentName: step.agent.name,
      durationMs,
      outputLength: raw.length,
      status: "success",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    taskCtx.publishText(`❌ ${step.agent.name} 失败: ${errMsg.slice(0, 200)}\n`);

    const metric: StepMetric = {
      stepId: step.id,
      agentName: step.agent.name,
      durationMs: Date.now() - startedAt,
      outputLength: 0,
      status: "error",
      error: errMsg,
    };
    pipelineCtx.stepMetrics.push(metric);
    throw error; // Propagate to withTaskLifecycle
  }
}

// ─── Run a pipeline ─────────────────────────────────────────────────

export async function runPipeline(
  pipeline: PipelineDef,
  options: RunPipelineOptions,
): Promise<PipelineContext> {
  const { client, model, taskCtx, initialData } = options;
  const [progressStart, progressEnd] = options.progressRange ?? [0, 100];

  const pipelineCtx: PipelineContext = {
    results: {},
    initialData,
    stepMetrics: [],
  };

  logger.info(`Pipeline "${pipeline.name}" starting (${pipeline.steps.length} entries)`);
  taskCtx.publishText(`\n━━━ ${pipeline.name} ━━━\n`);

  const totalEntries = pipeline.steps.length;

  for (let i = 0; i < pipeline.steps.length; i++) {
    const entry: PipelineEntry = pipeline.steps[i];

    if (isParallelGroup(entry)) {
      logger.info(`Parallel group "${entry.id}" (${entry.steps.length} steps)`);
      const metrics = await Promise.all(
        entry.steps.map((step) =>
          executeStep(step, pipelineCtx, client, model, taskCtx),
        ),
      );
      pipelineCtx.stepMetrics.push(...metrics);
    } else {
      const metric = await executeStep(entry, pipelineCtx, client, model, taskCtx);
      pipelineCtx.stepMetrics.push(metric);
    }

    // Report progress proportionally
    const progress =
      progressStart +
      Math.round(((i + 1) / totalEntries) * (progressEnd - progressStart));
    await taskCtx.reportProgress(progress);
  }

  const totalDuration = pipelineCtx.stepMetrics.reduce((sum, m) => sum + m.durationMs, 0);
  logger.info(`Pipeline "${pipeline.name}" done: ${pipelineCtx.stepMetrics.length} steps, ${totalDuration}ms`);

  return pipelineCtx;
}
