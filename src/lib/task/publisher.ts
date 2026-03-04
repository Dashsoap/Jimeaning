import type { TaskProgress } from "./types";

const CHANNEL = "jimeaning-task-progress";

export async function publishTaskProgress(progress: TaskProgress) {
  // Lazy import to avoid connecting at build time
  const { redis } = await import("@/lib/redis");
  await redis.publish(CHANNEL, JSON.stringify(progress));
}

export { CHANNEL as TASK_PROGRESS_CHANNEL };
