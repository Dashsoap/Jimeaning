import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { dismissFailedTasks } from "@/lib/task/service";

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const taskIds = body.taskIds;

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    throw new ApiError("INVALID_PARAMS", "taskIds must be a non-empty array", 400);
  }

  const count = await dismissFailedTasks(taskIds, auth.user.id);
  return NextResponse.json({ dismissed: count });
});
