import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const STALE_TASK_MS = 10 * 60 * 1000; // 10 minutes — task is considered dead

/**
 * GET /api/scripts/smart-import/resume
 * Check if there's a resumable smart import for the current user.
 * Returns the latest import script with its chapters and any active tasks.
 */
export const GET = apiHandler(async () => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const userId = auth.user.id;

  // Find the latest import-type script (created in the last 7 days)
  const masterScript = await prisma.script.findFirst({
    where: {
      userId,
      sourceType: "import",
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      importMeta: true,
      createdAt: true,
    },
  });

  if (!masterScript) {
    return NextResponse.json({ resumable: false });
  }

  // Get chapters
  const chapters = await prisma.script.findMany({
    where: { masterScriptId: masterScript.id, userId },
    orderBy: { chapterIndex: "asc" },
    select: {
      id: true,
      title: true,
      content: true,
      chapterIndex: true,
      chapterSummary: true,
    },
  });

  if (chapters.length === 0) {
    return NextResponse.json({ resumable: false });
  }

  // Check how many chapters have been rewritten
  const rewrittenCount = await prisma.script.count({
    where: {
      parentId: { in: chapters.map((c) => c.id) },
      sourceType: "rewrite",
      userId,
    },
  });

  // Check for active BATCH_REWRITE task
  const activeTask = await prisma.task.findFirst({
    where: {
      userId,
      type: { in: ["SMART_SPLIT", "BATCH_REWRITE"] },
      status: { in: ["pending", "running"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      heartbeatAt: true,
      updatedAt: true,
    },
  });

  if (!activeTask) {
    // No active task — don't auto-resume
    return NextResponse.json({ resumable: false });
  }

  // Check if the task is stale (no heartbeat / no update for 10 min)
  const lastAlive = activeTask.heartbeatAt || activeTask.updatedAt;
  const isStale = Date.now() - new Date(lastAlive).getTime() > STALE_TASK_MS;

  if (isStale) {
    // Force-cancel the stale task so it doesn't block future imports
    await prisma.task.update({
      where: { id: activeTask.id },
      data: { status: "failed", error: "Task timed out (stale)", finishedAt: new Date() },
    });
    return NextResponse.json({ resumable: false });
  }

  // Determine resumable step
  let step: number;
  if (activeTask.type === "SMART_SPLIT") {
    step = 3; // Analysis in progress
  } else {
    step = 5; // Rewrite in progress
  }

  return NextResponse.json({
    resumable: true,
    masterScriptId: masterScript.id,
    masterTitle: masterScript.title,
    importMeta: masterScript.importMeta,
    createdAt: masterScript.createdAt,
    step,
    totalChapters: chapters.length,
    rewrittenCount,
    activeTaskId: activeTask?.id || null,
    activeTaskType: activeTask?.type || null,
    chapters: chapters.map((ch) => ({
      index: ch.chapterIndex ?? 0,
      title: ch.title,
      summary: ch.chapterSummary || "",
      content: ch.content,
      startPos: 0,
      endPos: ch.content.length,
    })),
  });
});
