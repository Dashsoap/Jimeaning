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

// ─── Execute a single agent ─────────────────────────────────────────

async function executeAgent<TInput, TOutput>(
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
    logger.info(`Step "${step.id}" completed in ${durationMs}ms (${raw.length} chars)`);

    return {
      stepId: step.id,
      agentName: step.agent.name,
      durationMs,
      outputLength: raw.length,
      status: "success",
    };
  } catch (error) {
    const metric: StepMetric = {
      stepId: step.id,
      agentName: step.agent.name,
      durationMs: Date.now() - startedAt,
      outputLength: 0,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
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
