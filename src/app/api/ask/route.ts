import { z } from "zod";
import { MAX_QUESTION_LENGTH, type AskErrorCode, type AskEvent, type AskSourceKind } from "@/lib/ask-protocol";

// Wire format is documented in src/lib/ask-protocol.ts.
export const runtime = "nodejs";

const Body = z.object({ question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH) });

const MESSAGES: Record<AskErrorCode, string> = {
  invalid: `Ask a question of 1 to ${MAX_QUESTION_LENGTH} characters.`,
  quota: "The Gemini free-tier quota is used up for now. Try again later.",
  unavailable: "The model is busy right now. Try again in a moment.",
  internal: "Something went wrong on our side. Try again.",
};

const STATUS: Record<AskErrorCode, number> = { invalid: 400, quota: 429, unavailable: 503, internal: 500 };

function classify(err: unknown): AskErrorCode {
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? "");
  if (status === 429 || /quota exhausted/i.test(message)) return "quota";
  const name = (err as Error)?.name;
  if ((status !== undefined && status >= 500) || name === "AbortError" || name === "TimeoutError") return "unavailable";
  return "internal";
}

function jsonError(code: AskErrorCode) {
  return Response.json({ error: { code, message: MESSAGES[code] } }, { status: STATUS[code] });
}

function reportError(err: unknown, code: AskErrorCode) {
  // Short and without the stack: enough to debug, nothing worth leaking.
  console.error(`[ask] ${code}: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid");
  const { question } = parsed.data;

  // Loaded lazily so `next build` never evaluates env validation or opens the DB client.
  const { streamAnswer } = await import("@/lib/rag/answer");

  let answer;
  try {
    answer = await streamAnswer(question);
  } catch (err) {
    const code = classify(err);
    reportError(err, code);
    return jsonError(code);
  }

  const encoder = new TextEncoder();
  const iterator = answer.text[Symbol.asyncIterator]();
  let cancelled = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({
          type: "sources",
          sources: answer.hits.map((h) => ({ id: h.id, page: h.page, kind: h.kind as AskSourceKind, content: h.content, score: h.score })),
        });
        while (!cancelled) {
          const { value, done } = await iterator.next();
          if (done) break;
          send({ type: "text", text: value });
        }
        if (!cancelled) send({ type: "done" });
      } catch (err) {
        const code = classify(err);
        reportError(err, code);
        if (!cancelled) send({ type: "error", code, message: MESSAGES[code] });
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
      void iterator.return?.();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
