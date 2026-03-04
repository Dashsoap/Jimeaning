import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = {
  params: Promise<{ projectId: string; voiceLineId: string }>;
};

export const POST = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, voiceLineId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const taskId = await createTask({
    userId: auth.session.user.id,
    projectId,
    type: TaskType.GENERATE_VOICE_LINE,
    data: { voiceLineId },
  });

  return NextResponse.json({ taskId });
});
