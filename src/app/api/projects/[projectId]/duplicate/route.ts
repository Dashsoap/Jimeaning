import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireProjectAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ projectId: string }> };

// POST: Deep-clone a project (structure only, no generated media)
export const POST = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const { projectId } = await params;
  const auth = await requireProjectAuth(projectId);
  if (isErrorResponse(auth)) return auth;

  const source = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      characters: { where: { projectId } },
      locations: { where: { projectId } },
      episodes: {
        orderBy: { sortOrder: "asc" },
        include: {
          clips: {
            orderBy: { sortOrder: "asc" },
            include: {
              panels: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  const newProject = await prisma.$transaction(async (tx) => {
    // 1. Create project copy
    const proj = await tx.project.create({
      data: {
        userId: auth.session.user.id,
        title: `${source.title} (副本)`,
        description: source.description,
        sourceText: source.sourceText,
        style: source.style,
        aspectRatio: source.aspectRatio,
        status: "draft",
      },
    });

    // 2. Copy characters
    for (const char of source.characters) {
      await tx.character.create({
        data: {
          projectId: proj.id,
          userId: auth.session.user.id,
          name: char.name,
          description: char.description,
          imageUrl: char.imageUrl,
          voiceProvider: char.voiceProvider,
          voiceId: char.voiceId,
          voiceSample: char.voiceSample,
        },
      });
    }

    // 3. Copy locations
    for (const loc of source.locations) {
      await tx.location.create({
        data: {
          projectId: proj.id,
          userId: auth.session.user.id,
          name: loc.name,
          description: loc.description,
          imageUrl: loc.imageUrl,
        },
      });
    }

    // 4. Copy episodes → clips → panels (without generated media)
    for (const ep of source.episodes) {
      const newEp = await tx.episode.create({
        data: {
          projectId: proj.id,
          title: ep.title,
          synopsis: ep.synopsis,
          sortOrder: ep.sortOrder,
          status: "draft",
        },
      });

      for (const clip of ep.clips) {
        const newClip = await tx.clip.create({
          data: {
            episodeId: newEp.id,
            title: clip.title,
            description: clip.description,
            dialogue: clip.dialogue,
            sortOrder: clip.sortOrder,
          },
        });

        for (const panel of clip.panels) {
          await tx.panel.create({
            data: {
              clipId: newClip.id,
              sceneDescription: panel.sceneDescription,
              cameraAngle: panel.cameraAngle,
              imagePrompt: panel.imagePrompt,
              durationMs: panel.durationMs,
              sortOrder: panel.sortOrder,
              // Don't copy imageUrl/videoUrl — must regenerate
            },
          });
        }
      }
    }

    return proj;
  });

  return NextResponse.json(newProject, { status: 201 });
});
