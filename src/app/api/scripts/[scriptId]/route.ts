import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, ctx) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { scriptId } = await ctx.params;

  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: auth.user.id },
    include: {
      parent: { select: { id: true, title: true } },
      children: { select: { id: true, title: true, createdAt: true } },
    },
  });

  if (!script) return notFound("Script");

  return NextResponse.json(script);
});

export const PUT = apiHandler(async (req: NextRequest, ctx) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { scriptId } = await ctx.params;
  const { title, content } = await req.json();

  const existing = await prisma.script.findFirst({
    where: { id: scriptId, userId: auth.user.id },
  });

  if (!existing) return notFound("Script");

  const updated = await prisma.script.update({
    where: { id: scriptId },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { scriptId } = await ctx.params;

  const existing = await prisma.script.findFirst({
    where: { id: scriptId, userId: auth.user.id },
  });

  if (!existing) return notFound("Script");

  await prisma.script.delete({ where: { id: scriptId } });

  return NextResponse.json({ success: true });
});
