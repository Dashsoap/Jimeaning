import type Redis from "ioredis";
import { createSubscriber } from "@/lib/redis";
import { createScopedLogger } from "@/lib/logging";
import { TASK_PROGRESS_CHANNEL } from "@/lib/task/publisher";

const logger = createScopedLogger({ module: "sse" });

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
      this.subscriber = createSubscriber();
      this.subscriber.on("message", (_channel, message) => {
        for (const listener of this.listeners) {
          try {
            listener(message);
          } catch {
            // Don't let one listener crash others
          }
        }
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
        await conn.subscribe(TASK_PROGRESS_CHANNEL);
        logger.info({ message: "Subscribed to channel", details: { channel: TASK_PROGRESS_CHANNEL } });
      } catch (err) {
        logger.error("Failed to subscribe", err);
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
        logger.info("Disconnected (no listeners)");
      }
    };
  }
}

// Module-level singleton
export const sharedSubscriber = new SharedSubscriber();
