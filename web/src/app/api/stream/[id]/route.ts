import { getProvider } from "@/lib/payrail/server";
import { errorResponse } from "@/lib/payrail/errors";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Existence pre-check so 404 comes back as JSON, not inside an open stream.
  try {
    await getProvider().getPlan(id);
  } catch (e) {
    return errorResponse(e);
  }

  const encoder = new TextEncoder();
  const signal = _req.signal;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sink = {
        emit(event: unknown): void {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        },
        raw(text: string): void {
          if (text) controller.enqueue(encoder.encode(text));
        },
      };
      getProvider()
        .stream(id, signal, sink)
        .then(() => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        })
        .catch((e: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "step.failed", data: { planId: id, stepId: -1, txHash: null, error: e instanceof Error ? e.message : String(e) }, ts: new Date().toISOString() })}\n\n`),
            );
            controller.close();
          } catch {
            /* ignore */
          }
        });
    },
    cancel() {
      // underlying fetch aborts via signal
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}