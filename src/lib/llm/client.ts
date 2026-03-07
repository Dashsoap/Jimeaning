import OpenAI from "openai";

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

// ─── Retry helper for transient API errors (502, 503, rate limit, network) ──

function isRetryableError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    return [429, 500, 502, 503, 504].includes(err.status);
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("econnreset") || msg.includes("etimedout") ||
           msg.includes("socket hang up") || msg.includes("network");
  }
  return false;
}

const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 3000; // 3s, 6s, 12s

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = DEFAULT_MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
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
  });
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
  });
}

/**
 * Chat completion that returns parsed JSON.
 * Uses response_format: json_object and parses the result.
 */
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
