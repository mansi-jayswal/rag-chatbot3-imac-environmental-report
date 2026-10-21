import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { client, db } from "../src/lib/db";
import { EMBEDDING_DIMENSIONS, chunks, documents } from "../src/lib/db/schema";
import { chunkPages, type Chunk } from "../src/lib/rag/chunk";
import {
  CHUNK_OVERLAP, CHUNK_SIZE, CHUNK_VERSION, CLEAN_VERSION, DOCUMENT_NAME, ELEMENT_VERSION, EMBEDDING_MODEL,
  HEURISTIC_VERSION, MAX_QUANT_FONT_HEIGHT, MIN_QUANT_ITEMS, PDF_PATH, PIPELINE, VISION_MODEL, VISION_PIPELINE,
  VISION_PROMPT_VERSION,
} from "../src/lib/rag/config";
import { elementsToChunks, linkFootnotes, parsePlainPage, parseVisionMarkdown, type Element } from "../src/lib/rag/elements";
import { embedTexts } from "../src/lib/rag/embed";
import { classifyPages } from "../src/lib/rag/pages";
import { transcribePage } from "../src/lib/rag/vision";

// Usage: npm run ingest -- [--pipeline plain|vision] [--force] [--fixture]
//   --pipeline vision (default): vision-v1. --pipeline plain: the plain-text-v1 baseline.
//   --fixture: vision pages come from evals/fixtures (hand-written, offline DRY RUN, never written to the vision cache).
const args = process.argv.slice(2);
const force = args.includes("--force");
const fixture = args.includes("--fixture");
const pi = args.findIndex((a) => a === "--pipeline" || a.startsWith("--pipeline="));
const pipelineArg = pi === -1 ? "vision" : args[pi].includes("=") ? args[pi].split("=")[1] : args[pi + 1];
if (pipelineArg !== "plain" && pipelineArg !== "vision") {
  console.error("--pipeline must be 'plain' or 'vision'");
  process.exit(1);
}
const vision = pipelineArg === "vision";

const file = new Uint8Array(await readFile(PDF_PATH));
const contentHash = createHash("sha256").update(file).digest("hex");
const config: Record<string, string | number> = vision
  ? {
      pipeline: VISION_PIPELINE, embeddingModel: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS,
      elementVersion: ELEMENT_VERSION, heuristicVersion: HEURISTIC_VERSION, minQuantItems: MIN_QUANT_ITEMS,
      maxQuantFontHeight: MAX_QUANT_FONT_HEIGHT, visionModel: VISION_MODEL, visionPromptVersion: VISION_PROMPT_VERSION,
      visionSource: fixture ? "FIXTURE-dry-run" : "gemini",
    }
  : {
      pipeline: PIPELINE, chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP,
      embeddingModel: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS,
      cleanVersion: CLEAN_VERSION, chunkVersion: CHUNK_VERSION,
    };
const stable = (o: object) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const [existing] = await db.select().from(documents).where(eq(documents.name, DOCUMENT_NAME));
if (!force && existing && existing.contentHash === contentHash && stable(existing.config as object) === stable(config)) {
  console.log(`"${DOCUMENT_NAME}" is already ingested with pipeline ${config.pipeline} and the same PDF and settings; skipping (use --force to re-ingest).`);
  await client.end();
  process.exit(0);
}

// pdfjs may detach the buffer it is given, so hand it copies.
const pdf = await getDocumentProxy(file.slice());
const { text: rawPages } = await extractText(await getDocumentProxy(file.slice()), { mergePages: false });

let pieces: Chunk[];
if (!vision) {
  pieces = chunkPages(rawPages, CHUNK_SIZE, CHUNK_OVERLAP);
} else {
  const infos = await classifyPages(pdf);
  console.log("page  quant-items  big  raster-imgs  decision");
  for (const i of infos) {
    console.log(`${String(i.page).padStart(4)}  ${String(i.quantItems).padStart(11)}  ${String(i.bigQuantItems).padStart(3)}  ${String(i.rasterImages).padStart(11)}  ${i.visual ? "VISION" : "plain text"}`);
  }
  const elements: Element[] = [];
  for (const info of infos) {
    if (!info.visual) {
      elements.push(...parsePlainPage(rawPages[info.page - 1], info.page));
      continue;
    }
    let md: string;
    if (fixture) {
      md = await readFile(`evals/fixtures/vision-fixture-p${info.page}.md`, "utf8");
      console.log(`page ${info.page}: FIXTURE markdown (dry run, not real vision output)`);
    } else {
      const r = await transcribePage(file, info.page, info.hash);
      md = r.markdown;
      console.log(`page ${info.page}: vision ${r.fromCache ? "cache hit (no API call)" : "API call"}`);
    }
    elements.push(...parseVisionMarkdown(md, info.page));
  }
  const linked = linkFootnotes(elements);
  if (linked.missing.length) console.warn(`Footnote markers with no definition: ${linked.missing.join(", ")}`);
  pieces = elementsToChunks(linked.elements);
  const byKind: Record<string, number> = {};
  for (const c of pieces) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  console.log(`kinds: ${JSON.stringify(byKind)}`);
}
const sizes = pieces.map((c) => c.content.length);
console.log(
  `${rawPages.length} pages -> ${pieces.length} chunks (chars min ${Math.min(...sizes)}, avg ${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)}, max ${Math.max(...sizes)})`,
);

// Embed first (slow, can fail) so the DB transaction below is short and all-or-nothing.
// Baseline header: "<name>, page N"; vision header adds the element kind (spec: title + page + kind).
const vectors = await embedTexts(
  pieces.map((c) => `${DOCUMENT_NAME}, page ${c.page}${vision ? `, ${c.kind}` : ""}\n${c.content}`),
  "RETRIEVAL_DOCUMENT",
);

await db.transaction(async (tx) => {
  const [doc] = await tx
    .insert(documents)
    .values({ name: DOCUMENT_NAME, contentHash, config })
    .onConflictDoUpdate({ target: documents.name, set: { contentHash, config } })
    .returning({ id: documents.id });
  await tx.delete(chunks).where(eq(chunks.documentId, doc.id));
  const rows = pieces.map((c, i) => ({ ...c, documentId: doc.id, embedding: vectors[i] }));
  for (let i = 0; i < rows.length; i += 200) await tx.insert(chunks).values(rows.slice(i, i + 200));
});

console.log(`Stored ${pieces.length} chunks for "${DOCUMENT_NAME}" (pipeline ${config.pipeline}${fixture ? ", FIXTURE dry run" : ""})`);
await client.end();
process.exit(0);
