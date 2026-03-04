import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { ProviderConfig } from "@/lib/generators/types";

/**
 * Resolve a user's API key for a given provider into a ProviderConfig.
 */
export async function resolveProviderConfig(
  userId: string,
  provider: "openai" | "fal" | "google" | "fishAudio" | "elevenLabs"
): Promise<ProviderConfig> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
  });

  if (!pref) {
    throw new Error("User preferences not configured");
  }

  const keyFieldMap: Record<string, string | null> = {
    openai: pref.openaiApiKey,
    fal: pref.falApiKey,
    google: pref.googleApiKey,
    fishAudio: pref.fishAudioApiKey,
    elevenLabs: pref.elevenLabsApiKey,
  };

  const encryptedKey = keyFieldMap[provider];
  if (!encryptedKey) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  return {
    apiKey: decrypt(encryptedKey),
  };
}

/**
 * Resolve provider config with model preferences included.
 */
export async function resolveImageConfig(userId: string) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
  });

  if (!pref) throw new Error("User preferences not configured");

  // Determine which provider to use based on image model
  const model = pref.imageModel;
  let provider: "openai" | "fal" | "google-gemini" = "openai";
  let apiKey: string | null = null;

  if (model.startsWith("fal-ai/") || model.includes("flux") || model.includes("sdxl")) {
    provider = "fal";
    apiKey = pref.falApiKey;
  } else if (model.startsWith("gemini")) {
    provider = "google-gemini";
    apiKey = pref.googleApiKey;
  } else {
    provider = "openai";
    apiKey = pref.openaiApiKey;
  }

  if (!apiKey) {
    throw new Error(`No API key for image provider: ${provider}`);
  }

  return { provider, config: { apiKey: decrypt(apiKey), model } };
}

export async function resolveVideoConfig(userId: string) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
  });

  if (!pref) throw new Error("User preferences not configured");

  const model = pref.videoModel;
  let provider: "openai" | "fal" = "openai";
  let apiKey: string | null = null;

  if (model.startsWith("fal-ai/") || model.includes("kling") || model.includes("runway")) {
    provider = "fal";
    apiKey = pref.falApiKey;
  } else {
    provider = "openai";
    apiKey = pref.openaiApiKey;
  }

  if (!apiKey) {
    throw new Error(`No API key for video provider: ${provider}`);
  }

  return { provider, config: { apiKey: decrypt(apiKey), model } };
}

export async function resolveAudioConfig(userId: string) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
  });

  if (!pref) throw new Error("User preferences not configured");

  const ttsProvider = pref.ttsProvider as "openai" | "fish-audio" | "elevenlabs";
  let apiKey: string | null = null;

  switch (ttsProvider) {
    case "fish-audio":
      apiKey = pref.fishAudioApiKey;
      break;
    case "elevenlabs":
      apiKey = pref.elevenLabsApiKey;
      break;
    default:
      apiKey = pref.openaiApiKey;
  }

  if (!apiKey) {
    throw new Error(`No API key for TTS provider: ${ttsProvider}`);
  }

  return {
    provider: ttsProvider,
    config: { apiKey: decrypt(apiKey), model: pref.ttsModel },
    voiceId: pref.ttsVoice,
  };
}
