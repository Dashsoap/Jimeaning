import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");

  const assets = await prisma.asset.findMany({
    where: folderId ? { folderId } : {},
    orderBy: { createdAt: "desc" },
  });

  const folders = await prisma.assetFolder.findMany({
    where: { parentId: folderId || null },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ assets, folders });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();

  if (body.type === "folder") {
    const folder = await prisma.assetFolder.create({
      data: {
        name: body.name,
        parentId: body.parentId || null,
      },
    });
    return NextResponse.json(folder, { status: 201 });
  }

  const asset = await prisma.asset.create({
    data: {
      name: body.name,
      type: body.assetType || "image",
      url: body.url,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      folderId: body.folderId || null,
    },
  });

  return NextResponse.json(asset, { status: 201 });
});
