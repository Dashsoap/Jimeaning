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

  // Create project from script content
  const project = await prisma.project.create({
    data: {
      userId: auth.user.id,
      title: script.title,
      sourceText: script.content,
    },
  });

  return NextResponse.json({ projectId: project.id }, { status: 201 });
});
