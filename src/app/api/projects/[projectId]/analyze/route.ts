import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
import { getModelsByType } from "@/lib/api-config";

type RouteParams = { params: Promise<{ projectId: string }> };

export const POST = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const llmModels = await getModelsByType(auth.session.user.id, "llm");
  if (llmModels.length === 0) {
    return badRequest("请先在设置页配置 LLM 模型");
  }

  const taskId = await createTask({
    userId: auth.session.user.id,
    projectId,
    type: TaskType.ANALYZE_SCRIPT,
    data: {},
  });

  return NextResponse.json({ taskId });
});
