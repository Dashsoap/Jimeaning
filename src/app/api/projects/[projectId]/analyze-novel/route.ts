import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = { params: Promise<{ projectId: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    throw new ApiError("INVALID_PARAMS", "content is required", 400);
  }

  const taskId = await createTask({
    userId: auth.session.user.id,
    projectId,
    type: TaskType.ANALYZE_NOVEL,
    data: { content },
    totalSteps: 100,
  });

  return NextResponse.json({ taskId }, { status: 202 });
});
