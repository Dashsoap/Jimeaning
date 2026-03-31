import OpenAI from "openai";
import { withRetry } from "@/lib/retry";

export interface LLMClientConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export function createLLMClient(config: LLMClientConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

export async function chatCompletion(
  client: OpenAI,
  params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    responseFormat?: "json" | "text";
  }
): Promise<string> {
  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.7,
      ...(params.responseFormat === "json" && {
        response_format: { type: "json_object" },
      }),
    });

    return response.choices[0]?.message?.content ?? "";
  }, { label: `LLM:${params.model}` });
}

/**
 * Streaming chat completion. Calls onChunk with each delta, returns the full text.
 */
export async function chatCompletionStream(
  client: OpenAI,
  params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    onChunk: (delta: string) => void;
  }
): Promise<string> {
  return withRetry(async () => {
    const stream = await client.chat.completions.create({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: params.temperature ?? 0.7,
      stream: true,
    });

    let full = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        full += delta;
        params.onChunk(delta);
      }
    }
    return full;
  }, { label: `LLM-stream:${params.model}` });
}

/**
 * Chat completion that returns parsed JSON.
 * Uses response_format: json_object and parses the result.
 */
/**
 * Chat completion with tool calling support.
 * Returns the LLM's reasoning text and the first tool call (if any).
 * When toolCall is null, the LLM chose not to call any tool (signals "done").
 */
export async function chatCompletionWithTools(
  client: OpenAI,
  params: {
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    tools: Array<{
      type: "function";
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }>;
    temperature?: number;
  },
): Promise<{
  reasoning: string;
  toolCall: { name: string; arguments: Record<string, unknown> } | null;
}> {
  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model: params.model,
      messages: params.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      tools: params.tools,
      tool_choice: "auto",
      temperature: params.temperature ?? 0.3,
    });

    const message = response.choices[0]?.message;
    const reasoning = message?.content ?? "";
    const tc = message?.tool_calls?.[0];

    if (!tc) {
      return { reasoning, toolCall: null };
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      // If JSON parse fails, return empty args
    }

    return {
      reasoning,
      toolCall: { name: tc.function.name, arguments: args },
    };
  }, { label: `LLM-tools:${params.model}` });
}

export async function chatCompletionJson<T = Record<string, unknown>>(
  client: OpenAI,
  params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }
): Promise<T> {
  const raw = await chatCompletion(client, {
    ...params,
    responseFormat: "json",
  });

  // Strip markdown code fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "");

  return JSON.parse(cleaned) as T;
}
