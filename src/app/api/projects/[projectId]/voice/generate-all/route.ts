import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = { params: Promise<{ projectId: string }> };

export const POST = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

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
