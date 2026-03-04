import { NextRequest } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { sharedSubscriber } from "@/lib/sse/shared-subscriber";

export const GET = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const projectId = new URL(req.url).searchParams.get("projectId");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to shared Redis connection
      let unsubscribe: (() => void) | null = null;

      sharedSubscriber
        .subscribe((message) => {
          try {
            const data = JSON.parse(message);
            // Filter by project if specified
            if (projectId && data.projectId && data.projectId !== projectId) {
              return;
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            // skip malformed messages
          }
        })
        .then((unsub) => {
          unsubscribe = unsub;
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
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
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
});
