import { cosineDistance, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { chunks } from "../db/schema";
import { CHAT_FIRST_CHUNK_TIMEOUT_MS, CHAT_MODELS, TOP_K } from "./config";
import { ai, embedTexts, type RetryOptions } from "./embed";

export type Hit = { id: number; page: number; kind: string; content: string; score: number };
export type Answer = { answer: string; hits: Hit[] };

export const REFUSAL = "Not in the document.";

const SYSTEM_PROMPT = `You answer questions about one document using ONLY the excerpts provided.
- Use no outside knowledge and add nothing that is not in the excerpts.
- Cite the PDF page number(s) you used, like (page 12).
- If the excerpts do not contain the answer, reply exactly: ${REFUSAL}`;

export async function retrieve(question: string, topK = TOP_K, retry?: RetryOptions): Promise<Hit[]> {
  const [queryVector] = await embedTexts([question], "RETRIEVAL_QUERY", retry);
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, queryVector)})`;
  return db
    .select({ id: chunks.id, page: chunks.page, kind: chunks.kind, content: chunks.content, score: similarity })
    .from(chunks)
    .orderBy(desc(similarity))
    .limit(topK);
}

// EVAL_CHAT_MODEL pins eval/CLI runs to one model (a separate free-tier quota); the app never sets it.
const chatModels = (): readonly string[] => (process.env.EVAL_CHAT_MODEL ? [process.env.EVAL_CHAT_MODEL] : CHAT_MODELS);

// Same prompt and temperature for every model and for the one-shot and streaming paths.
function generationRequest(question: string, hits: Hit[], model: string, abortSignal?: AbortSignal) {
  const excerpts = hits.map((h) => `[page ${h.page}]\n${h.content}`).join("\n\n");
  return {
    model,
    contents: `Excerpts:\n${excerpts}\n\nQuestion: ${question}`,
    config: { systemInstruction: SYSTEM_PROMPT, temperature: 0, abortSignal },
  };
}

// Worth trying the next model: quota (429, per-model buckets), overload (5xx), unknown or retired model (404), or
// no first chunk in time. A 400 (bad request) would fail the same way on every model, so it is thrown at once.
function isFallbackError(err: unknown): boolean {
  const e = err as { status?: number; name?: string; message?: string };
  if (e?.status === 429 || e?.status === 404 || (e?.status !== undefined && e.status >= 500)) return true;
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return true;
  return /RESOURCE_EXHAUSTED|quota|UNAVAILABLE|high demand|overloaded/i.test(String(e?.message ?? ""));
}

const failureLabel = (err: unknown): string => {
  const e = err as { status?: number; name?: string };
  return e?.name === "AbortError" ? "no reply in time" : String(e?.status ?? e?.name ?? "error");
};

// Opt-in (EVAL_CHAT_BUDGET=1): every attempt may cost free-tier quota, so retry a 5xx once, never retry a 429.
// Default behaviour (unset) is unchanged. Counts attempts that reached the model in globalThis.__chatCalls.
async function budgetedGenerate(question: string, hits: Hit[]) {
  const g = globalThis as { __chatCalls?: number };
  const cap = Number(process.env.EVAL_MAX_CALLS ?? 10);
  for (let attempt = 1; ; attempt++) {
    // Hard cap on attempts that reach the model, retries included.
    if ((g.__chatCalls ?? 0) >= cap) throw new Error(`chat call cap reached (${cap}); stopping to protect the daily quota`);
    g.__chatCalls = (g.__chatCalls ?? 0) + 1;
    console.warn(`[budget] chat call #${g.__chatCalls}`);
    try {
      return await ai.models.generateContent(generationRequest(question, hits, chatModels()[0]));
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== undefined && status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
}

export async function generateAnswer(question: string, hits: Hit[]): Promise<string> {
  if (process.env.EVAL_CHAT_BUDGET === "1") return ((await budgetedGenerate(question, hits)).text ?? "").trim();
  let text = "";
  for await (const piece of streamText(question, hits)) text += piece;
  return text.trim();
}

export async function answerQuestion(question: string): Promise<Answer> {
  const hits = await retrieve(question);
  return { answer: await generateAnswer(question, hits), hits };
}

export type AnswerStream = { hits: Hit[]; text: AsyncGenerator<string, void> };

// Interactive requests: a few quick embedding attempts, and give up fast if Google asks for a long wait.
const WEB_RETRY: RetryOptions = { maxAttempts: 3, maxServerWaitMs: 15_000 };

// Retrieval runs first so callers can show sources (or fail cleanly) before any generation starts.
// The model request is only sent once `text` is iterated.
export async function streamAnswer(question: string): Promise<AnswerStream> {
  const hits = await retrieve(question, TOP_K, WEB_RETRY);
  return { hits, text: streamText(question, hits) };
}

// Walks the chat models in order (D-28). Falling back is only safe before the first chunk: after that the reader has
// part of an answer, so a later failure is thrown instead of starting over with another model. Stopping the
// generator (the client went away) aborts the upstream request.
async function* streamText(question: string, hits: Hit[]): AsyncGenerator<string, void> {
  const failures: string[] = [];
  let allQuota = true;
  for (const model of chatModels()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_FIRST_CHUNK_TIMEOUT_MS);
    let iterator: AsyncIterator<{ text?: string }>;
    let first: IteratorResult<{ text?: string }>;
    try {
      const stream = await ai.models.generateContentStream(generationRequest(question, hits, model, controller.signal));
      iterator = stream[Symbol.asyncIterator]();
      first = await iterator.next();
    } catch (err) {
      controller.abort();
      if (!isFallbackError(err)) throw err;
      if ((err as { status?: number }).status !== 429) allQuota = false;
      failures.push(`${model} (${failureLabel(err)})`);
      console.warn(`[chat] ${model} failed (${failureLabel(err)}), trying the next model`);
      continue;
    } finally {
      clearTimeout(timer);
    }
    try {
      if (failures.length) console.warn(`[chat] answered by ${model} after: ${failures.join(", ")}`);
      if (first.value?.text) yield first.value.text;
      for (let r = first; !r.done; ) {
        r = await iterator.next();
        if (!r.done && r.value.text) yield r.value.text;
      }
    } finally {
      controller.abort();
    }
    return;
  }
  // Every model failed: report it as quota only when every one of them said so (the route maps 429 to "quota").
  throw Object.assign(new Error(`All chat models failed: ${failures.join(", ")}`), { status: allQuota ? 429 : 503 });
}
