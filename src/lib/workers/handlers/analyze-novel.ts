import { prisma } from "@/lib/prisma";
import { createLLMClient, chatCompletionJson } from "@/lib/llm/client";
import { ANALYZE_NOVEL_SYSTEM, ANALYZE_NOVEL_USER } from "@/lib/llm/prompts/analyze-novel";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

interface AnalyzeNovelResult {
  characters: Array<{
    name: string;
    aliases?: string[];
    description: string;
    role: string;
    gender: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
    mood?: string;
  }>;
}

export const handleAnalyzeNovel = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId, data } = payload;
  const content = data.content as string;

  if (!content || !projectId) {
    throw new Error("Missing required fields: content, projectId");
  }

  await ctx.reportProgress(10);

  // Get existing characters and locations to avoid duplicates
  const [existingChars, existingLocs] = await Promise.all([
    prisma.character.findMany({
      where: { projectId },
      select: { name: true },
    }),
    prisma.location.findMany({
      where: { projectId },
      select: { name: true },
    }),
  ]);

  const existingCharNames = existingChars.map((c) => c.name).join(", ") || undefined;
  const existingLocNames = existingLocs.map((l) => l.name).join(", ") || undefined;

  await ctx.reportProgress(20);

  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);

  const result = await chatCompletionJson<AnalyzeNovelResult>(client, {
    model: llmCfg.model,
    systemPrompt: ANALYZE_NOVEL_SYSTEM,
    userPrompt: ANALYZE_NOVEL_USER(content, existingCharNames, existingLocNames),
    temperature: 0.3,
  });

  await ctx.reportProgress(70);

  // Save new characters
  let charsCreated = 0;
  if (result.characters?.length) {
    for (const char of result.characters) {
      await prisma.character.create({
        data: {
          projectId,
          userId,
          name: char.name,
          description: char.description,
        },
      });
      charsCreated++;
    }
  }

  // Save new locations
  let locsCreated = 0;
  if (result.locations?.length) {
    for (const loc of result.locations) {
      await prisma.location.create({
        data: {
          projectId,
          userId,
          name: loc.name,
          description: `${loc.description}${loc.mood ? ` (${loc.mood})` : ""}`,
        },
      });
      locsCreated++;
    }
  }

  return {
    characters: result.characters || [],
    locations: result.locations || [],
    created: { characters: charsCreated, locations: locsCreated },
  };
});
