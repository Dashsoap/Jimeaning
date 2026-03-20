import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import type { StoryboardResult } from "@/lib/agents/definitions/storyboard-director";
import type { ImageGeneratorResult } from "@/lib/agents/definitions/image-generator";

type Params = { params: Promise<{ id: string }> };

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
export const POST = apiHandler(async (req: NextRequest, { params }: Params) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { id } = await params;

  // Parse optional episode filter
  let episodeFilter: number[] | undefined;
  try {
    const body = await req.json();
    if (body.episodeNumbers && Array.isArray(body.episodeNumbers)) {
      episodeFilter = body.episodeNumbers;
    }
  } catch {
    // No body or invalid JSON — publish all
  }

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

    // Filter episodes
    const episodesToPublish = episodeFilter
      ? agentProject.episodes.filter((ep) => episodeFilter!.includes(ep.episodeNumber))
      : agentProject.episodes.filter((ep) => ep.status === "completed");

    // Process each episode
    for (const agentEp of episodesToPublish) {
      // Create Episode
      const episode = await tx.episode.create({
        data: {
          projectId: project.id,
          title: agentEp.title || `第${agentEp.episodeNumber}集`,
          synopsis: agentEp.outline || "",
          sortOrder: agentEp.episodeNumber - 1,
          status: agentEp.storyboard ? "storyboarded" : "scripted",
        },
      });

      // Novel mode (no storyboard) — skip clip/panel creation
      if (!agentEp.storyboard) continue;

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
          // LLM may produce extra fields not in the typed interface
          const s = shot as Record<string, unknown>;

          // Match character names from description
          const matchedCharIds: string[] = [];
          const desc = (s.visual || s.description || "") as string;
          for (const [name, charId] of characterNameMap) {
            if (desc.includes(name)) {
              matchedCharIds.push(charId);
            }
          }

          // Build videoPrompt from visual + movement + showDontTell
          const videoPromptParts = [
            s.visual,
            s.movement ? `运镜：${s.movement}` : "",
            s.showDontTell,
          ].filter(Boolean) as string[];
          const videoPrompt = videoPromptParts.join("。");

          // Build photographyRules from lighting/color + framing
          const photographyParts = [
            s.lightingColor || s.colorTone,
            s.framing ? `构图：${s.framing}` : "",
          ].filter(Boolean) as string[];
          const photographyRules = photographyParts.join("；");

          await tx.panel.create({
            data: {
              clipId: clip.id,
              sceneDescription: (s.visual || s.description || "") as string,
              cameraAngle: (s.angle || "") as string,
              shotType: (s.framing || s.shotSize || "") as string,
              cameraMove: (s.movement || s.cameraMove || "") as string,
              videoPrompt: videoPrompt || undefined,
              photographyRules: photographyRules || undefined,
              imagePrompt: imagePromptMap.get(shot.shotNumber) || "",
              sourceText: shot.scene || shot.audio || "",
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
