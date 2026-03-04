import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ projectId: string; characterId: string }>;
};

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, characterId } = await params;
  const body = await req.json();

  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const character = await prisma.character.update({
    where: { id: characterId },
    data: {
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      voiceProvider: body.voiceProvider,
      voiceId: body.voiceId,
      voiceSample: body.voiceSample,
    },
  });

  return NextResponse.json(character);
}
