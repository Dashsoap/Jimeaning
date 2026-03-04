import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = {
  params: Promise<{ projectId: string; episodeId: string }>;
};

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, episodeId } = await params;

  const taskId = await createTask({
    userId: session.user.id,
    projectId,
    type: TaskType.COMPOSE_VIDEO,
    data: { episodeId },
  });

  return NextResponse.json({ taskId });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await params;

  const composition = await prisma.composition.findUnique({
    where: { episodeId },
  });

  return NextResponse.json(composition || { status: "none" });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await params;
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
}
