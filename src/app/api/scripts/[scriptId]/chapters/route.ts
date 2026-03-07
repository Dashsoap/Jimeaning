import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ scriptId: string }>;
}

export const GET = apiHandler(async (_req: NextRequest, ctx: RouteContext) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { scriptId } = await ctx.params;

  // Verify ownership of master script
  const masterScript = await prisma.script.findFirst({
    where: { id: scriptId, userId: auth.user.id },
  });
  if (!masterScript) return notFound("Script");

  const chapters = await prisma.script.findMany({
    where: { masterScriptId: scriptId, userId: auth.user.id },
    orderBy: { chapterIndex: "asc" },
    select: {
      id: true,
      title: true,
      content: true,
      chapterIndex: true,
      chapterSummary: true,
      sourceType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(chapters);
});

export const POST = apiHandler(async (req: NextRequest, ctx: RouteContext) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { scriptId } = await ctx.params;

  // Verify ownership
  const masterScript = await prisma.script.findFirst({
    where: { id: scriptId, userId: auth.user.id },
  });
  if (!masterScript) return notFound("Script");

  const body = await req.json();
  const { chapters } = body;

  if (!Array.isArray(chapters) || chapters.length === 0) {
    return badRequest("chapters array is required");
  }

  // Delete existing chapters and recreate
  await prisma.script.deleteMany({
    where: { masterScriptId: scriptId, userId: auth.user.id },
  });

  const created = await Promise.all(
    chapters.map(
      (ch: { title: string; content: string; summary?: string }, idx: number) =>
        prisma.script.create({
          data: {
            userId: auth.user.id,
            title: ch.title,
            content: ch.content,
            sourceType: "chapter",
            chapterIndex: idx + 1,
            chapterSummary: ch.summary || null,
            masterScriptId: scriptId,
          },
        }),
    ),
  );

  return NextResponse.json({ count: created.length }, { status: 201 });
});
