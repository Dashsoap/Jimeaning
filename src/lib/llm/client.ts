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
}
