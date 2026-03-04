import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
