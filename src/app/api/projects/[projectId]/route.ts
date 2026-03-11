import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.session.user.id },
    include: {
      episodes: {
        include: {
          clips: {
            include: {
              panels: {
                include: { voiceLines: true },
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
          composition: { select: { id: true, outputUrl: true, status: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      characters: true,
      locations: true,
    },
  });

  // Replace base64 data URLs with proxy URLs to reduce response size
  if (project?.episodes) {
    for (const ep of project.episodes) {
      for (const clip of ep.clips) {
        for (const panel of clip.panels) {
          if (panel.imageUrl?.startsWith("data:")) {
            panel.imageUrl = `/api/panels/${panel.id}/image`;
          }
        }
      }
    }
  }

  return NextResponse.json(project);
});

export const PUT = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const data = await req.json();

  await prisma.project.update({
    where: { id: projectId },
    data: {
      title: data.title,
      description: data.description,
      sourceText: data.sourceText,
      style: data.style,
      aspectRatio: data.aspectRatio,
    },
  });

  return NextResponse.json({ success: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  await prisma.project.delete({
    where: { id: projectId },
  });

  return NextResponse.json({ success: true });
});
