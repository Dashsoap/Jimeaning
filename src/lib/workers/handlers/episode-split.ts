import { createLLMClient, chatCompletionJson } from "@/lib/llm/client";
import { EPISODE_SPLIT_SYSTEM, EPISODE_SPLIT_USER } from "@/lib/llm/prompts/episode-split";
import { resolveLlmConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

interface EpisodeSplitResult {
  episodes: Array<{
    number: number;
    title: string;
    summary: string;
    startMarker: string;
    endMarker: string;
  }>;
}

export const handleEpisodeSplit = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, projectId, data } = payload;
  const content = data.content as string;

  if (!content || !projectId) {
    throw new Error("Missing required fields: content, projectId");
  }

  await ctx.reportProgress(10);

  const llmCfg = await resolveLlmConfig(userId);
  const client = createLLMClient(llmCfg);

  await ctx.reportProgress(20);

  const result = await chatCompletionJson<EpisodeSplitResult>(client, {
    model: llmCfg.model,
    systemPrompt: EPISODE_SPLIT_SYSTEM,
    userPrompt: EPISODE_SPLIT_USER(content),
    temperature: 0.3,
  });

  if (!result.episodes?.length) {
    throw new Error("LLM returned no episodes");
  }

  await ctx.reportProgress(80);

  // Extract episode content based on markers
  const episodes = result.episodes.map((ep) => {
    const startIdx = content.indexOf(ep.startMarker);
    const endIdx = ep.endMarker ? content.indexOf(ep.endMarker) : -1;

    let episodeContent = "";
    if (startIdx >= 0 && endIdx >= 0 && endIdx > startIdx) {
      episodeContent = content.substring(startIdx, endIdx + ep.endMarker.length);
    } else if (startIdx >= 0) {
      episodeContent = content.substring(startIdx);
    }

    return {
      number: ep.number,
      title: ep.title,
      summary: ep.summary,
      content: episodeContent,
      startMarker: ep.startMarker,
      endMarker: ep.endMarker,
    };
  });

  return { episodes };
});
