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
    },
  });

  if (projects.length === 0) {
    return NextResponse.json([]);
  }

  // Aggregate image/video counts via raw SQL instead of fetching all panels
  const projectIds = projects.map((p) => p.id);
  const counts = await prisma.$queryRawUnsafe<
    Array<{ projectId: string; imageCount: bigint; videoCount: bigint }>
  >(
    `SELECT e.projectId,
            SUM(CASE WHEN p.imageUrl IS NOT NULL AND p.imageUrl != '' THEN 1 ELSE 0 END) AS imageCount,
            SUM(CASE WHEN p.videoUrl IS NOT NULL AND p.videoUrl != '' THEN 1 ELSE 0 END) AS videoCount
     FROM panels p
     JOIN clips c ON p.clipId = c.id
     JOIN episodes e ON c.episodeId = e.id
     WHERE e.projectId IN (${projectIds.map(() => "?").join(",")})
     GROUP BY e.projectId`,
    ...projectIds,
  );

  const countMap = new Map(
    counts.map((c) => [c.projectId, { imageCount: Number(c.imageCount), videoCount: Number(c.videoCount) }]),
  );

  const result = projects.map((p) => ({
    ...p,
    imageCount: countMap.get(p.id)?.imageCount ?? 0,
    videoCount: countMap.get(p.id)?.videoCount ?? 0,
  }));

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
