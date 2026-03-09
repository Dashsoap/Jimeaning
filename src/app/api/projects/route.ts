import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async () => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const projects = await prisma.project.findMany({
    where: { userId: auth.user.id, parentId: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { episodes: true, childProjects: true } },
      episodes: {
        select: {
          clips: {
            select: {
              panels: {
                select: { imageUrl: true, videoUrl: true },
              },
            },
          },
        },
      },
    },
  });

  // Aggregate stats on server side to keep response payload small
  const result = projects.map((p) => {
    let imageCount = 0;
    let videoCount = 0;
    for (const ep of p.episodes) {
      for (const clip of ep.clips) {
        for (const panel of clip.panels) {
          if (panel.imageUrl) imageCount++;
          if (panel.videoUrl) videoCount++;
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { episodes: _episodes, ...rest } = p;
    return { ...rest, imageCount, videoCount };
  });

  return NextResponse.json(result);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { title, description, style, aspectRatio } = await req.json();

  if (!title) {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: {
      userId: auth.user.id,
      title,
      description,
      style: style || "realistic",
      aspectRatio: aspectRatio || "16:9",
    },
  });

  return NextResponse.json(project, { status: 201 });
});
