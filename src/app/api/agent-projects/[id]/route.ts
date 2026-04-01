import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** GET /api/agent-projects/:id — get project with episodes */
export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
    include: {
      episodes: { orderBy: { episodeNumber: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
});

/** PATCH /api/agent-projects/:id — reset stuck project status based on actual episode states */
export const PATCH = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
    include: { episodes: { orderBy: { episodeNumber: "asc" } } },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Determine correct status from episode states
  let newStatus = "created";
  if (project.analysisData) newStatus = "analyzed";
  if (project.planningData && project.episodes.length > 0) newStatus = "planned";

  const allDone = project.episodes.length > 0 && project.episodes.every((e) => e.status === "completed" || e.status === "similarity-failed");
  if (allDone) newStatus = "completed";

  await prisma.agentProject.update({
    where: { id },
    data: { status: newStatus, currentStep: null },
  });

  return NextResponse.json({ status: newStatus });
});

/** DELETE /api/agent-projects/:id */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  await prisma.agentEpisode.deleteMany({ where: { agentProjectId: id } });
  await prisma.agentProject.deleteMany({
    where: { id, userId: auth.user.id },
  });

  return NextResponse.json({ ok: true });
});
