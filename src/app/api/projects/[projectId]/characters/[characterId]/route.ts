import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ projectId: string; characterId: string }>;
};

export const PUT = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, characterId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();

  const character = await prisma.character.update({
    where: { id: characterId },
    data: {
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      voiceProvider: body.voiceProvider,
      voiceId: body.voiceId,
      voiceSample: body.voiceSample,
    },
  });

  return NextResponse.json(character);
});
