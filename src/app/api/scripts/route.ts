import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const sourceType = searchParams.get("sourceType");

  const scripts = await prisma.script.findMany({
    where: {
      userId: auth.user.id,
      ...(sourceType && { sourceType }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      sourceType: true,
      sourceMedia: true,
      parentId: true,
      masterScriptId: true,
      chapterIndex: true,
      chapterSummary: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(scripts);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { title, content, sourceType: srcType, importMeta } = await req.json();

  if (!title || !content) {
    return NextResponse.json(
      { error: "Title and content are required" },
      { status: 400 }
    );
  }

  const script = await prisma.script.create({
    data: {
      userId: auth.user.id,
      title,
      content,
      sourceType: srcType || "manual",
      ...(importMeta ? { importMeta } : {}),
    },
  });

  return NextResponse.json(script, { status: 201 });
});
