import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Redis from "ioredis";
import { TASK_PROGRESS_CHANNEL } from "@/lib/task/publisher";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const projectId = new URL(req.url).searchParams.get("projectId");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const subscriber = new Redis({
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379"),
      });

      subscriber.subscribe(TASK_PROGRESS_CHANNEL);

      subscriber.on("message", (_channel, message) => {
        try {
          const data = JSON.parse(message);
          // Send all task updates (filtering by project can be added if needed)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // skip malformed messages
        }
      });

      // Keep alive every 30s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30000);

      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        subscriber.unsubscribe();
        subscriber.quit();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
