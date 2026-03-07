import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { content, targetDuration, targetEpisodes, direction, analysisModelKey } = body;

  if (!content?.trim()) {
    return badRequest("content is required");
  }

  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.SMART_SPLIT,
    totalSteps: 100,
    data: {
      content: content.trim(),
      ...(targetDuration ? { targetDuration } : {}),
      ...(targetEpisodes ? { targetEpisodes: Number(targetEpisodes) } : {}),
      ...(direction ? { direction } : {}),
      ...(analysisModelKey ? { analysisModelKey } : {}),
    },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});
