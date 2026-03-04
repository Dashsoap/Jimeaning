import { prisma } from "@/lib/prisma";
import { createAudioGenerator } from "@/lib/generators/factory";
import { resolveAudioConfig } from "@/lib/providers/resolve";
import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

export async function handleGenerateVoiceLine(payload: TaskPayload) {
  const { taskId, userId, data } = payload;
  const voiceLineId = data.voiceLineId as string;

  try {
    const voiceLine = await prisma.voiceLine.findUniqueOrThrow({
      where: { id: voiceLineId },
      include: { character: true },
    });

    await updateTaskProgress(taskId, 20);

    const { provider, config, voiceId } = await resolveAudioConfig(userId);

    // Use character-specific voice if configured, fallback to user default
    const effectiveVoiceId =
      voiceLine.character?.voiceId || voiceId;

    const generator = createAudioGenerator(provider, config);

    await updateTaskProgress(taskId, 50);

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

    await completeTask(taskId, { voiceLineId, audioUrl });
  } catch (error) {
    await failTask(taskId, error instanceof Error ? error.message : String(error));
  }
}
