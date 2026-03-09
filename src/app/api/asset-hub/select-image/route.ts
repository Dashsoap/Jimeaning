import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { type, selectedIndex, confirm } = body;

  if (type === "character") {
    const { characterId, appearanceIndex } = body;
    if (!characterId || typeof appearanceIndex !== "number") {
      throw new ApiError("INVALID_PARAMS", "characterId and appearanceIndex required", 400);
    }

    const character = await prisma.character.findFirst({
      where: { id: characterId, userId: auth.user.id },
    });
    if (!character) throw new ApiError("NOT_FOUND", "Character not found", 404);

    const appearance = await prisma.characterAppearance.findUnique({
      where: { characterId_appearanceIndex: { characterId, appearanceIndex } },
    });
    if (!appearance) throw new ApiError("NOT_FOUND", "Appearance not found", 404);

    const candidates: string[] = appearance.candidateImages
      ? JSON.parse(appearance.candidateImages)
      : [];

    if (confirm) {
      // Confirm selection: set imageUrl = candidates[selectedIndex], clear candidates
      const idx = appearance.selectedIndex ?? 0;
      const imageUrl = candidates[idx];
      if (!imageUrl) throw new ApiError("INVALID_PARAMS", "No image selected", 400);

      const updated = await prisma.characterAppearance.update({
        where: { id: appearance.id },
        data: {
          imageUrl,
          candidateImages: null,
          selectedIndex: null,
        },
      });

      // Update character's main imageUrl if primary appearance
      if (appearanceIndex === 0) {
        await prisma.character.update({
          where: { id: characterId },
          data: { imageUrl },
        });
      }

      return NextResponse.json(updated);
    }

    // Select candidate
    if (typeof selectedIndex !== "number" || selectedIndex < 0 || selectedIndex >= candidates.length) {
      throw new ApiError("INVALID_PARAMS", "Invalid selectedIndex", 400);
    }

    const updated = await prisma.characterAppearance.update({
      where: { id: appearance.id },
      data: {
        selectedIndex,
        imageUrl: candidates[selectedIndex],
      },
    });

    // Update character's main imageUrl if primary appearance
    if (appearanceIndex === 0) {
      await prisma.character.update({
        where: { id: characterId },
        data: { imageUrl: candidates[selectedIndex] },
      });
    }

    return NextResponse.json(updated);
  }

  if (type === "location") {
    const { locationId } = body;
    if (!locationId) {
      throw new ApiError("INVALID_PARAMS", "locationId required", 400);
    }

    const location = await prisma.location.findFirst({
      where: { id: locationId, userId: auth.user.id },
    });
    if (!location) throw new ApiError("NOT_FOUND", "Location not found", 404);

    // Location doesn't have candidateImages in schema yet, but we support
    // the endpoint for future extension. For now return the location as-is.
    return NextResponse.json(location);
  }

  throw new ApiError("INVALID_PARAMS", "type must be 'character' or 'location'", 400);
});
