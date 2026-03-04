import Redis from "ioredis";
import { TASK_PROGRESS_CHANNEL } from "@/lib/task/publisher";

type MessageHandler = (data: string) => void;

/**
 * Singleton Redis subscriber shared across all SSE connections.
 * Instead of one Redis connection per SSE client, we maintain a single
 * subscription and fan out messages to registered listeners.
 */
class SharedSubscriber {
  private subscriber: Redis | null = null;
  private listeners = new Set<MessageHandler>();
  private connecting = false;

  private getConnection(): Redis {
    if (!this.subscriber) {
      this.subscriber = new Redis({
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379"),
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });

      this.subscriber.on("message", (_channel, message) => {
        for (const listener of this.listeners) {
          try {
            listener(message);
          } catch {
            // Don't let one listener crash others
          }
        }
      });

      this.subscriber.on("error", (err) => {
        console.error("[SharedSubscriber] Redis error:", err.message);
      });
    }
    return this.subscriber;
  }

  async subscribe(handler: MessageHandler): Promise<() => void> {
    this.listeners.add(handler);

    // Connect and subscribe on first listener
    if (this.listeners.size === 1 && !this.connecting) {
      this.connecting = true;
      try {
        const conn = this.getConnection();
        await conn.connect();
        await conn.subscribe(TASK_PROGRESS_CHANNEL);
        console.log("[SharedSubscriber] Subscribed to", TASK_PROGRESS_CHANNEL);
      } catch (err) {
        console.error("[SharedSubscriber] Failed to subscribe:", err);
      } finally {
        this.connecting = false;
      }
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(handler);

      // Disconnect when no more listeners
      if (this.listeners.size === 0 && this.subscriber) {
        this.subscriber.unsubscribe().catch(() => {});
        this.subscriber.quit().catch(() => {});
        this.subscriber = null;
        console.log("[SharedSubscriber] Disconnected (no listeners)");
      }
    };
  }
}

// Module-level singleton
export const sharedSubscriber = new SharedSubscriber();
