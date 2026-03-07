import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = { params: Promise<{ projectId: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const sourcePanelId = typeof body?.panelId === "string" ? body.panelId.trim() : "";
  const variant = body?.variant;

  if (!sourcePanelId) {
    throw new ApiError("INVALID_PARAMS", "panelId is required", 400);
  }
  if (!variant || !variant.description) {
    throw new ApiError("INVALID_PARAMS", "variant with description is required", 400);
  }

  // Verify source panel belongs to project and get context
  const sourcePanel = await prisma.panel.findFirst({
    where: { id: sourcePanelId, clip: { episode: { projectId } } },
    include: { clip: true },
  });
  if (!sourcePanel) {
    throw new ApiError("NOT_FOUND", "Panel not found", 404);
  }

  // Create new panel and re-index in a transaction
  const newPanel = await prisma.$transaction(async (tx) => {
    // Shift all panels after the source panel's sortOrder
    await tx.panel.updateMany({
      where: {
        clipId: sourcePanel.clipId,
        sortOrder: { gt: sourcePanel.sortOrder },
      },
      data: { sortOrder: { increment: 1 } },
    });

    // Create new panel right after the source
    return tx.panel.create({
      data: {
        clipId: sourcePanel.clipId,
        sortOrder: sourcePanel.sortOrder + 1,
        sceneDescription: variant.description || sourcePanel.sceneDescription,
        cameraAngle: variant.shot_type || sourcePanel.cameraAngle,
        durationMs: sourcePanel.durationMs,
      },
    });
  });

  // Submit async task for image generation
  const taskId = await createTask({
    userId: auth.session.user.id,
    projectId,
    type: TaskType.PANEL_VARIANT,
    data: {
      newPanelId: newPanel.id,
      sourcePanelId,
      variant: {
        description: variant.description,
        shot_type: variant.shot_type || "",
        camera_move: variant.camera_move || "",
      },
    },
  });

  return NextResponse.json({ taskId, panelId: newPanel.id });
});
