import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletion } from "@/lib/llm/client";
import {
  ANALYZE_SCRIPT_SYSTEM,
  ANALYZE_SCRIPT_USER,
} from "@/lib/llm/prompts/analyze-script";
import {
  EXTRACT_ENTITIES_SYSTEM,
  EXTRACT_ENTITIES_USER,
} from "@/lib/llm/prompts/extract-entities";
import { resolveProviderConfig } from "@/lib/providers/resolve";
import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

export async function handleAnalyzeScript(payload: TaskPayload) {
  const { taskId, userId, projectId } = payload;

  try {
    // 1. Get project source text
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });

    if (!project.sourceText) {
      throw new Error("No source text in project");
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "analyzing" },
    });

    // 2. Get LLM config
    const config = await resolveProviderConfig(userId, "openai");
    const pref = await prisma.userPreference.findUnique({
      where: { userId },
    });
    const model = pref?.llmModel || "gpt-4o";
    const client = createLLMClient(config);

    // 3. Analyze script — break into episodes + clips
    await updateTaskProgress(taskId, 10);
    const scriptResult = await chatCompletion(client, {
      model,
      systemPrompt: ANALYZE_SCRIPT_SYSTEM,
      userPrompt: ANALYZE_SCRIPT_USER(project.sourceText),
      responseFormat: "json",
    });

    const parsed = JSON.parse(scriptResult);
    await updateTaskProgress(taskId, 50);

    // 4. Extract characters + locations
    const entityResult = await chatCompletion(client, {
      model,
      systemPrompt: EXTRACT_ENTITIES_SYSTEM,
      userPrompt: EXTRACT_ENTITIES_USER(project.sourceText),
      responseFormat: "json",
    });

    const entities = JSON.parse(entityResult);
    await updateTaskProgress(taskId, 70);

    // 5. Save to database
    // Create characters
    for (const char of entities.characters || []) {
      await prisma.character.create({
        data: {
          projectId,
          name: char.name,
          description: char.description,
        },
      });
    }

    // Create locations
    for (const loc of entities.locations || []) {
      await prisma.location.create({
        data: {
          projectId,
          name: loc.name,
          description: loc.description,
        },
      });
    }

    // Create episodes + clips
    for (let i = 0; i < (parsed.episodes || []).length; i++) {
      const ep = parsed.episodes[i];
      const episode = await prisma.episode.create({
        data: {
          projectId,
          title: ep.title,
          synopsis: ep.synopsis,
          sortOrder: i,
        },
      });

      for (let j = 0; j < (ep.clips || []).length; j++) {
        const clip = ep.clips[j];
        await prisma.clip.create({
          data: {
            episodeId: episode.id,
            title: clip.title,
            description: clip.description,
            dialogue: clip.dialogue,
            sortOrder: j,
          },
        });
      }
    }

    await updateTaskProgress(taskId, 90);

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "ready" },
    });

    await completeTask(taskId, {
      episodeCount: parsed.episodes?.length ?? 0,
      characterCount: entities.characters?.length ?? 0,
      locationCount: entities.locations?.length ?? 0,
    });
  } catch (error) {
    await failTask(taskId, error instanceof Error ? error.message : String(error));
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "draft" },
    });
  }
}
