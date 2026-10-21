// Offline checks for the vision-v1 pipeline: no API key, no DB, no network. Run: npm run check:vision [-- --print]
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { PDF_PATH } from "../src/lib/rag/config";
import { elementsToChunks, extractPlainMarkers, linkFootnotes, parsePlainPage, parseVisionMarkdown, type Element } from "../src/lib/rag/elements";
import { classifyPages } from "../src/lib/rag/pages";
import { readVisionCache, visionCacheKey, visionPrompt, writeVisionCache } from "../src/lib/rag/vision";

const print = process.argv.includes("--print");
const file = new Uint8Array(await readFile(PDF_PATH));
let n = 0;
const ok = (name: string) => console.log(`ok ${++n} - ${name}`);

// 1. heuristic flags exactly {2,10,12}
const infos = await classifyPages(await getDocumentProxy(file.slice()));
console.table(infos.map(({ page, quantItems, bigQuantItems, rasterImages, visual }) => ({ page, quantItems, bigQuantItems, rasterImages, visual })));
assert.deepEqual(infos.filter((i) => i.visual).map((i) => i.page), [2, 10, 12]);
ok("heuristic flags exactly pages 2, 10, 12");
assert.ok(infos.find((i) => i.page === 4)!.rasterImages > 0 && !infos.find((i) => i.page === 4)!.visual);
ok("p4 has raster images but is not flagged (image count is not the signal)");
assert.equal(new Set(infos.map((i) => i.hash)).size, 12);
ok("page hashes are distinct and stable-length");

// 2. cache
const dir = await mkdtemp(path.join(os.tmpdir(), "vcache-"));
assert.equal(await readVisionCache("abc", dir), null);
await writeVisionCache("abc", "hello", dir);
assert.equal(await readVisionCache("abc", dir), "hello");
assert.notEqual(visionCacheKey("abc"), visionCacheKey("abd"));
assert.match(visionPrompt(2), /page 2 of the attached PDF/);
ok("vision cache round trip, key depends on page hash, prompt names the page");

// 3. footnote marker rules
const known = new Set([1, 5, 12, 13, 14]);
assert.deepEqual(extractPlainMarkers("smelters to participate in third-party audits.12 By 2025", known), { text: "smelters to participate in third-party audits. By 2025", refs: [12] });
assert.deepEqual(extractPlainMarkers("More than 15% recycled content1", known), { text: "More than 15% recycled content", refs: [1] });
assert.deepEqual(extractPlainMarkers("We use 100 percent in 13 components.14", known), { text: "We use 100 percent in 13 components.", refs: [14] });
assert.deepEqual(extractPlainMarkers("of the packaging 5", known), { text: "of the packaging", refs: [5] });
assert.deepEqual(extractPlainMarkers("Idle 20.5 W and 91.1% CO2e 3", known).refs, []);
assert.deepEqual(extractPlainMarkers("in 2024 over 20 percent", known).refs, []);
ok("glued footnote digits: stripped only for defined notes; decimals, units, plain numbers untouched");

// 4. full pipeline from fixtures (plain pages from the real PDF)
const { text: raw } = await extractText(await getDocumentProxy(file.slice()), { mergePages: false });
const elements: Element[] = [];
for (const info of infos) {
  if (info.visual) {
    const md = await readFile(`evals/fixtures/vision-fixture-p${info.page}.md`, "utf8");
    elements.push(...parseVisionMarkdown(md, info.page));
  } else elements.push(...parsePlainPage(raw[info.page - 1], info.page));
}
const linked = linkFootnotes(elements);
assert.deepEqual(linked.missing, [], "every cited footnote has a definition");
const chunks = elementsToChunks(linked.elements);
const by = (pred: (c: (typeof chunks)[number]) => boolean) => chunks.filter(pred);

const notes = by((c) => c.kind === "footnote");
assert.deepEqual(notes.map((c) => c.content.match(/^Footnote (\d+)/)![1]).sort((a, b) => +a - +b), Array.from({ length: 19 }, (_, i) => String(i + 1)));
ok("19 footnotes found (1-16 from plain p11, 17-19 from the vision page 12), each its own chunk");

const copper = by((c) => c.page === 4 && /thermal module components/.test(c.content) && c.kind !== "footnote");
assert.equal(copper.length, 1);
assert.match(copper[0].content, /Footnote 14: Recycled copper in the thermal module applies to iMac \(four ports\) only/);
assert.doesNotMatch(copper[0].content.split("\n\n")[0], /components\.14/);
ok("p4 copper callout carries footnote 14 text and no glued digit");

const tbl = by((c) => c.kind === "table" && c.page === 12);
assert.equal(tbl.length, 1);
assert.match(tbl[0].content, /\| Idle-Display On \| 20\.5W \| 20\.6W \| 20\.9W \|/);
assert.match(tbl[0].content, /\| Mode \| 100V \| 115V \| 230V \|/);
ok("p12 power table is one chunk with its header row");

const chart = by((c) => c.kind === "chart")[0];
assert.ok(chart.page === 2 && /445 kg/.test(chart.content) && /346 kg/.test(chart.content) && /-99 kg/.test(chart.content));
assert.match(chart.content, /Footnote 7:/);
ok("p2 chart is one chunk holding 445 / -99 / 346 and the footnote 7 text");

const t10 = by((c) => c.kind === "table" && c.page === 10);
assert.equal(t10.length, 2);
assert.match(t10[0].content, /Footnote 7:/);
ok("p10 has two tables, never split; GHG-reductions row carries footnote 7");

assert.ok(chunks.every((c) => !/\[\^\d+\]|\[(paragraph|table|chart|callout|footnote)/.test(c.content)));
assert.ok(chunks.every((c) => ["paragraph", "table", "chart", "callout", "footnote"].includes(c.kind)));
ok("no leftover tags or markers; every kind is valid");

console.log(`\n${chunks.length} chunks from fixtures:`, chunks.reduce<Record<string, number>>((a, c) => ((a[c.kind] = (a[c.kind] ?? 0) + 1), a), {}));
if (print) for (const c of chunks) console.log(`\n--- p${c.page} [${c.kind}] (${c.content.length} chars)\n${c.content}`);
