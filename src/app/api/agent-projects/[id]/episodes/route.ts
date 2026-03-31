import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** GET /api/agent-projects/:id/episodes — list all episodes with full data */
export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  // Verify ownership and get sourceText for slicing
  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true, sourceText: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const episodes = await prisma.agentEpisode.findMany({
    where: { agentProjectId: id },
    orderBy: { episodeNumber: "asc" },
  });

  // Attach sourceTextSection for each episode that has sourceStart/sourceEnd
  const enriched = episodes.map((ep) => {
    let sourceTextSection: string | null = null;
    if (project.sourceText && ep.sourceStart != null && ep.sourceEnd != null) {
      sourceTextSection = project.sourceText.slice(ep.sourceStart, ep.sourceEnd);
    }
    return { ...ep, sourceTextSection };
  });

  return NextResponse.json(enriched);
});
