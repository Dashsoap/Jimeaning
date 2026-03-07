import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

// GET: List episodes for a project
export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const episodes = await prisma.episode.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { clips: true } },
    },
  });

  return NextResponse.json(episodes);
});

// POST: Create a new episode
export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    throw new ApiError("INVALID_PARAMS", "title is required", 400);
  }

  // Get next sortOrder
  const last = await prisma.episode.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const episode = await prisma.episode.create({
    data: {
      projectId,
      title,
      synopsis: typeof body.synopsis === "string" ? body.synopsis : undefined,
      sortOrder,
    },
  });

  return NextResponse.json(episode, { status: 201 });
});
