import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

type RouteParams = {
  params: Promise<{ projectId: string; episodeId: string }>;
};

const STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || "./data";

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bgmDir = join(STORAGE_PATH, "bgm");
  await mkdir(bgmDir, { recursive: true });

  const fileName = `${episodeId}_${file.name}`;
  const filePath = join(bgmDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  await prisma.composition.upsert({
    where: { episodeId },
    update: { bgmUrl: filePath },
    create: { episodeId, bgmUrl: filePath },
  });

  return NextResponse.json({ bgmUrl: filePath });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await params;

  await prisma.composition.updateMany({
    where: { episodeId },
    data: { bgmUrl: null },
  });

  return NextResponse.json({ success: true });
}
