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
