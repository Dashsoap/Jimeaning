import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
import { getModelsByType } from "@/lib/api-config";

type RouteParams = { params: Promise<{ projectId: string }> };

export const POST = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const audioModels = await getModelsByType(auth.session.user.id, "audio");
  if (audioModels.length === 0) {
    return badRequest("请先在设置页配置语音合成模型（如 TTS-1、Fish Audio）");
  }

  // Find all voice lines without audio
  const voiceLines = await prisma.voiceLine.findMany({
    where: {
      audioUrl: null,
      panel: {
        clip: {
          episode: { projectId },
        },
      },
    },
    select: { id: true },
  });

  const taskIds: string[] = [];
  for (const vl of voiceLines) {
    const taskId = await createTask({
      userId: auth.session.user.id,
      projectId,
      type: TaskType.GENERATE_VOICE_LINE,
      data: { voiceLineId: vl.id },
    });
    taskIds.push(taskId);
  }

  return NextResponse.json({ taskIds, count: taskIds.length });
});
