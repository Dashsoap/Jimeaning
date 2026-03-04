import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

type RouteParams = {
  params: Promise<{ projectId: string; episodeId: string }>;
};

const STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || "./data";

export const POST = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

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
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId, episodeId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  await prisma.composition.updateMany({
    where: { episodeId },
    data: { bgmUrl: null },
  });

  return NextResponse.json({ success: true });
});
