import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
import { getModelsByType } from "@/lib/api-config";

type RouteParams = { params: Promise<{ projectId: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const generateType = body.type || "image"; // "image" | "video" | "both"

  // Pre-validate: check user has the required models configured
  if (generateType === "image" || generateType === "both") {
    const imageModels = await getModelsByType(auth.session.user.id, "image");
    if (imageModels.length === 0) {
      return badRequest("请先在设置页配置图片生成模型（如 gpt-image-1、dall-e-3）");
    }
  }
  if (generateType === "video" || generateType === "both") {
    const videoModels = await getModelsByType(auth.session.user.id, "video");
    if (videoModels.length === 0) {
      return badRequest("请先在设置页配置视频生成模型");
    }
  }

  // Get all panels for the project
  const panels = await prisma.panel.findMany({
    where: {
      clip: {
        episode: { projectId },
      },
    },
    select: { id: true, imageUrl: true },
  });

  const taskIds: string[] = [];

  for (const panel of panels) {
    if (generateType === "image" || generateType === "both") {
      if (!panel.imageUrl) {
        const taskId = await createTask({
          userId: auth.session.user.id,
          projectId,
          type: TaskType.GENERATE_PANEL_IMAGE,
          data: { panelId: panel.id },
        });
        taskIds.push(taskId);
      }
    }

    if (generateType === "video" || generateType === "both") {
      if (panel.imageUrl) {
        const taskId = await createTask({
          userId: auth.session.user.id,
          projectId,
          type: TaskType.GENERATE_PANEL_VIDEO,
          data: { panelId: panel.id },
        });
        taskIds.push(taskId);
      }
    }
  }

  return NextResponse.json({ taskIds, count: taskIds.length });
});
