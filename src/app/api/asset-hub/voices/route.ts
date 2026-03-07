import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// GET: List global voices
export const GET = apiHandler(async (_req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const voices = await prisma.voice.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(voices);
});

// POST: Create a global voice
export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    throw new ApiError("INVALID_PARAMS", "name is required", 400);
  }

  const voice = await prisma.voice.create({
    data: {
      userId: auth.user.id,
      name,
      description: typeof body.description === "string" ? body.description : undefined,
      provider: typeof body.provider === "string" ? body.provider : undefined,
      voiceId: typeof body.voiceId === "string" ? body.voiceId : undefined,
      sampleUrl: typeof body.sampleUrl === "string" ? body.sampleUrl : undefined,
      gender: typeof body.gender === "string" ? body.gender : undefined,
      language: typeof body.language === "string" ? body.language : "zh",
    },
  });

  return NextResponse.json(voice, { status: 201 });
});
