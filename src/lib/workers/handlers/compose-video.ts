import { prisma } from "@/lib/prisma";
import { composeVideo } from "@/lib/compose/ffmpeg";
import { buildTimeline } from "@/lib/compose/timeline";
import { updateTaskProgress, completeTask, failTask } from "@/lib/task/service";
import type { TaskPayload } from "@/lib/task/types";

export async function handleComposeVideo(payload: TaskPayload) {
  const { taskId, data } = payload;
  const episodeId = data.episodeId as string;

  try {
    await updateTaskProgress(taskId, 10);

    // 1. Load episode data
    const episode = await prisma.episode.findUniqueOrThrow({
      where: { id: episodeId },
      include: {
        composition: true,
        clips: {
          orderBy: { sortOrder: "asc" },
          include: {
            panels: {
              orderBy: { sortOrder: "asc" },
              include: {
                voiceLines: {
                  include: { character: true },
                },
              },
            },
          },
        },
      },
    });

    // 2. Prepare panels with video/audio data
    const panels = episode.clips.flatMap((clip) =>
      clip.panels
        .filter((p) => p.videoUrl)
        .map((p) => ({
          id: p.id,
          videoUrl: p.videoUrl!,
          durationMs: p.durationMs,
          voiceLines: p.voiceLines
            .filter((vl) => vl.audioUrl)
            .map((vl) => ({
              id: vl.id,
              audioUrl: vl.audioUrl!,
              text: vl.text,
              startMs: vl.startMs,
              endMs: vl.endMs,
              characterName: vl.character?.name,
            })),
        }))
    );

    if (panels.length === 0) {
      throw new Error("No panels with video available for composition");
    }

    await updateTaskProgress(taskId, 30);

    // 3. Build timeline
    const timeline = buildTimeline(panels);

    // 4. Get composition settings
    const composition = episode.composition;
    const bgmUrl = composition?.bgmUrl || undefined;
    const bgmVolume = composition?.bgmVolume || 0.3;
    const subtitleEnabled = composition?.subtitleEnabled ?? true;
    const transition = (composition?.transition || "crossfade") as "crossfade" | "cut" | "fade";

    // 5. Update composition status
    await prisma.composition.upsert({
      where: { episodeId },
      update: { status: "composing", progress: 30 },
      create: { episodeId, status: "composing" },
    });

    await updateTaskProgress(taskId, 50);

    // 6. Run FFmpeg compose
    const result = await composeVideo({
      timeline,
      bgmUrl,
      bgmVolume,
      subtitleEnabled,
      transition,
      outputFileName: `episode_${episodeId}.mp4`,
    });

    await updateTaskProgress(taskId, 90);

    // 7. Update composition with result
    await prisma.composition.update({
      where: { episodeId },
      data: {
        outputUrl: result.outputPath,
        srtContent: result.srtContent,
        status: "completed",
        progress: 100,
      },
    });

    await completeTask(taskId, {
      episodeId,
      outputUrl: result.outputPath,
    });
  } catch (error) {
    await prisma.composition.updateMany({
      where: { episodeId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    await failTask(taskId, error instanceof Error ? error.message : String(error));
  }
}
