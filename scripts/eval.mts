import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { client } from "../src/lib/db";
import { answerQuestion, REFUSAL, retrieve } from "../src/lib/rag/answer";

type Item = {
  id: string;
  type: "acceptance" | "fact" | "trap" | "out-of-scope";
  kind: "chart" | "table" | "callout" | "footnote" | "paragraph" | "none"; // element the answer lives in
  question: string;
  valueStrings?: string[]; // all must appear in ONE retrieved chunk for a value hit (default: expectedAnswerContains)
  expectedAnswerContains: string[];
  expectedAnswerContainsAny?: string[]; // at least one must appear
  expectedAnswerNotContains?: string[]; // none may appear
  expectedPages: number[];
};

const args = process.argv.slice(2);
const idsFlag = args.findIndex((a) => a === "--ids" || a.startsWith("--ids="));
const idsValue = idsFlag === -1 ? null : args[idsFlag].includes("=") ? args[idsFlag].split("=")[1] : args[idsFlag + 1];
const wantIds = idsValue ? new Set(idsValue.split(",").filter(Boolean)) : null;
const saveJson = args.includes("--json");
// Embeddings only, no chat call: checks retrieval without spending the (small) free-tier chat quota.
const retrievalOnly = args.includes("--retrieval-only");
// Chat runs wait ~13 s between questions (free tier: 5 requests/minute per model); retrieval-only needs far less.
const DELAY_MS = retrievalOnly ? 1500 : 13_000;
// Hard cap on chat calls per run, so a long ids list can never burn the daily quota (override with --max-calls N).
const maxCallsFlag = args.findIndex((a) => a === "--max-calls");
const MAX_CHAT_CALLS = maxCallsFlag === -1 ? 10 : Number(args[maxCallsFlag + 1]);

// Case, whitespace, thousands separators and Markdown table pipes don't matter
// ("802,834" == "802834", "| Production | 50% |" == "Production 50%").
const norm = (s: string) =>
  s.toLowerCase().replace(/(?<=\d),(?=\d)/g, "").replace(/[’‘]/g, "'").replace(/\|/g, " ").replace(/\s+/g, " ").trim();

// Numbers in the answer (page citations excluded) that appear in none of the retrieved chunks.
function unsupportedNumbers(answer: string, chunkTexts: string[]): string[] {
  const body = norm(answer.replace(/\(pages?[^)]*\)/gi, " "));
  const context = norm(chunkTexts.join(" "));
  const nums = body.match(/\d[\d.]*\d|\d/g) ?? [];
  return [...new Set(nums)].filter((n) => !context.includes(n));
}

const golden = JSON.parse(await readFile("evals/golden.json", "utf8")) as { status: string; items: Item[] };
const items = wantIds ? golden.items.filter((i) => wantIds.has(i.id)) : golden.items;
if (items.length === 0) {
  console.error("No golden items matched --ids");
  process.exit(1);
}
console.log(`Golden set: ${golden.status}\nRunning ${items.length} question(s)\n`);

type Result = {
  id: string;
  type: Item["type"];
  kind: Item["kind"];
  retrievalHit: boolean | null; // any expected page in top-K
  valueHit: boolean | null; // one retrieved chunk contains ALL value strings
  valueRank: number | null;
  correct: boolean | null;
  unsupported: string[];
  answer: string;
  pages: number[];
  topScore: number;
};
const results: Result[] = [];

if (!retrievalOnly && items.length > MAX_CHAT_CALLS) {
  console.error(`Refusing to run: ${items.length} chat calls exceeds --max-calls ${MAX_CHAT_CALLS}. Use --ids to pick fewer.`);
  process.exit(2);
}
await mkdir("data/extracted", { recursive: true });
const partialPath = "data/extracted/eval-partial.jsonl";
if (!retrievalOnly) await writeFile(partialPath, "");
let stopped: string | null = null;

