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
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleAnalyzeScript = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId } = payload;

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

  try {
    // 2. Get LLM config
    const llmCfg = await resolveLlmConfig(userId);
    const client = createLLMClient(llmCfg);
    const model = llmCfg.model;

    // 3. Analyze script — break into episodes + clips
    await ctx.reportProgress(10);
    const scriptResult = await chatCompletion(client, {
      model,
      systemPrompt: ANALYZE_SCRIPT_SYSTEM,
      userPrompt: ANALYZE_SCRIPT_USER(project.sourceText),
      responseFormat: "json",
    });

    const parsed = JSON.parse(scriptResult);
    await ctx.reportProgress(50);

    // 4. Extract characters + locations
    const entityResult = await chatCompletion(client, {
      model,
      systemPrompt: EXTRACT_ENTITIES_SYSTEM,
      userPrompt: EXTRACT_ENTITIES_USER(project.sourceText),
      responseFormat: "json",
    });

    const entities = JSON.parse(entityResult);
    await ctx.reportProgress(70);

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

    await ctx.reportProgress(90);

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "ready" },
    });

    return {
      episodeCount: parsed.episodes?.length ?? 0,
      characterCount: entities.characters?.length ?? 0,
      locationCount: entities.locations?.length ?? 0,
    };
  } catch (error) {
    // Reset project status on failure
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "draft" },
    });
    throw error;
  }
});
