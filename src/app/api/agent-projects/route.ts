import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/agent-projects — list user's agent projects */
export const GET = apiHandler(async () => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const projects = await prisma.agentProject.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      episodes: {
        orderBy: { episodeNumber: "asc" },
        select: {
          id: true,
          episodeNumber: true,
          title: true,
          status: true,
          reviewScore: true,
          rewriteAttempt: true,
          reflectionData: true,
          chapterNotes: true,
          similarityScore: true,
        },
      },
    },
  });

  return NextResponse.json(projects);
});

/** POST /api/agent-projects — create a new agent project */
export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { title, sourceText, durationPerEp, autoMode, outputFormat, rewriteIntensity, preserveDimensions, orchestratorModelKey } = body;

  if (!title?.trim()) return badRequest("title is required");
  if (!sourceText?.trim()) return badRequest("sourceText is required");

  // Validate rewrite controls
  const intensity = typeof rewriteIntensity === "number" ? Math.min(5, Math.max(1, Math.round(rewriteIntensity))) : 3;
  const validDimensions = ["plot", "dialogue", "narrative", "description", "emotion"];
  const dimensions = Array.isArray(preserveDimensions)
    ? preserveDimensions.filter((d: string) => validDimensions.includes(d))
    : undefined;

  const project = await prisma.agentProject.create({
    data: {
      userId: auth.user.id,
      title: title.trim(),
      sourceText: sourceText.trim(),
      durationPerEp: durationPerEp || null,
      autoMode: autoMode ?? false,
      outputFormat: outputFormat || "script",
      rewriteIntensity: intensity,
      ...(dimensions ? { preserveDimensions: dimensions } : {}),
      ...(orchestratorModelKey ? { orchestratorModelKey } : {}),
    },
  });

  return NextResponse.json(project, { status: 201 });
});
