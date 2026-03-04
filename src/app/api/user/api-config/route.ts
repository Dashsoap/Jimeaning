import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";

interface ProviderPayload {
  id: string;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey?: boolean;
}

interface ModelPayload {
  modelId: string;
  name: string;
  type: string;
  provider: string;
  enabled: boolean;
}

// ─── GET: Return user's providers (masked keys) and models ──────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: {
      customProviders: true,
      customModels: true,
      defaultLlmModel: true,
      defaultImageModel: true,
      defaultVideoModel: true,
      defaultAudioModel: true,
      ttsVoice: true,
      defaultAspectRatio: true,
      defaultStyle: true,
      locale: true,
    },
  });

  // Parse and mask providers
  let providers: ProviderPayload[] = [];
  if (pref?.customProviders) {
    try {
      const raw = JSON.parse(pref.customProviders);
      if (Array.isArray(raw)) {
        providers = raw.map((p: Record<string, unknown>) => {
          let maskedKey: string | undefined;
          if (p.apiKey && typeof p.apiKey === "string") {
            try {
              maskedKey = maskApiKey(decrypt(p.apiKey as string));
            } catch {
              maskedKey = "****";
            }
          }
          return {
            id: String(p.id || ""),
            name: String(p.name || ""),
            baseUrl: p.baseUrl ? String(p.baseUrl) : undefined,
            apiKey: maskedKey,
            hasApiKey: !!p.apiKey,
          };
        });
      }
    } catch {
      // ignore parse errors
    }
  }

  // Parse models
  let models: ModelPayload[] = [];
  if (pref?.customModels) {
    try {
      const raw = JSON.parse(pref.customModels);
      if (Array.isArray(raw)) {
        models = raw.map((m: Record<string, unknown>) => ({
          modelId: String(m.modelId || ""),
          name: String(m.name || m.modelId || ""),
          type: String(m.type || "llm"),
          provider: String(m.provider || ""),
          enabled: m.enabled !== false,
        }));
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    providers,
    models,
    defaults: {
      llmModel: pref?.defaultLlmModel ?? null,
      imageModel: pref?.defaultImageModel ?? null,
      videoModel: pref?.defaultVideoModel ?? null,
      audioModel: pref?.defaultAudioModel ?? null,
      ttsVoice: pref?.ttsVoice ?? "alloy",
      aspectRatio: pref?.defaultAspectRatio ?? "16:9",
      style: pref?.defaultStyle ?? "realistic",
      locale: pref?.locale ?? "zh",
    },
  });
}

// ─── PUT: Save providers (encrypt keys) and models ──────────────────────

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, string | null | undefined> = {};

  // Process providers
  if (Array.isArray(body.providers)) {
    // Load existing providers for masked key detection
    const existing = await prisma.userPreference.findUnique({
      where: { userId: session.user.id },
      select: { customProviders: true },
    });

    const existingProviders: Record<string, string> = {};
    if (existing?.customProviders) {
      try {
        const arr = JSON.parse(existing.customProviders);
        if (Array.isArray(arr)) {
          for (const p of arr) {
            if (p.id && p.apiKey) {
              existingProviders[p.id] = p.apiKey;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    const processedProviders = body.providers.map((p: ProviderPayload) => {
      let encryptedKey: string | undefined;
      if (p.apiKey && !p.apiKey.includes("*")) {
        // New key - encrypt it
        encryptedKey = encrypt(p.apiKey);
      } else if (p.hasApiKey || (p.apiKey && p.apiKey.includes("*"))) {
        // Masked key - keep existing encrypted value
        encryptedKey = existingProviders[p.id];
      }

      return {
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl || undefined,
        apiKey: encryptedKey || undefined,
      };
    });

    data.customProviders = JSON.stringify(processedProviders);
  }

  // Process models
  if (Array.isArray(body.models)) {
    const processedModels = body.models.map((m: ModelPayload) => ({
      modelId: m.modelId,
      name: m.name || m.modelId,
      type: m.type,
      provider: m.provider,
      enabled: m.enabled !== false,
    }));

    data.customModels = JSON.stringify(processedModels);
  }

  // Process defaults
  if (body.defaults) {
    if (body.defaults.llmModel !== undefined) data.defaultLlmModel = body.defaults.llmModel || null;
    if (body.defaults.imageModel !== undefined) data.defaultImageModel = body.defaults.imageModel || null;
    if (body.defaults.videoModel !== undefined) data.defaultVideoModel = body.defaults.videoModel || null;
    if (body.defaults.audioModel !== undefined) data.defaultAudioModel = body.defaults.audioModel || null;
    if (body.defaults.ttsVoice) data.ttsVoice = body.defaults.ttsVoice;
    if (body.defaults.aspectRatio) data.defaultAspectRatio = body.defaults.aspectRatio;
    if (body.defaults.style) data.defaultStyle = body.defaults.style;
    if (body.defaults.locale) data.locale = body.defaults.locale;
  }

  await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  });

  return NextResponse.json({ success: true });
}
