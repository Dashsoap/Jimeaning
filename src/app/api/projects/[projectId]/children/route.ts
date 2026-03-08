import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const children = await prisma.project.findMany({
    where: { parentId: projectId, userId: auth.session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { episodes: true } },
    },
  });

  return NextResponse.json(children);
});
