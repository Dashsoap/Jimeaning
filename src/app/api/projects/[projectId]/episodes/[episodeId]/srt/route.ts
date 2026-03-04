import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ projectId: string; episodeId: string }>;
};

export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const composition = await prisma.composition.findUnique({
    where: { episodeId },
    select: { srtContent: true },
  });

  if (!composition?.srtContent) {
    return NextResponse.json({ error: "No SRT available" }, { status: 404 });
  }

  return new Response(composition.srtContent, {
    headers: {
      "Content-Type": "application/x-subrip",
      "Content-Disposition": `attachment; filename="episode_${episodeId}.srt"`,
    },
  });
});
