import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ voiceId: string }> };

// GET: Single voice
export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { voiceId } = await params;

  const voice = await prisma.voice.findFirst({
    where: { id: voiceId, userId: auth.user.id },
  });
  if (!voice) throw new ApiError("NOT_FOUND", "Voice not found", 404);

  return NextResponse.json(voice);
});

// PATCH: Update voice
export const PATCH = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { voiceId } = await params;

  const existing = await prisma.voice.findFirst({
    where: { id: voiceId, userId: auth.user.id },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Voice not found", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.provider === "string") data.provider = body.provider;
  if (typeof body.voiceId === "string") data.voiceId = body.voiceId;
  if (typeof body.sampleUrl === "string") data.sampleUrl = body.sampleUrl;
  if (typeof body.gender === "string") data.gender = body.gender;
  if (typeof body.language === "string") data.language = body.language;

  const voice = await prisma.voice.update({
    where: { id: voiceId },
    data,
  });

  return NextResponse.json(voice);
});

// DELETE: Delete voice
export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { voiceId } = await params;

  const existing = await prisma.voice.findFirst({
    where: { id: voiceId, userId: auth.user.id },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Voice not found", 404);

  await prisma.voice.delete({ where: { id: voiceId } });
  return NextResponse.json({ success: true });
});
