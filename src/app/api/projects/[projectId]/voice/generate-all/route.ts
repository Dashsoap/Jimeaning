import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  // Find all voice lines without audio
  const voiceLines = await prisma.voiceLine.findMany({
    where: {
      audioUrl: null,
      panel: {
        clip: {
          episode: { projectId },
        },
      },
    },
    select: { id: true },
  });

  const taskIds: string[] = [];
  for (const vl of voiceLines) {
    const taskId = await createTask({
      userId: session.user.id,
      projectId,
      type: TaskType.GENERATE_VOICE_LINE,
      data: { voiceLineId: vl.id },
    });
    taskIds.push(taskId);
  }

  return NextResponse.json({ taskIds, count: taskIds.length });
}
