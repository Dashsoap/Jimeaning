import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ characterId: string }> };

// GET: Single character
export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId } = await params;

  const character = await prisma.character.findFirst({
    where: { id: characterId, userId: auth.user.id, projectId: null },
    include: { appearances: { orderBy: { appearanceIndex: "asc" } } },
  });
  if (!character) throw new ApiError("NOT_FOUND", "Character not found", 404);

  return NextResponse.json(character);
});

// PATCH: Update character
export const PATCH = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId } = await params;

  const existing = await prisma.character.findFirst({
    where: { id: characterId, userId: auth.user.id, projectId: null },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Character not found", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.imageUrl === "string") data.imageUrl = body.imageUrl;
  if (typeof body.voiceProvider === "string") data.voiceProvider = body.voiceProvider;
  if (typeof body.voiceId === "string") data.voiceId = body.voiceId;
  if (typeof body.voiceSample === "string") data.voiceSample = body.voiceSample;

  // Voice binding via globalVoiceId
  if ("globalVoiceId" in body) {
    if (body.globalVoiceId === null) {
      // Unbind voice
      data.globalVoiceId = null;
      data.voiceProvider = null;
      data.voiceId = null;
      data.voiceSample = null;
    } else if (typeof body.globalVoiceId === "string") {
      // Bind voice — copy provider/voiceId from Voice record
      const voice = await prisma.voice.findFirst({
        where: { id: body.globalVoiceId, userId: auth.user.id },
      });
      if (!voice) throw new ApiError("NOT_FOUND", "Voice not found", 404);
      data.globalVoiceId = voice.id;
      data.voiceProvider = voice.provider;
      data.voiceId = voice.voiceId;
      data.voiceSample = voice.sampleUrl;
    }
  }

  const character = await prisma.character.update({
    where: { id: characterId },
    data,
    include: { appearances: { orderBy: { appearanceIndex: "asc" } } },
  });

  return NextResponse.json(character);
});

// DELETE: Delete character
export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId } = await params;

  const existing = await prisma.character.findFirst({
    where: { id: characterId, userId: auth.user.id, projectId: null },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Character not found", 404);

  await prisma.character.delete({ where: { id: characterId } });
  return NextResponse.json({ success: true });
});
