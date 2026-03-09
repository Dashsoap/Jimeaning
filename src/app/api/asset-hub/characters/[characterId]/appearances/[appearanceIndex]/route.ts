import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ characterId: string; appearanceIndex: string }> };

async function findAppearance(characterId: string, appearanceIndex: number, userId: string) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, userId },
  });
  if (!character) throw new ApiError("NOT_FOUND", "Character not found", 404);

  const appearance = await prisma.characterAppearance.findUnique({
    where: { characterId_appearanceIndex: { characterId, appearanceIndex } },
  });
  if (!appearance) throw new ApiError("NOT_FOUND", "Appearance not found", 404);

  return appearance;
}

// GET: Single appearance
export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId, appearanceIndex } = await params;

  const appearance = await findAppearance(characterId, parseInt(appearanceIndex, 10), auth.user.id);
  return NextResponse.json(appearance);
});

// PATCH: Update appearance
export const PATCH = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId, appearanceIndex } = await params;

  const existing = await findAppearance(characterId, parseInt(appearanceIndex, 10), auth.user.id);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.changeReason === "string") data.changeReason = body.changeReason;
  if (typeof body.imageUrl === "string") data.imageUrl = body.imageUrl;

  const appearance = await prisma.characterAppearance.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json(appearance);
});

// DELETE: Delete appearance
export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId, appearanceIndex } = await params;

  const existing = await findAppearance(characterId, parseInt(appearanceIndex, 10), auth.user.id);

  await prisma.characterAppearance.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
});
