import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { scriptId, prompt } = await req.json();

  if (!scriptId || !prompt) {
    return badRequest("scriptId and prompt are required");
  }

  // Verify script exists and belongs to user
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: auth.user.id },
  });

  if (!script) return notFound("Script");

  // Create task
  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.REWRITE_SCRIPT,
    data: {
      scriptId,
      rewritePrompt: prompt,
    },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});
