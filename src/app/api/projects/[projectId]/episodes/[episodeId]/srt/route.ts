import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ projectId: string; episodeId: string }>;
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await params;

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
}
