import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ taskId: string }> };

export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { taskId } = await params;

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: auth.user.id },
    select: {
      id: true,
      type: true,
      status: true,
      progress: true,
      totalSteps: true,
      error: true,
      result: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(task);
});
