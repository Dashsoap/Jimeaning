import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const templates = await prisma.template.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
