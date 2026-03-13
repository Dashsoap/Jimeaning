import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

interface StoryboardShot {
  shotNumber: number;
  scene: string;
  shotSize: string;
  angle: string;
  cameraMove: string;
  description: string;
  dialogue?: string;
  duration: string;
  colorTone?: string;
  composition?: string;
  visualNarrative?: string;
}

interface StoryboardScene {
  sceneHeader: string;
  shots: StoryboardShot[];
}

interface StoryboardResult {
  scenes: StoryboardScene[];
}

interface ImagePromptEntry {
  shotNumber: number;
  prompt: string;
}

interface ImageGeneratorResult {
  prompts: ImagePromptEntry[];
}

interface AnalysisCharacter {
  name: string;
  appearance?: string;
  description?: string;
}

/** Parse duration string like "3s", "4-6秒", "2.5s" → milliseconds */
function parseDurationMs(duration: string): number {
  const match = duration.match(/([\d.]+)/);
  if (!match) return 3000;
  return Math.round(parseFloat(match[1]) * 1000);
}

/** POST /api/agent-projects/:id/publish — import agent project into main project */
export const POST = apiHandler(async (_req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  // 1. Load AgentProject with all episodes
  const agentProject = await prisma.agentProject.findFirst({
    where: { id, userId: auth.user.id },
    include: {
      episodes: {
        orderBy: { episodeNumber: "asc" },
      },
    },
  });
  if (!agentProject) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2. Extract characters from analysisData
  const analysisData = agentProject.analysisData as { characters?: AnalysisCharacter[] } | null;
  const characters = analysisData?.characters ?? [];

  // Build name → id map for characterIds matching later
  const characterNameMap = new Map<string, string>();

  // 3. Run everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create Project
    const project = await tx.project.create({
      data: {
        userId: auth.user.id,
        title: agentProject.title,
        sourceText: agentProject.sourceText,
        status: "ready",
      },
    });

    // Create Characters
    for (const char of characters) {
      const created = await tx.character.create({
        data: {
          projectId: project.id,
          userId: auth.user.id,
          name: char.name,
          description: char.appearance || char.description || "",
        },
      });
      characterNameMap.set(char.name, created.id);
    }

    // Process each completed episode
    for (const agentEp of agentProject.episodes) {
      if (!agentEp.storyboard) continue;

      // Create Episode
      const episode = await tx.episode.create({
        data: {
          projectId: project.id,
          title: agentEp.title || `第${agentEp.episodeNumber}集`,
          synopsis: agentEp.outline || "",
          sortOrder: agentEp.episodeNumber - 1,
          status: "storyboarded",
        },
      });

      // Parse storyboard JSON
      let storyboard: StoryboardResult;
      try {
        const parsed = JSON.parse(agentEp.storyboard);
        storyboard = parsed.storyboard ?? parsed;
      } catch {
        continue;
      }

      // Parse imagePrompts JSON
      const imagePromptMap = new Map<number, string>();
      if (agentEp.imagePrompts) {
        try {
          const imgData: ImageGeneratorResult = JSON.parse(agentEp.imagePrompts);
          for (const entry of imgData.prompts ?? []) {
            imagePromptMap.set(entry.shotNumber, entry.prompt);
          }
        } catch {
          // ignore parse errors
        }
      }

      // Create Clips and Panels from scenes
      let clipSortOrder = 0;
      for (const scene of storyboard.scenes ?? []) {
        const clip = await tx.clip.create({
          data: {
            episodeId: episode.id,
            title: scene.sceneHeader,
            sortOrder: clipSortOrder++,
          },
        });

        let panelSortOrder = 0;
        for (const shot of scene.shots ?? []) {
          // Match character names from description
          const matchedCharIds: string[] = [];
          for (const [name, charId] of characterNameMap) {
            if (shot.description?.includes(name)) {
              matchedCharIds.push(charId);
            }
          }

          await tx.panel.create({
            data: {
              clipId: clip.id,
              sceneDescription: shot.description || "",
              cameraAngle: shot.angle || "",
              shotType: shot.shotSize || "",
              cameraMove: shot.cameraMove || "",
              imagePrompt: imagePromptMap.get(shot.shotNumber) || "",
              sourceText: shot.scene || "",
              durationMs: parseDurationMs(shot.duration || "3s"),
              characterIds: matchedCharIds.length > 0 ? JSON.stringify(matchedCharIds) : undefined,
              sortOrder: panelSortOrder++,
            },
          });
        }
      }
    }

    return { projectId: project.id };
  });

  return NextResponse.json(result, { status: 201 });
});
