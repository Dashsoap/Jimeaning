import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// GET: List global characters (projectId = null, owned by user)
export const GET = apiHandler(async (_req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const characters = await prisma.character.findMany({
    where: { userId: auth.user.id, projectId: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(characters);
});

// POST: Create a global character
export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    throw new ApiError("INVALID_PARAMS", "name is required", 400);
  }

  const character = await prisma.character.create({
    data: {
      userId: auth.user.id,
      projectId: null,
      name,
      description: typeof body.description === "string" ? body.description : undefined,
      voiceProvider: typeof body.voiceProvider === "string" ? body.voiceProvider : undefined,
      voiceId: typeof body.voiceId === "string" ? body.voiceId : undefined,
    },
  });

  return NextResponse.json(character, { status: 201 });
});
