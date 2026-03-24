import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";
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

      // Parse imagePrompts JSON — shotNumber may be number (1) or string ("Shot 1")
      const imagePromptMap = new Map<number, string>();
      if (agentEp.imagePrompts) {
        try {
          const imgData: ImageGeneratorResult = JSON.parse(agentEp.imagePrompts);
          for (const entry of imgData.prompts ?? []) {
            // Coerce "Shot 1" → 1, or just parse number
            const raw = entry.shotNumber;
            const num = typeof raw === "number" ? raw : parseInt(String(raw).replace(/\D/g, ""), 10);
            if (!isNaN(num)) imagePromptMap.set(num, entry.prompt);
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
          const s = shot as unknown as Record<string, unknown>;

          // Match character names from description
          const matchedCharIds: string[] = [];
          const desc = (s.visual || s.visualDescription || s.description || "") as string;
          for (const [name, charId] of characterNameMap) {
            if (desc.includes(name)) {
              matchedCharIds.push(charId);
            }
          }

          // Prefer Phase 3 video_prompt (dynamic, with character motion);
          // fallback to legacy concatenation
          const phase3VideoPrompt = s.video_prompt as string | undefined;
          const videoPromptParts = [
            s.visual,
            s.movement ? `运镜：${s.movement}` : "",
            s.showDontTell,
          ].filter(Boolean) as string[];
          const videoPrompt = phase3VideoPrompt || videoPromptParts.join("。");

          // Build photographyRules from lighting/color + framing
          const photographyParts = [
            s.lightingColor || s.colorTone,
            s.framing ? `构图：${s.framing}` : "",
          ].filter(Boolean) as string[];
          const photographyRules = photographyParts.join("；");

          await tx.panel.create({
            data: {
              clipId: clip.id,
              sceneDescription: (s.visual || s.visualDescription || s.description || "") as string,
              cameraAngle: (s.angle || "") as string,
              shotType: (s.shot_type || s.framing || s.shotSize || "") as string,
              cameraMove: (s.camera_move || s.cameraMovement || s.movement || s.cameraMove || "") as string,
              videoPrompt: videoPrompt || undefined,
              photographyRules: photographyRules || undefined,
              imagePrompt: imagePromptMap.get(s.shotNumber as number) || "",
              sourceText: (s.scene || s.audio || "") as string,
              durationMs: parseDurationMs((s.duration as string) || "3s"),
              characterIds: matchedCharIds.length > 0 ? JSON.stringify(matchedCharIds) : undefined,
              sortOrder: panelSortOrder++,
            },
          });
        }
      }
    }

    // Collect characters that need image generation
    const charsNeedingImages: { id: string; appearance: string }[] = [];
    for (const char of characters) {
      const charId = characterNameMap.get(char.name);
      const appearance = char.appearance || char.description || "";
      if (charId && appearance) {
        charsNeedingImages.push({ id: charId, appearance });
      }
    }

    return { projectId: project.id, charsNeedingImages };
  });

  // After transaction: create IMAGE_CHARACTER tasks for characters without images
  const characterTaskIds: string[] = [];
  for (const char of result.charsNeedingImages) {
    const taskId = await createTask({
      userId: auth.user.id,
      projectId: result.projectId,
      type: TaskType.IMAGE_CHARACTER,
      data: { characterId: char.id, prompt: char.appearance },
    });
    characterTaskIds.push(taskId);
  }

  return NextResponse.json(
    { projectId: result.projectId, characterTaskIds },
    { status: 201 },
  );
});
