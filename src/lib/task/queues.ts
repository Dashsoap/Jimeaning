import { Queue } from "bullmq";
import Redis from "ioredis";
import { QUEUE_NAMES } from "./types";

const connection = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379"),
  maxRetriesPerRequest: null,
});

export const textQueue = new Queue(QUEUE_NAMES.text, { connection: connection as never });
export const imageQueue = new Queue(QUEUE_NAMES.image, { connection: connection as never });
export const videoQueue = new Queue(QUEUE_NAMES.video, { connection: connection as never });
export const voiceQueue = new Queue(QUEUE_NAMES.voice, { connection: connection as never });

export function getQueueByType(type: string): Queue {
  if (type.includes("IMAGE")) return imageQueue;
  if (type.includes("VIDEO") || type === "COMPOSE_VIDEO") return videoQueue;
  if (type.includes("VOICE")) return voiceQueue;
  return textQueue;
}
