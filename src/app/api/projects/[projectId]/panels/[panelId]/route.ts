import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
import { getModelsByType } from "@/lib/api-config";

type RouteParams = { params: Promise<{ projectId: string; panelId: string }> };

/** Verify panel belongs to project, return it or throw */
async function findProjectPanel(panelId: string, projectId: string) {
  const panel = await prisma.panel.findFirst({
    where: { id: panelId, clip: { episode: { projectId } } },
  });
  if (!panel) throw new ApiError("NOT_FOUND", "Panel not found", 404);
  return panel;
}

// GET: Single panel details
export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, panelId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const panel = await prisma.panel.findFirst({
    where: { id: panelId, clip: { episode: { projectId } } },
    include: { voiceLines: true },
  });
  if (!panel) throw new ApiError("NOT_FOUND", "Panel not found", 404);

  return NextResponse.json(panel);
});

// PATCH: Update panel fields (sceneDescription, cameraAngle, imagePrompt, durationMs, sortOrder)
export const PATCH = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, panelId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  await findProjectPanel(panelId, projectId);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.sceneDescription === "string") data.sceneDescription = body.sceneDescription;
  if (typeof body.cameraAngle === "string") data.cameraAngle = body.cameraAngle;
  if (typeof body.imagePrompt === "string") data.imagePrompt = body.imagePrompt;
  if (typeof body.durationMs === "number") data.durationMs = body.durationMs;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const updated = await prisma.panel.update({
    where: { id: panelId },
    data,
  });

  return NextResponse.json(updated);
});

// DELETE: Remove a panel
export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, panelId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  await findProjectPanel(panelId, projectId);
  await prisma.panel.delete({ where: { id: panelId } });

  return NextResponse.json({ success: true });
});

// POST: regenerate image/video for a single panel
export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, panelId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const type = body.type || "image"; // "image" | "video"

  const panel = await findProjectPanel(panelId, projectId);

  if (type === "image") {
    const imageModels = await getModelsByType(auth.session.user.id, "image");
    if (imageModels.length === 0) {
      return badRequest("请先在设置页配置图片生成模型");
    }

    await prisma.panel.update({
      where: { id: panelId },
      data: { imageUrl: null, imagePrompt: null },
    });

    const taskId = await createTask({
      userId: auth.session.user.id,
      projectId,
      type: TaskType.GENERATE_PANEL_IMAGE,
      data: { panelId },
    });

    return NextResponse.json({ taskId });
  }

  if (type === "video") {
    const videoModels = await getModelsByType(auth.session.user.id, "video");
    if (videoModels.length === 0) {
      return badRequest("请先在设置页配置视频生成模型");
    }
    if (!panel.imageUrl) {
      return badRequest("请先生成图片再生成视频");
    }

    const taskId = await createTask({
      userId: auth.session.user.id,
      projectId,
      type: TaskType.GENERATE_PANEL_VIDEO,
      data: { panelId },
    });

    return NextResponse.json({ taskId });
  }

  return badRequest("type 必须是 image 或 video");
});
