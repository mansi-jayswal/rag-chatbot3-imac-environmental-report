import { cosineDistance, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { chunks } from "../db/schema";
import { CHAT_MODEL, TOP_K } from "./config";
import { ai, embedTexts, withRetry, type RetryOptions } from "./embed";

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

// Same model, prompt and temperature for the one-shot and streaming paths.
function generationRequest(question: string, hits: Hit[]) {
  const excerpts = hits.map((h) => `[page ${h.page}]\n${h.content}`).join("\n\n");
  return {
    // EVAL_CHAT_MODEL lets eval/CLI runs use another model's separate free-tier quota; the app never sets it.
    model: process.env.EVAL_CHAT_MODEL || CHAT_MODEL,
    contents: `Excerpts:\n${excerpts}\n\nQuestion: ${question}`,
    config: { systemInstruction: SYSTEM_PROMPT, temperature: 0 },
  };
}

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
      return await ai.models.generateContent(generationRequest(question, hits));
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
  const res = await withRetry(() => ai.models.generateContent(generationRequest(question, hits)));
  return (res.text ?? "").trim();
}

export async function answerQuestion(question: string): Promise<Answer> {
  const hits = await retrieve(question);
  return { answer: await generateAnswer(question, hits), hits };
}

export type AnswerStream = { hits: Hit[]; text: AsyncGenerator<string, void> };

// Interactive requests: ~3 quick attempts, and give up fast if Google asks for a long wait.
const WEB_RETRY: RetryOptions = { maxAttempts: 3, maxServerWaitMs: 15_000 };

// Retrieval runs first so callers can show sources (or fail cleanly) before any generation starts.
// The model request is only sent once `text` is iterated; withRetry covers opening the stream.
export async function streamAnswer(question: string): Promise<AnswerStream> {
  const hits = await retrieve(question, TOP_K, WEB_RETRY);
  return { hits, text: streamText(question, hits) };
}

async function* streamText(question: string, hits: Hit[]): AsyncGenerator<string, void> {
  const stream = await withRetry(() => ai.models.generateContentStream(generationRequest(question, hits)), WEB_RETRY);
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}