for (const [i, item] of items.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  let answer: string;
  let hits: Awaited<ReturnType<typeof retrieve>>;
  try {
    ({ answer, hits } = retrievalOnly
      ? { answer: "", hits: await retrieve(item.question) }
      : await answerQuestion(item.question));
  } catch (err) {
    // Typically a 429: stop at once (no retry loop) and keep everything answered so far.
    stopped = `${item.id}: ${String((err as Error).message).slice(0, 200)}`;
    break;
  }
  const pages = hits.map((h) => h.page);
  const oos = item.type === "out-of-scope";
  const need = item.valueStrings ?? item.expectedAnswerContains;
  const valueRank = hits.findIndex((h) => need.every((s) => norm(h.content).includes(norm(s))));
  results.push({
    id: item.id,
    type: item.type,
    kind: item.kind,
    retrievalHit: oos ? null : item.expectedPages.some((p) => pages.includes(p)),
    valueHit: oos ? null : valueRank >= 0,
    valueRank: oos ? null : valueRank + 1, // 1-based rank of the first chunk holding all value strings (0 = none)
    correct: retrievalOnly
      ? null
      : oos
        ? answer.trim() === REFUSAL
        : isCorrect(item, answer),
    unsupported: unsupportedNumbers(answer, hits.map((h) => h.content)),
    answer,
    pages,
    topScore: hits[0]?.score ?? 0,
  });
  // Written as each item completes, so a later quota stop never loses an answer already paid for.
  if (!retrievalOnly) await appendFile(partialPath, JSON.stringify(results[results.length - 1]) + "\n");
}
if (stopped) console.error(`\nSTOPPED EARLY after ${results.length}/${items.length} item(s): ${stopped}`);

function isCorrect(item: Item, answer: string): boolean {
  const a = norm(answer);
  const has = (s: string) => a.includes(norm(s));
  return (
    item.expectedAnswerContains.every(has) &&
    (!item.expectedAnswerContainsAny || item.expectedAnswerContainsAny.some(has)) &&
    !(item.expectedAnswerNotContains ?? []).some(has)
  );
}

const mark = (v: boolean | null) => (v === null ? "  -" : v ? " ok" : "FAIL");
if (retrievalOnly) console.log("(retrieval-only: no chat call, correctness and refusal not evaluated)\n");
console.log("id".padEnd(26), "kind".padEnd(10), "page", "val ", "vrnk", "corr", "top-sim", "retrieved-pages".padEnd(18), "unsupported-numbers");
for (const r of results) {
  console.log(
    r.id.padEnd(26),
    r.kind.padEnd(10),
    mark(r.retrievalHit).padStart(4),
    mark(r.valueHit).padStart(4),
    String(r.valueRank ?? "-").padStart(4),
    mark(r.correct).padStart(4),
    r.topScore.toFixed(3).padStart(7),
    r.pages.join(",").padEnd(18),
    r.unsupported.length ? r.unsupported.join(", ") : "",
  );
}

const rate = (n: number, d: number) => (d === 0 ? "n/a" : `${n}/${d}`);
const inScope = results.filter((r) => r.type !== "out-of-scope");
const oosRes = results.filter((r) => r.type === "out-of-scope");
console.log("\nSummary");
console.log(`  page hit      : ${rate(inScope.filter((r) => r.retrievalHit).length, inScope.length)}  (an expected page is in top-K)`);
console.log(`  value hit     : ${rate(inScope.filter((r) => r.valueHit).length, inScope.length)}  (one chunk holds all expected strings)`);
const kinds = [...new Set(inScope.map((r) => r.kind))];
for (const k of kinds) {
  const g = inScope.filter((r) => r.kind === k);
  console.log(`    ${k.padEnd(10)} page ${rate(g.filter((r) => r.retrievalHit).length, g.length)}  value ${rate(g.filter((r) => r.valueHit).length, g.length)}`);
}
if (!retrievalOnly) {
  console.log(`  correct       : ${rate(inScope.filter((r) => r.correct).length, inScope.length)}`);
  console.log(`  refusal pass  : ${rate(oosRes.filter((r) => r.correct).length, oosRes.length)}`);
  console.log(`  faithfulness flags (warnings): ${results.filter((r) => r.unsupported.length).length}`);
}

const failures = retrievalOnly
  ? results.filter((r) => r.retrievalHit === false || r.valueHit === false)
  : results.filter((r) => !r.correct);
for (const f of failures) console.log(`\nFAIL ${f.id}${retrievalOnly ? ` (page hit: ${f.retrievalHit}, value hit: ${f.valueHit})` : ""}\n  retrieved pages: ${f.pages.join(", ")}${f.answer ? `\n  answer: ${f.answer}` : ""}`);

if (saveJson) {
  await mkdir("data/extracted", { recursive: true });
  await writeFile("data/extracted/eval-latest.json", JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  console.log("\nSaved data/extracted/eval-latest.json");
}

await client.end();
process.exit(failures.length || stopped ? 1 : 0);
