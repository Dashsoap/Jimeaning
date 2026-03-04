import { prisma } from "@/lib/prisma";
import { createAudioGenerator } from "@/lib/generators/factory";
import { resolveAudioConfig } from "@/lib/providers/resolve";
import { withTaskLifecycle } from "@/lib/workers/shared";
import type { TaskPayload } from "@/lib/task/types";

export const handleGenerateVoiceLine = withTaskLifecycle(async (payload: TaskPayload, ctx) => {
  const { userId, data } = payload;
  const voiceLineId = data.voiceLineId as string;

  const voiceLine = await prisma.voiceLine.findUniqueOrThrow({
    where: { id: voiceLineId },
    include: { character: true },
  });

  await ctx.reportProgress(20);

  const { provider, config, voiceId } = await resolveAudioConfig(userId);

  // Use character-specific voice if configured, fallback to user default
  const effectiveVoiceId =
    voiceLine.character?.voiceId || voiceId;

  const generator = createAudioGenerator(provider, config);

  await ctx.reportProgress(50);

  const result = await generator.generate({
    text: voiceLine.text,
    voiceId: effectiveVoiceId,
  });

  // Save audio URL or base64
  const audioUrl = result.url || (result.base64 ? `data:audio/mp3;base64,${result.base64}` : null);

  if (audioUrl) {
    await prisma.voiceLine.update({
      where: { id: voiceLineId },
      data: { audioUrl },
    });
  }

  return { voiceLineId, audioUrl };
});
