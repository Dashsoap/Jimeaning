import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// GET: Compact list for asset picker
// ?type=character|location|voice
export const GET = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const type = req.nextUrl.searchParams.get("type");
  if (!type || !["character", "location", "voice"].includes(type)) {
    throw new ApiError("INVALID_PARAMS", "type must be character, location, or voice", 400);
  }

  if (type === "character") {
    const items = await prisma.character.findMany({
      where: { userId: auth.user.id, projectId: null },
      select: { id: true, name: true, imageUrl: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      items.map((c) => ({ id: c.id, name: c.name, previewUrl: c.imageUrl, type: "character" }))
    );
  }

  if (type === "location") {
    const items = await prisma.location.findMany({
      where: { userId: auth.user.id, projectId: null },
      select: { id: true, name: true, imageUrl: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      items.map((l) => ({ id: l.id, name: l.name, previewUrl: l.imageUrl, type: "location" }))
    );
  }

  // voice
  const items = await prisma.voice.findMany({
    where: { userId: auth.user.id },
    select: { id: true, name: true, provider: true, voiceId: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    items.map((v) => ({ id: v.id, name: v.name, previewUrl: null, type: "voice" }))
  );
});
