import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const POST = apiHandler(async (_req: NextRequest, ctx) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { scriptId } = await ctx.params;

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: auth.user.id },
  });

  if (!script) return notFound("Script");

  // Import-type master script: create parent project + child projects per chapter
  if (script.sourceType === "import") {
    // Check if a project already exists for this master script
    const existing = await prisma.project.findFirst({
      where: { masterScriptId: script.id, userId: auth.user.id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "projectAlreadyExists", projectId: existing.id },
        { status: 409 },
      );
    }

    // Find all chapters under this master, sorted by chapterIndex
    const chapters = await prisma.script.findMany({
      where: { masterScriptId: script.id, sourceType: "chapter" },
      orderBy: { chapterIndex: "asc" },
      include: {
        children: {
          where: { sourceType: "rewrite" },
          orderBy: { createdAt: "desc" },
          take: 1, // latest rewrite
        },
      },
    });

    // Create parent + child projects in a transaction
    const parentProject = await prisma.$transaction(async (tx) => {
      const parent = await tx.project.create({
        data: {
          userId: auth.user.id,
          title: script.title,
          masterScriptId: script.id,
        },
      });

      // Create a child project for each chapter (prefer rewrite content)
      for (const ch of chapters) {
        const rewrite = ch.children[0]; // latest rewrite if exists
        const source = rewrite ?? ch;
        await tx.project.create({
          data: {
            userId: auth.user.id,
            title: source.title,
            sourceText: source.content,
            parentId: parent.id,
          },
        });
      }

      return parent;
    });

    return NextResponse.json({ projectId: parentProject.id }, { status: 201 });
  }

  // Default behavior: create a single project from script content
  const project = await prisma.project.create({
    data: {
      userId: auth.user.id,
      title: script.title,
      sourceText: script.content,
    },
  });

  return NextResponse.json({ projectId: project.id }, { status: 201 });
});
