import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type Params = { params: Promise<{ id: string; episodeNumber: string }> };

/** POST — trigger script writing for an episode. Accepts optional feedback for rewrite. */
export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id, episodeNumber: epStr } = await params;
  const episodeNumber = parseInt(epStr, 10);

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Optional: user feedback for rewrite
  let feedback: string | undefined;
  try {
    const body = await req.json();
    feedback = body.feedback as string | undefined;
  } catch {
    // No body or invalid JSON — that's fine, normal write
  }

  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.AGENT_WRITE,
    totalSteps: 100,
    data: { agentProjectId: id, episodeNumber, ...(feedback ? { userFeedback: feedback } : {}) },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});
