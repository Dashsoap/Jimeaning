import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { getProviderConfig, getProviderKey } from "@/lib/api-config";
import type { ModelMediaType } from "@/lib/preset-models";

interface DiscoveredModel {
  modelId: string;
  name: string;
  type: ModelMediaType;
}

// Models that are not useful for generation
const EXCLUDED_PATTERNS = /embedding|moderation|whisper|transcri|realtime|search|text-search|code-search/i;

function classifyModelType(id: string): ModelMediaType {
  if (/video|sora|veo|kling|runway|gen-?3|luma|grok.*video|wan/i.test(id)) return "video";
  if (/tts|audio|speech|voice|index-tts/i.test(id)) return "audio";
  if (/dall-e|image|imagen|flux|stable-diffusion|gpt-image|midjourney/i.test(id)) return "image";
  return "llm";
}

function formatModelName(id: string): string {
  // Try to make a readable name from the model ID
  return id
    .replace(/^(openai\/|anthropic\/|google\/|meta-llama\/)/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

export const POST = apiHandler(async (req: Request) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { providerId } = body;

  if (!providerId) {
    return NextResponse.json({ error: "providerId is required" }, { status: 400 });
  }

  const providerKey = getProviderKey(providerId);
  if (providerKey !== "openai-compatible") {
    return NextResponse.json(
      { error: "Model discovery is only supported for OpenAI Compatible providers" },
      { status: 400 },
    );
  }

  const config = await getProviderConfig(auth.user.id, providerId);
  if (!config.baseUrl) {
    return NextResponse.json({ error: "Base URL is required for model discovery" }, { status: 400 });
  }

  // Fetch models from the proxy's /v1/models endpoint
  // The baseUrl from getProviderConfig already has /v1 appended
  const modelsUrl = `${config.baseUrl}/models`;

  const response = await fetch(modelsUrl, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json(
      { error: `Failed to fetch models: ${response.status} ${error.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const data = await response.json();
  const rawModels: { id: string; name?: string }[] = data.data || data.models || [];

  const models: DiscoveredModel[] = rawModels
    .filter((m) => m.id && !EXCLUDED_PATTERNS.test(m.id))
    .map((m) => ({
      modelId: m.id,
      name: m.name || formatModelName(m.id),
      type: classifyModelType(m.id),
    }))
    .sort((a, b) => {
      // Sort by type, then by name
      const typeOrder: Record<ModelMediaType, number> = { llm: 0, image: 1, video: 2, audio: 3 };
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({ models });
});
