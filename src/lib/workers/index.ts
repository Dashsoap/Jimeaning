import { Worker } from "bullmq";
import Redis from "ioredis";
import { QUEUE_NAMES, TaskType } from "@/lib/task/types";
import type { TaskPayload } from "@/lib/task/types";

import { handleAnalyzeScript } from "./handlers/analyze-script";
import { handleGenerateStoryboard } from "./handlers/generate-storyboard";
import { handleGeneratePanelImage } from "./handlers/generate-panel-image";
import { handleGeneratePanelVideo } from "./handlers/generate-panel-video";
import { handleGenerateVoiceLine } from "./handlers/generate-voice-line";
import { handleComposeVideo } from "./handlers/compose-video";
import { handleReverseScript } from "./handlers/reverse-script";
import { handleRewriteScript } from "./handlers/rewrite-script";

const connection = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379"),
  maxRetriesPerRequest: null,
});

const handlers: Record<string, (payload: TaskPayload) => Promise<void>> = {
  [TaskType.ANALYZE_SCRIPT]: handleAnalyzeScript,
  [TaskType.GENERATE_STORYBOARD]: handleGenerateStoryboard,
  [TaskType.GENERATE_PANEL_IMAGE]: handleGeneratePanelImage,
  [TaskType.GENERATE_PANEL_VIDEO]: handleGeneratePanelVideo,
  [TaskType.GENERATE_VOICE_LINE]: handleGenerateVoiceLine,
  [TaskType.COMPOSE_VIDEO]: handleComposeVideo,
  [TaskType.REVERSE_SCRIPT]: handleReverseScript,
  [TaskType.REWRITE_SCRIPT]: handleRewriteScript,
};

async function processJob(payload: TaskPayload) {
  const handler = handlers[payload.type];
  if (!handler) {
    throw new Error(`No handler for task type: ${payload.type}`);
  }
  await handler(payload);
}

function startWorkers() {
  const concurrency = {
    [QUEUE_NAMES.text]: parseInt(process.env.WORKER_TEXT_CONCURRENCY ?? "10"),
    [QUEUE_NAMES.image]: parseInt(process.env.WORKER_IMAGE_CONCURRENCY ?? "10"),
    [QUEUE_NAMES.video]: parseInt(process.env.WORKER_VIDEO_CONCURRENCY ?? "10"),
    [QUEUE_NAMES.voice]: parseInt(process.env.WORKER_VOICE_CONCURRENCY ?? "5"),
  };

  for (const [queueName, conc] of Object.entries(concurrency)) {
    const worker = new Worker(
      queueName,
      async (job) => {
        console.log(`[Worker] Processing ${job.name} (${job.id})`);
        await processJob(job.data as TaskPayload);
      },
      { connection: connection as never, concurrency: conc }
    );

    worker.on("completed", (job) => {
      console.log(`[Worker] Completed ${job.name} (${job.id})`);
    });

    worker.on("failed", (job, error) => {
      console.error(`[Worker] Failed ${job?.name} (${job?.id}):`, error.message);
    });

    console.log(`[Worker] Started ${queueName} with concurrency ${conc}`);
  }
}

startWorkers();
console.log("[Worker] All workers started");
