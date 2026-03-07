import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string; episodeId: string }> };

// GET: Single episode with clips and panels
export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
    include: {
      clips: {
        orderBy: { sortOrder: "asc" },
        include: {
          panels: {
            orderBy: { sortOrder: "asc" },
            include: { voiceLines: true },
          },
        },
      },
      composition: true,
    },
  });
  if (!episode) throw new ApiError("NOT_FOUND", "Episode not found", 404);

  return NextResponse.json(episode);
});

// PATCH: Update episode fields
export const PATCH = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const existing = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Episode not found", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.synopsis === "string") data.synopsis = body.synopsis;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (typeof body.status === "string") data.status = body.status;

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data,
  });

  return NextResponse.json(updated);
});

// DELETE: Remove an episode (cascades to clips, panels, voice lines)
export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const existing = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Episode not found", 404);

  await prisma.episode.delete({ where: { id: episodeId } });

  return NextResponse.json({ success: true });
});
