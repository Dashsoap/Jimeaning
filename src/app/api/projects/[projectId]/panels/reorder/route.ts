import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

// POST: Batch reorder panels within a clip
// Body: { clipId: string, panelIds: string[] }
export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const clipId = body?.clipId as string;
  const panelIds = body?.panelIds as string[];

  if (!clipId || !Array.isArray(panelIds) || panelIds.length === 0) {
    throw new ApiError("INVALID_PARAMS", "clipId and panelIds[] are required", 400);
  }

  // Verify clip belongs to project
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, episode: { projectId } },
  });
  if (!clip) throw new ApiError("NOT_FOUND", "Clip not found", 404);

  // Update sortOrder in transaction
  await prisma.$transaction(
    panelIds.map((id, index) =>
      prisma.panel.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  return NextResponse.json({ success: true, count: panelIds.length });
});
