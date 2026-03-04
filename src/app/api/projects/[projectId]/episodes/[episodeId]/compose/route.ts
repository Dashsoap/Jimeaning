import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = {
  params: Promise<{ projectId: string; episodeId: string }>;
};

export const POST = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const taskId = await createTask({
    userId: auth.session.user.id,
    projectId,
    type: TaskType.COMPOSE_VIDEO,
    data: { episodeId },
  });

  return NextResponse.json({ taskId });
});

export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const composition = await prisma.composition.findUnique({
    where: { episodeId },
  });

  return NextResponse.json(composition || { status: "none" });
});

export const PUT = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();

  const composition = await prisma.composition.upsert({
    where: { episodeId },
    update: {
      bgmVolume: body.bgmVolume,
      subtitleEnabled: body.subtitleEnabled,
      subtitleStyle: body.subtitleStyle,
      transition: body.transition,
    },
    create: {
      episodeId,
      bgmVolume: body.bgmVolume,
      subtitleEnabled: body.subtitleEnabled,
      subtitleStyle: body.subtitleStyle,
      transition: body.transition,
    },
  });

  return NextResponse.json(composition);
});
