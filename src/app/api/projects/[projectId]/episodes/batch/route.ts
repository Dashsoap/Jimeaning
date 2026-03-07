import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

interface EpisodeInput {
  title: string;
  synopsis?: string;
  sortOrder?: number;
}

export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const episodes = body?.episodes as EpisodeInput[] | undefined;
  const clearExisting = body?.clearExisting === true;

  if (!Array.isArray(episodes) || episodes.length === 0) {
    throw new ApiError("INVALID_PARAMS", "episodes array is required", 400);
  }

  if (episodes.length > 50) {
    throw new ApiError("INVALID_PARAMS", "Maximum 50 episodes per batch", 400);
  }

  // Use transaction for atomicity
  const created = await prisma.$transaction(async (tx) => {
    if (clearExisting) {
      await tx.episode.deleteMany({ where: { projectId } });
    }

    const results = [];
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const title = typeof ep.title === "string" ? ep.title.trim() : `Episode ${i + 1}`;
      const episode = await tx.episode.create({
        data: {
          projectId,
          title,
          synopsis: typeof ep.synopsis === "string" ? ep.synopsis : undefined,
          sortOrder: ep.sortOrder ?? i,
        },
      });
      results.push(episode);
    }
    return results;
  });

  return NextResponse.json({ episodes: created, count: created.length }, { status: 201 });
});
