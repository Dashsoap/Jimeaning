import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async () => {
  const templates = await prisma.template.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();

  const template = await prisma.template.create({
    data: {
      name: body.name,
      description: body.description,
      category: body.category || "general",
      style: body.style || "realistic",
      aspectRatio: body.aspectRatio || "16:9",
      config: body.config,
      isPublic: body.isPublic ?? true,
    },
  });

  return NextResponse.json(template, { status: 201 });
});
