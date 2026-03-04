import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

type RouteParams = { params: Promise<{ projectId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  const taskId = await createTask({
    userId: session.user.id,
    projectId,
    type: TaskType.ANALYZE_SCRIPT,
    data: {},
  });

  return NextResponse.json({ taskId });
}
