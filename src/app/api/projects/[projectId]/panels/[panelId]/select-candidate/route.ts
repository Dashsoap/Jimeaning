import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string; panelId: string }> };

/** PATCH: Select a candidate image by index */
export const PATCH = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, panelId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const selectedIndex = body.selectedIndex;

  if (typeof selectedIndex !== "number" || selectedIndex < 0) {
    return badRequest("selectedIndex must be a non-negative number");
  }

  const panel = await prisma.panel.findFirst({
    where: { id: panelId, clip: { episode: { projectId } } },
  });
  if (!panel) throw new ApiError("NOT_FOUND", "Panel not found", 404);

  if (!panel.candidateImages) {
    return badRequest("Panel has no candidate images");
  }

  let candidates: string[];
  try {
    candidates = JSON.parse(panel.candidateImages);
  } catch {
    return badRequest("Invalid candidateImages data");
  }

  if (selectedIndex >= candidates.length) {
    return badRequest(`selectedIndex out of range (max ${candidates.length - 1})`);
  }

  await prisma.panel.update({
    where: { id: panelId },
    data: {
      imageUrl: candidates[selectedIndex],
      selectedImageIndex: selectedIndex,
    },
  });

  return NextResponse.json({ success: true, imageUrl: candidates[selectedIndex] });
});
