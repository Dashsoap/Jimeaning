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
  const panelId = typeof body?.panelId === "string" ? body.panelId.trim() : "";

  if (!panelId) {
    throw new ApiError("INVALID_PARAMS", "panelId is required", 400);
  }

  // Verify panel belongs to project
  const panel = await prisma.panel.findFirst({
    where: { id: panelId, clip: { episode: { projectId } } },
  });
  if (!panel) {
    throw new ApiError("NOT_FOUND", "Panel not found", 404);
  }

  const taskId = await createTask({
    userId: auth.session.user.id,
    projectId,
    type: TaskType.ANALYZE_SHOT_VARIANTS,
    data: { panelId },
  });

  return NextResponse.json({ taskId });
});
