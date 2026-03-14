import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** GET /api/agent-projects/:id/full-text — get all episodes' scripts as structured chapters */
export const GET = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  const project = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
    select: {
      id: true,
      title: true,
      sourceText: true,
      outputFormat: true,
      episodes: {
        orderBy: { episodeNumber: "asc" },
        select: {
          episodeNumber: true,
          title: true,
          script: true,
          reviewScore: true,
          rewriteAttempt: true,
          status: true,
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const chapters = project.episodes
    .filter((ep) => ep.script)
    .map((ep) => ({
      number: ep.episodeNumber,
      title: ep.title || `第${ep.episodeNumber}集`,
      content: ep.script!,
      wordCount: ep.script!.length,
      reviewScore: ep.reviewScore,
      status: ep.status,
    }));

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return NextResponse.json({
    title: project.title,
    format: project.outputFormat,
    totalChapters: chapters.length,
    totalWords,
    chapters,
  });
});
