import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { cancelTask } from "@/lib/task/service";

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
      errorCode: true,
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

export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { taskId } = await params;

  // Fetch task payload before cancelling to find agentProjectId
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: auth.user.id },
    select: { type: true, payload: true },
  });

  const result = await cancelTask(taskId, auth.user.id);

  if (!result.cancelled) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Reset AgentProject status so user can re-trigger
  if (task?.type?.startsWith("AGENT_")) {
    const payload = task.payload as Record<string, unknown> | null;
    const agentProjectId = payload?.agentProjectId as string | undefined;
    if (agentProjectId) {
      const project = await prisma.agentProject.findUnique({
        where: { id: agentProjectId },
        select: { strategyConfirmed: true, rewriteStrategy: true, planningData: true, analysisData: true },
      });
      if (project) {
        // Reset to the latest completed phase
        const status = project.strategyConfirmed
          ? "strategy-confirmed"
          : project.rewriteStrategy
            ? "strategy-designed"
            : project.planningData
              ? "planned"
              : project.analysisData
                ? "analyzed"
                : "created";
        await prisma.agentProject.update({
          where: { id: agentProjectId },
          data: { status, currentStep: null },
        });
      }
    }
  }

  return NextResponse.json({ success: true });
});
