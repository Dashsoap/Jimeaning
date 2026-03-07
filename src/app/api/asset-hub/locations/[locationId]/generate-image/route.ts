import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = { params: Promise<{ locationId: string }> };

export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { locationId } = await params;

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : undefined;

  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.IMAGE_LOCATION,
    data: { locationId, prompt },
    totalSteps: 100,
  });

  return NextResponse.json({ taskId }, { status: 202 });
});
