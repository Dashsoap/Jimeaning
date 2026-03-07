import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

// GET: Download project assets
// Query: ?type=images|videos|composition&episodeId=xxx
export const GET = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "images";
  const episodeId = url.searchParams.get("episodeId");

  if (type === "composition") {
    if (!episodeId) throw new ApiError("INVALID_PARAMS", "episodeId is required for composition download", 400);

    const composition = await prisma.composition.findUnique({
      where: { episodeId },
      select: { outputUrl: true, status: true },
    });

    if (!composition?.outputUrl || composition.status !== "completed") {
      throw new ApiError("NOT_FOUND", "No completed composition available", 404);
    }

    // Return redirect to the video URL
    return NextResponse.json({ url: composition.outputUrl, type: "video" });
  }

  // For images/videos, collect all panel media URLs
  const whereClause = episodeId
    ? { clip: { episode: { id: episodeId, projectId } } }
    : { clip: { episode: { projectId } } };

  const panels = await prisma.panel.findMany({
    where: whereClause,
    select: {
      id: true,
      sortOrder: true,
      imageUrl: type === "images" ? true : undefined,
      videoUrl: type === "videos" ? true : undefined,
      clip: {
        select: {
          sortOrder: true,
          episode: { select: { sortOrder: true, title: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  const items = panels
    .map((p) => ({
      panelId: p.id,
      episodeTitle: p.clip.episode.title,
      episodeOrder: p.clip.episode.sortOrder,
      clipOrder: p.clip.sortOrder,
      panelOrder: p.sortOrder,
      url: type === "images" ? (p as { imageUrl?: string }).imageUrl : (p as { videoUrl?: string }).videoUrl,
    }))
    .filter((item) => item.url);

  if (items.length === 0) {
    throw new ApiError("NOT_FOUND", `No ${type} available for download`, 404);
  }

  // Return the list of URLs with metadata for client-side download
  return NextResponse.json({
    type,
    count: items.length,
    items: items.map((item) => ({
      url: item.url,
      filename: `E${item.episodeOrder + 1}_C${item.clipOrder + 1}_P${item.panelOrder + 1}.${type === "images" ? "png" : "mp4"}`,
    })),
  });
});
