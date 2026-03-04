import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
  });

  if (!pref) {
    return NextResponse.json({
      apiKeys: {},
      models: {},
      defaults: {},
    });
  }

  // Return masked API keys
  const maskField = (val: string | null) =>
    val ? maskApiKey(decrypt(val)) : null;

  return NextResponse.json({
    apiKeys: {
      openai: maskField(pref.openaiApiKey),
      fal: maskField(pref.falApiKey),
      google: maskField(pref.googleApiKey),
      fishAudio: maskField(pref.fishAudioApiKey),
      elevenLabs: maskField(pref.elevenLabsApiKey),
    },
    models: {
      llm: pref.llmModel,
      image: pref.imageModel,
      video: pref.videoModel,
      ttsProvider: pref.ttsProvider,
      ttsModel: pref.ttsModel,
      ttsVoice: pref.ttsVoice,
    },
    defaults: {
      aspectRatio: pref.defaultAspectRatio,
      style: pref.defaultStyle,
      locale: pref.locale,
    },
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, string | undefined> = {};

  // Encrypt API keys if provided (non-empty, non-masked)
  const keyFields = [
    ["openaiApiKey", body.apiKeys?.openai],
    ["falApiKey", body.apiKeys?.fal],
    ["googleApiKey", body.apiKeys?.google],
    ["fishAudioApiKey", body.apiKeys?.fishAudio],
    ["elevenLabsApiKey", body.apiKeys?.elevenLabs],
  ] as const;

  for (const [field, value] of keyFields) {
    if (value && !value.includes("*")) {
      data[field] = encrypt(value);
    }
  }

  // Model preferences
  if (body.models) {
    if (body.models.llm) data.llmModel = body.models.llm;
    if (body.models.image) data.imageModel = body.models.image;
    if (body.models.video) data.videoModel = body.models.video;
    if (body.models.ttsProvider) data.ttsProvider = body.models.ttsProvider;
    if (body.models.ttsModel) data.ttsModel = body.models.ttsModel;
    if (body.models.ttsVoice) data.ttsVoice = body.models.ttsVoice;
  }

  // Defaults
  if (body.defaults) {
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
