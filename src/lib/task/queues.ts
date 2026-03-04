import { Queue } from "bullmq";
import Redis from "ioredis";
import { QUEUE_NAMES } from "./types";

let _textQueue: Queue | null = null;
let _imageQueue: Queue | null = null;
let _videoQueue: Queue | null = null;
let _voiceQueue: Queue | null = null;

function getConnection() {
  return new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379"),
    maxRetriesPerRequest: null,
  }) as never;
}

export function getTextQueue(): Queue {
  if (!_textQueue) _textQueue = new Queue(QUEUE_NAMES.text, { connection: getConnection() });
  return _textQueue;
}

export function getImageQueue(): Queue {
  if (!_imageQueue) _imageQueue = new Queue(QUEUE_NAMES.image, { connection: getConnection() });
  return _imageQueue;
}

export function getVideoQueue(): Queue {
  if (!_videoQueue) _videoQueue = new Queue(QUEUE_NAMES.video, { connection: getConnection() });
  return _videoQueue;
}

export function getVoiceQueue(): Queue {
  if (!_voiceQueue) _voiceQueue = new Queue(QUEUE_NAMES.voice, { connection: getConnection() });
  return _voiceQueue;
}

export function getQueueByType(type: string): Queue {
  if (type.includes("IMAGE")) return getImageQueue();
  if (type.includes("VIDEO") || type === "COMPOSE_VIDEO") return getVideoQueue();
  if (type.includes("VOICE")) return getVoiceQueue();
  return getTextQueue();
}
