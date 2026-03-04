import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
import { getModelsByType } from "@/lib/api-config";

type RouteParams = { params: Promise<{ projectId: string; panelId: string }> };

// POST: regenerate image/video for a single panel
export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, panelId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const type = body.type || "image"; // "image" | "video"

  // Verify panel belongs to this project
  const panel = await prisma.panel.findFirst({
    where: {
      id: panelId,
      clip: { episode: { projectId } },
    },
  });
  if (!panel) {
    return badRequest("面板不存在");
  }

  if (type === "image") {
    const imageModels = await getModelsByType(auth.session.user.id, "image");
    if (imageModels.length === 0) {
      return badRequest("请先在设置页配置图片生成模型");
    }

    // Clear existing image so the worker regenerates it
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
