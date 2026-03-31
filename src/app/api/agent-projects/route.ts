import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/agent-projects — list user's agent projects */
export const GET = apiHandler(async () => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const projects = await prisma.agentProject.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      episodes: {
        orderBy: { episodeNumber: "asc" },
        select: {
          id: true,
          episodeNumber: true,
          title: true,
          status: true,
          reviewScore: true,
          rewriteAttempt: true,
          reflectionData: true,
          chapterNotes: true,
          similarityScore: true,
        },
      },
    },
  });

  // Auto-heal stuck projects: if status is busy but no running task exists
  const busyStatuses = ["analyzing", "planning", "writing", "reviewing", "storyboarding", "imaging"];
  const stuckProjects = projects.filter(
    (p) => busyStatuses.includes(p.status) && Date.now() - new Date(p.updatedAt).getTime() > 5 * 60 * 1000,
  );

  if (stuckProjects.length > 0) {
    // Check if any tasks are actually running for these projects
    const runningTasks = await prisma.task.findMany({
      where: {
        userId: auth.user.id,
        status: { in: ["pending", "running"] },
      },
      select: { payload: true },
    });
    const activeProjectIds = new Set(
      runningTasks
        .map((t) => (t.payload as Record<string, unknown> | null)?.agentProjectId as string)
        .filter(Boolean),
    );

    for (const p of stuckProjects) {
      if (activeProjectIds.has(p.id)) continue; // Actually running, not stuck

      // Derive correct status
      let newStatus = "created";
      if (p.analysisData) newStatus = "analyzed";
      if (p.planningData && p.episodes.length > 0) newStatus = "planned";
      if (p.rewriteStrategy && !p.strategyConfirmed) newStatus = "strategy-designed";
      if (p.rewriteStrategy && p.strategyConfirmed) newStatus = "strategy-confirmed";
      if (p.episodes.length > 0 && p.episodes.every((e) => e.status === "completed")) newStatus = "completed";

      await prisma.agentProject.update({
        where: { id: p.id },
        data: { status: newStatus, currentStep: null },
      });
      p.status = newStatus;
    }
  }

  return NextResponse.json(projects);
});

/** POST /api/agent-projects — create a new agent project */
export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { title, sourceText, durationPerEp, autoMode, outputFormat, rewriteIntensity, preserveDimensions, orchestratorModelKey } = body;

  if (!title?.trim()) return badRequest("title is required");
  if (!sourceText?.trim()) return badRequest("sourceText is required");

  // Validate rewrite controls
  const intensity = typeof rewriteIntensity === "number" ? Math.min(5, Math.max(1, Math.round(rewriteIntensity))) : 3;
  const validDimensions = ["plot", "dialogue", "narrative", "description", "emotion"];
  const dimensions = Array.isArray(preserveDimensions)
    ? preserveDimensions.filter((d: string) => validDimensions.includes(d))
    : undefined;

  const project = await prisma.agentProject.create({
    data: {
      userId: auth.user.id,
      title: title.trim(),
      sourceText: sourceText.trim(),
      durationPerEp: durationPerEp || null,
      autoMode: autoMode ?? false,
      outputFormat: outputFormat || "script",
      rewriteIntensity: intensity,
      ...(dimensions ? { preserveDimensions: dimensions } : {}),
      ...(orchestratorModelKey ? { orchestratorModelKey } : {}),
    },
  });

  return NextResponse.json(project, { status: 201 });
});
