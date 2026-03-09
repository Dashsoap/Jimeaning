import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

// POST: Deep-copy global assets into a project
// Body: { type: "character"|"location"|"voice", sourceId: string, targetCharacterId?: string }
export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;
  const userId = auth.session.user.id;

  const body = await req.json();
  const { type, sourceId } = body;

  if (!type || !sourceId) {
    throw new ApiError("INVALID_PARAMS", "type and sourceId required", 400);
  }

  if (type === "character") {
    const source = await prisma.character.findFirst({
      where: { id: sourceId, userId, projectId: null },
      include: { appearances: { orderBy: { appearanceIndex: "asc" } } },
    });
    if (!source) throw new ApiError("NOT_FOUND", "Character not found", 404);

    const newChar = await prisma.$transaction(async (tx) => {
      const char = await tx.character.create({
        data: {
          projectId,
          userId,
          name: source.name,
          description: source.description,
          imageUrl: source.imageUrl,
          voiceProvider: source.voiceProvider,
          voiceId: source.voiceId,
          voiceSample: source.voiceSample,
          globalVoiceId: source.globalVoiceId,
        },
      });

      // Copy appearances
      for (const app of source.appearances) {
        await tx.characterAppearance.create({
          data: {
            characterId: char.id,
            appearanceIndex: app.appearanceIndex,
            description: app.description,
            imageUrl: app.imageUrl,
            changeReason: app.changeReason,
            // Don't copy candidateImages/selectedIndex — confirmed images only
          },
        });
      }

      return char;
    });

    return NextResponse.json(newChar, { status: 201 });
  }

  if (type === "location") {
    const source = await prisma.location.findFirst({
      where: { id: sourceId, userId, projectId: null },
    });
    if (!source) throw new ApiError("NOT_FOUND", "Location not found", 404);

    const newLoc = await prisma.location.create({
      data: {
        projectId,
        userId,
        name: source.name,
        description: source.description,
        imageUrl: source.imageUrl,
      },
    });

    return NextResponse.json(newLoc, { status: 201 });
  }

  if (type === "voice") {
    const { targetCharacterId } = body;
    if (!targetCharacterId) {
      throw new ApiError("INVALID_PARAMS", "targetCharacterId required for voice copy", 400);
    }

    const voice = await prisma.voice.findFirst({
      where: { id: sourceId, userId },
    });
    if (!voice) throw new ApiError("NOT_FOUND", "Voice not found", 404);

    const targetChar = await prisma.character.findFirst({
      where: { id: targetCharacterId, projectId, userId },
    });
    if (!targetChar) throw new ApiError("NOT_FOUND", "Target character not found", 404);

    const updated = await prisma.character.update({
      where: { id: targetCharacterId },
      data: {
        voiceProvider: voice.provider,
        voiceId: voice.voiceId,
        voiceSample: voice.sampleUrl,
      },
    });

    return NextResponse.json(updated);
  }

  throw new ApiError("INVALID_PARAMS", "type must be character, location, or voice", 400);
});
