import { redis } from "@/lib/redis";
import type { TaskProgress } from "./types";

const CHANNEL = "jimeaning:task-progress";

export async function publishTaskProgress(progress: TaskProgress) {
  await redis.publish(CHANNEL, JSON.stringify(progress));
}

export { CHANNEL as TASK_PROGRESS_CHANNEL };
