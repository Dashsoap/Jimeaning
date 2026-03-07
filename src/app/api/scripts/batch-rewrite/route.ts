import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { masterScriptId, rewritePrompt, modelKey } = body;

  if (!masterScriptId) {
    return badRequest("masterScriptId is required");
  }
  if (!rewritePrompt?.trim()) {
    return badRequest("rewritePrompt is required");
  }

  // Verify ownership
  const masterScript = await prisma.script.findFirst({
    where: { id: masterScriptId, userId: auth.user.id },
  });
  if (!masterScript) return notFound("Script");

  // Verify it has chapters
  const chapterCount = await prisma.script.count({
    where: { masterScriptId, userId: auth.user.id },
  });
  if (chapterCount === 0) {
    return badRequest("No chapters found for this script");
  }

  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.BATCH_REWRITE,
    totalSteps: 100,
    data: {
      masterScriptId,
      rewritePrompt: rewritePrompt.trim(),
      ...(modelKey ? { modelKey } : {}),
    },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});
