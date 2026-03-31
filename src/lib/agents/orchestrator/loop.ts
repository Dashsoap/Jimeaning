/**
 * Orchestrator main loop: LLM-driven control flow for agent pipelines.
 *
 * Each iteration:
 * 1. Read project state from DB
 * 2. Ask LLM to choose next action (tool call)
 * 3. Validate with guardrails
 * 4. Execute the action
 * 5. Log and repeat
 */

import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionWithTools } from "@/lib/llm/client";
import { createScopedLogger } from "@/lib/logging";
import { serializeProjectState } from "./state";
import { buildOrchestratorSystemPrompt, buildOrchestratorUserPrompt } from "./prompt";
import { getAction, actionsToTools } from "./actions";
import { validateAction } from "./guardrails";
import type {
  OrchestratorConfig,
  OrchestratorLogEntry,
  OrchestratorResult,
  ActionContext,
} from "./types";
import type { TaskContext } from "@/lib/workers/shared";

const logger = createScopedLogger({ module: "orchestrator" });

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxIterations: 50,
  maxConsecutiveErrors: 3,
  maxHistoryMessages: 20,
  orchestratorLlm: { apiKey: "", model: "" },
};

export async function runOrchestratorLoop(
  agentProjectId: string,
  userId: string,
  taskCtx: TaskContext,
  config: Partial<OrchestratorConfig>,
): Promise<OrchestratorResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Build LLM client for orchestrator
  const orchClient = createLLMClient({
    apiKey: cfg.orchestratorLlm.apiKey,
    baseUrl: cfg.orchestratorLlm.baseUrl,
    model: cfg.orchestratorLlm.model,
  });

  // Get initial state to determine max iterations dynamically
  const initialState = await serializeProjectState(agentProjectId);
  const totalEpisodes = initialState.episodes.length || 1;
  cfg.maxIterations = Math.min(cfg.maxIterations, totalEpisodes * 6 + 10);

  const outputFormat = initialState.outputFormat || "script";
  const systemPrompt = buildOrchestratorSystemPrompt(outputFormat);
  const tools = actionsToTools();

  // Conversation history for the orchestrator LLM
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  const log: OrchestratorLogEntry[] = [];
  let consecutiveErrors = 0;

  // Load existing log from DB if resuming
  const project = await prisma.agentProject.findUniqueOrThrow({
    where: { id: agentProjectId },
    select: { orchestratorLog: true },
  });
  if (project.orchestratorLog && Array.isArray(project.orchestratorLog)) {
    log.push(...(project.orchestratorLog as unknown as OrchestratorLogEntry[]));
  }

  // Action context (shared across iterations, llm is the main project LLM)
  const { resolveLlmConfig } = await import("@/lib/providers/resolve");
  const mainLlm = await resolveLlmConfig(userId);
  const mainClient = createLLMClient(mainLlm);
  const actionCtx: ActionContext = {
    agentProjectId,
    userId,
    llm: { client: mainClient, model: mainLlm.model },
    taskCtx,
  };

  taskCtx.publishText("\n🧠 编排器启动\n");

  for (let iteration = 1; iteration <= cfg.maxIterations; iteration++) {
    // 1. Read fresh state
    const state = await serializeProjectState(agentProjectId);

    // 2. Build user message with current state
    const userMsg = buildOrchestratorUserPrompt(state);
    messages.push({ role: "user", content: userMsg });

    // Trim history to avoid token overflow (keep system + recent)
    while (messages.length > cfg.maxHistoryMessages + 1) {
      messages.splice(1, 1); // Remove oldest non-system message
    }

    // 3. Ask LLM for next action
    logger.info(`Orchestrator iteration ${iteration}/${cfg.maxIterations}`);
    let reasoning: string;
    let toolCall: { name: string; arguments: Record<string, unknown> } | null;

    try {
      const result = await chatCompletionWithTools(orchClient, {
        model: cfg.orchestratorLlm.model,
        messages,
        tools,
        temperature: 0.2,
      });
      reasoning = result.reasoning;
      toolCall = result.toolCall;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Orchestrator LLM error: ${errMsg}`);
      consecutiveErrors++;
      if (consecutiveErrors >= cfg.maxConsecutiveErrors) {
        taskCtx.publishText(`\n❌ 编排器连续错误${consecutiveErrors}次，终止\n`);
        break;
      }
      continue;
    }

    // 4. No tool call = LLM signals done
    if (!toolCall) {
      taskCtx.publishText(`\n🧠 编排器判断: 无需更多操作\n`);
      if (reasoning) taskCtx.publishText(`💭 ${reasoning.slice(0, 200)}\n`);

      // Auto-derive final status
      const { deriveAndUpdateProjectStatus } = await import("@/lib/workers/handlers/agent-workflow");
      await deriveAndUpdateProjectStatus(agentProjectId);

      await saveLog(agentProjectId, log);
      return { completed: true, paused: false, iterations: iteration, log };
    }

    const actionName = toolCall.name;
    const actionParams = toolCall.arguments;

    // 5. Guardrails validation
    const validation = validateAction(actionName, actionParams, state, log);
    if (!validation.valid) {
      logger.warn(`Guardrail blocked: ${actionName} — ${validation.reason}`);
      taskCtx.publishText(`⚠️ 护栏拦截: ${validation.reason}\n`);

      messages.push({
        role: "assistant",
        content: reasoning || `调用 ${actionName}`,
      });
      messages.push({
        role: "user",
        content: `操作被拦截: ${validation.reason}。请选择其他操作。`,
      });

      log.push({
        iteration,
        reasoning: reasoning || "",
        action: actionName,
        params: actionParams,
        result: `BLOCKED: ${validation.reason}`,
        success: false,
        timestamp: Date.now(),
      });
      consecutiveErrors++;

      if (consecutiveErrors >= cfg.maxConsecutiveErrors) {
        taskCtx.publishText(`\n❌ 编排器连续错误${consecutiveErrors}次，终止\n`);
        break;
      }
      continue;
    }

    // 6. Execute action
    const action = getAction(actionName);
    if (!action) {
      logger.error(`Unknown action: ${actionName}`);
      consecutiveErrors++;
      continue;
    }

    taskCtx.publishText(`\n🔧 [${iteration}] ${actionName}${actionParams.episodeNumber ? ` (第${actionParams.episodeNumber}集)` : ""}\n`);
    if (reasoning) {
      taskCtx.publishText(`💭 ${reasoning.slice(0, 150)}\n`);
    }

    let result;
    try {
      result = await action.execute(actionParams, actionCtx);
      consecutiveErrors = 0;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Action ${actionName} failed: ${errMsg}`);
      taskCtx.publishText(`❌ ${actionName} 失败: ${errMsg.slice(0, 200)}\n`);

      log.push({
        iteration,
        reasoning: reasoning || "",
        action: actionName,
        params: actionParams,
        result: `ERROR: ${errMsg}`,
        success: false,
        timestamp: Date.now(),
      });

      messages.push({
        role: "assistant",
        content: reasoning || `调用 ${actionName}`,
      });
      messages.push({
        role: "user",
        content: `操作 ${actionName} 执行失败: ${errMsg.slice(0, 500)}。请决定下一步。`,
      });

      consecutiveErrors++;
      if (consecutiveErrors >= cfg.maxConsecutiveErrors) {
        taskCtx.publishText(`\n❌ 编排器连续错误${consecutiveErrors}次，终止\n`);
        break;
      }
      continue;
    }

    // 7. Log result
    taskCtx.publishText(`✅ ${result.summary}\n`);
    log.push({
      iteration,
      reasoning: reasoning || "",
      action: actionName,
      params: actionParams,
      result: result.summary,
      success: result.success,
      timestamp: Date.now(),
    });

    // Add assistant response to history
    messages.push({
      role: "assistant",
      content: `${reasoning || ""}\n执行了 ${actionName}: ${result.summary}`,
    });

    // 8. Check for pause
    if (result.shouldPause) {
      taskCtx.publishText(`\n⏸️ 暂停: ${result.pauseReason}\n`);
      await saveLog(agentProjectId, log);
      return {
        completed: false,
        paused: true,
        pauseReason: result.pauseReason,
        iterations: iteration,
        log,
      };
    }

    // Save log periodically (every 5 iterations)
    if (iteration % 5 === 0) {
      await saveLog(agentProjectId, log);
    }

    // Report progress
    const progressPercent = Math.min(95, Math.round((iteration / cfg.maxIterations) * 100));
    await taskCtx.reportProgress(progressPercent);
  }

  // Max iterations reached
  taskCtx.publishText(`\n⚠️ 达到最大迭代次数 (${cfg.maxIterations})\n`);
  await saveLog(agentProjectId, log);

  const { deriveAndUpdateProjectStatus } = await import("@/lib/workers/handlers/agent-workflow");
  await deriveAndUpdateProjectStatus(agentProjectId);

  return {
    completed: false,
    paused: false,
    iterations: cfg.maxIterations,
    log,
  };
}

async function saveLog(agentProjectId: string, log: OrchestratorLogEntry[]) {
  await prisma.agentProject.update({
    where: { id: agentProjectId },
    data: { orchestratorLog: log as unknown as object },
  });
}
