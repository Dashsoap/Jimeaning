import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = { params: Promise<{ characterId: string; appearanceIndex: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { characterId, appearanceIndex } = await params;
  const idx = parseInt(appearanceIndex, 10);

  const character = await prisma.character.findFirst({
    where: { id: characterId, userId: auth.user.id },
  });
  if (!character) throw new ApiError("NOT_FOUND", "Character not found", 404);

  // Ensure the appearance exists (create if primary and missing)
  let appearance = await prisma.characterAppearance.findUnique({
    where: { characterId_appearanceIndex: { characterId, appearanceIndex: idx } },
  });
  if (!appearance) {
    if (idx === 0) {
      appearance = await prisma.characterAppearance.create({
        data: { characterId, appearanceIndex: 0, description: character.description },
      });
    } else {
      throw new ApiError("NOT_FOUND", "Appearance not found", 404);
    }
  }

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : undefined;

  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.IMAGE_CHARACTER,
    data: { characterId, appearanceIndex: idx, prompt },
    totalSteps: 100,
  });

  return NextResponse.json({ taskId }, { status: 202 });
});
