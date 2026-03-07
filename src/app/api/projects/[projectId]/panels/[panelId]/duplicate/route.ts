import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string; panelId: string }> };

// POST: Duplicate a panel (copies all fields except media URLs)
export const POST = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, panelId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const source = await prisma.panel.findFirst({
    where: { id: panelId, clip: { episode: { projectId } } },
  });
  if (!source) throw new ApiError("NOT_FOUND", "Panel not found", 404);

  // Shift subsequent panels
  const newPanel = await prisma.$transaction(async (tx) => {
    await tx.panel.updateMany({
      where: { clipId: source.clipId, sortOrder: { gt: source.sortOrder } },
      data: { sortOrder: { increment: 1 } },
    });

    return tx.panel.create({
      data: {
        clipId: source.clipId,
        sceneDescription: source.sceneDescription,
        cameraAngle: source.cameraAngle,
        imagePrompt: source.imagePrompt,
        durationMs: source.durationMs,
        sortOrder: source.sortOrder + 1,
        // Don't copy imageUrl/videoUrl — user must regenerate
      },
    });
  });

  return NextResponse.json(newPanel, { status: 201 });
});
