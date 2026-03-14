import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type Params = { params: Promise<{ id: string }> };

/** POST /api/agent-projects/:id/strategy — trigger strategy design task */
export const POST = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.analysisData || !project.planningData) {
    return NextResponse.json({ error: "Analysis and planning must be completed first" }, { status: 400 });
  }

  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.AGENT_REWRITE_STRATEGY,
    totalSteps: 100,
    data: { agentProjectId: id },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});

/** GET /api/agent-projects/:id/strategy — get strategy for UI display */
export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
    select: {
      rewriteStrategy: true,
      strategyConfirmed: true,
      status: true,
      episodes: {
        select: { episodeNumber: true, title: true, chapterNotes: true },
        orderBy: { episodeNumber: "asc" },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    strategy: project.rewriteStrategy,
    confirmed: project.strategyConfirmed,
    status: project.status,
    episodes: project.episodes,
  });
});

/** PATCH /api/agent-projects/:id/strategy — user edits + confirms strategy */
export const PATCH = apiHandler(async (req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { strategy, confirmed, chapterNotes } = body as {
    strategy?: unknown;
    confirmed?: boolean;
    chapterNotes?: Record<string, string>;
  };

  const updateData: Record<string, unknown> = {};
  if (strategy !== undefined) updateData.rewriteStrategy = strategy;
  if (confirmed !== undefined) {
    updateData.strategyConfirmed = confirmed;
    if (confirmed) updateData.status = "strategy-confirmed";
  }

  await prisma.agentProject.update({
    where: { id },
    data: updateData,
  });

  // Update per-episode chapter notes if provided
  if (chapterNotes) {
    for (const [epNum, notes] of Object.entries(chapterNotes)) {
      await prisma.agentEpisode.updateMany({
        where: { agentProjectId: id, episodeNumber: parseInt(epNum) },
        data: { chapterNotes: notes },
      });
    }
  }

  return NextResponse.json({ ok: true });
});
