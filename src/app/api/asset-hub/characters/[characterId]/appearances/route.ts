import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ characterId: string }> };

// GET: List appearances for a character
export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId } = await params;

  const character = await prisma.character.findFirst({
    where: { id: characterId, userId: auth.user.id },
  });
  if (!character) throw new ApiError("NOT_FOUND", "Character not found", 404);

  const appearances = await prisma.characterAppearance.findMany({
    where: { characterId },
    orderBy: { appearanceIndex: "asc" },
  });

  return NextResponse.json(appearances);
});

// POST: Create a new appearance
export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId } = await params;

  const character = await prisma.character.findFirst({
    where: { id: characterId, userId: auth.user.id },
  });
  if (!character) throw new ApiError("NOT_FOUND", "Character not found", 404);

  const body = await req.json();

  // Find the next available appearance index
  const maxAppearance = await prisma.characterAppearance.findFirst({
    where: { characterId },
    orderBy: { appearanceIndex: "desc" },
    select: { appearanceIndex: true },
  });
  const nextIndex = (maxAppearance?.appearanceIndex ?? -1) + 1;

  const appearance = await prisma.characterAppearance.create({
    data: {
      characterId,
      appearanceIndex: nextIndex,
      description: typeof body.description === "string" ? body.description : undefined,
      changeReason: typeof body.changeReason === "string" ? body.changeReason : undefined,
    },
  });

  return NextResponse.json(appearance, { status: 201 });
});
