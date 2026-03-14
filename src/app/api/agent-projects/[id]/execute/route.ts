import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type Params = { params: Promise<{ id: string }> };

/** POST /api/agent-projects/:id/execute — trigger writing after strategy confirmation */
export const POST = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.strategyConfirmed) {
    return NextResponse.json({ error: "Strategy must be confirmed first" }, { status: 400 });
  }

  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.AGENT_AUTO,
    totalSteps: 100,
    data: { agentProjectId: id },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});
