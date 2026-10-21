# Vision ingestion (pipeline `vision-v1`, Phase 4)

Status: code complete and unit-checked offline; ONE real vision call worked (page 2), the rest is blocked by the
free-tier chat quota (server asked to wait about 1092 minutes). The full real vision ingest and the real eval
comparison are still to do.

## How it works, in plain language
1. **Decide which pages are visual** (`src/lib/rag/pages.ts`, thresholds in `config.ts`). For each page we look at the
   text items pdf.js reports. A table or chart stores its values as many tiny separate text items that are only
   "number + unit" (`20.6W`, `346 kg CO2e`, `50%`); prose keeps numbers inside long sentence items. A page with at least
   3 such items at body-text size (<= 14pt) is visual. Items at 18pt (the big "76%" call-outs on page 6) are
   not counted. Embedded image count is logged but is NOT used (D-06 finding).
2. **Visual pages go to Gemini** (`vision.ts`). We send the whole PDF as native PDF input and ask it to transcribe
   only page N (D-12). We did not add `pdf-lib` to cut out one page: the file is 12 pages (a few thousand input tokens)
   so a new dependency was not worth it. The prompt (`VISION_PROMPT`, version `v1`) asks for tagged blocks:
   `[heading] [paragraph] [table] [chart] [callout] [footnote N]`, footnote markers as `[^N]`, tables as Markdown with
   headers, charts as sentences with every number and the arithmetic, no invention.
3. **Cache**: the answer is saved to `data/extracted/vision-cache/<key>.md` (git-ignored), key = hash of the page
   content (text items + drawing operators) + prompt version + model. A re-run makes no API calls.
   Retries honor the server's `retryDelay` (existing `withRetry`); a delay over 2 minutes stops with a quota error.
4. **Other pages** use the `unpdf` plain text (`elements.ts: parsePlainPage`): running header and bare marker digits
   removed, endnotes split by a numbered sequence (1, 2, 3 ... so "14040, 14044" is not a note), the rest cut into sentence
   groups at line ends that finish a sentence (fragments under 40 chars merge forward, groups capped near 1000 chars).
   Plain text cannot tell a call-out from a paragraph, so groups up to 220 chars are labelled `callout`, longer ones `paragraph`.
5. **One chunk per element** (D-07): each table, chart, call-out, paragraph, footnote. A table is never split; a
   `[heading]` is folded into the following table/chart as its title.
6. **Footnotes** (D-08): note text is collected from every page; each citing chunk gets `Footnote N: <text>` appended and each
   note is also its own `footnote` chunk. Footnote digits glued to words in plain text (`audits.12`, `content1`,
   `components.14`) are removed ONLY when that note number is defined in the document and the digit(s) (1-2) follow a
   letter (optionally one punctuation mark) and precede whitespace/end, or end a chunk after " letter/,/." (`packaging 3`).
   Decimals, `CO2e`, units and years are not touched. Known gap: a space-separated marker in the middle of a chunk
   (p1 "packaging 3 100% recycled...") is not stripped or linked.
7. **Embed + store**: embedded text is `"<title>, page N, <kind>\n<content>"`; the stored `content` is the clean text
   (with appended footnotes). Transactional replace; skipped when PDF hash + config (pipeline, model, prompt version,
   element version, heuristic thresholds, source) are unchanged; `--force` overrides.

## Commands
- `npm run ingest` (default `--pipeline vision`), `npm run ingest -- --pipeline plain` (baseline `plain-text-v1`), `--force`.
- `npm run ingest -- --fixture`: DRY RUN, vision pages come from `evals/fixtures/vision-fixture-p{2,10,12}.md`
  (hand-written, never put in the cache; config records `visionSource: FIXTURE-dry-run`).
- `npm run check:vision [-- --print]`: offline checks (11 assertions, prints the heuristic table and all chunks).
- `npm run vision:page -- <n>`: one live call for one page (uses the cache).

## Heuristic scores per page (verified offline against the inventory)
| Page | quant items (body size) | big (18pt) | raster images | decision | inventory |
|---|---|---|---|---|---|
| 1 | 2 | 0 | 1 | plain | no |
| 2 | **3** | 0 | 0 | **vision** | yes |
| 3 | 0 | 0 | 0 | plain | no |
| 4 | 0 | 0 | 11 | plain | no |
| 5 | 0 | 0 | 0 | plain | no |
| 6 | 0 | 3 | 1 | plain | no |
| 7 | 0 | 0 | 0 | plain | no |
| 8 | 0 | 0 | 1 | plain | no |
| 9 | 0 | 0 | 0 | plain | no |
| 10 | **11** | 0 | 0 | **vision** | yes |
| 11 | 0 | 0 | 0 | plain | no |
| 12 | **18** | 0 | 0 | **vision** | yes |

Flags exactly {2, 10, 12}. Caveats: page 2 has the thinnest margin (3 vs threshold 3; page 1 has 2). Only one document was
tested, so this is tuned to this PDF; a table of bare numbers without units, or a page with 3+ standalone unit items that is
really prose, would be misjudged. Operator-count signals (path ops per page) were tested and rejected: p5 (115) and p2 (139) overlap,
and p10 (44) is lower than plain pages.

## Verified vs blocked
Verified offline (`npm run check:vision`, all pass): heuristic result, page hashes, cache round trip, footnote marker rules,
19 footnotes (1-16 from p11 plain text, 17-19 from the p12 fixture), copper callout carries footnote 14 text, p12 table is one chunk with header
row, p2 chart chunk holds 445 / -99 / 346 plus footnote 7, p10 tables unsplit. `npx tsc --noEmit` clean.

Verified live: ONE real Gemini call (page 2) returned correctly tagged output (chart sentence "Baseline emissions[^7] 445 kg, minus
emissions reductions of 99 kg ... equals iMac emissions[^10] 346 kg", all four column breakdowns, markers kept). It is in the vision cache
(a 2nd ingest run hits the cache for page 2).

Blocked: the page 10 call hit 429 with a server retryDelay of about 1092 minutes (daily quota). Pages 10 and 12 have no real vision
output yet. Real `npm run ingest` and the real eval comparison are pending; run `npm run ingest` after quota resets (page 2 is cached), then
`npm run eval -- --retrieval-only`.

## FIXTURE dry-run results (NOT real vision results)
Ingested with `--fixture` (85 chunks: 30 paragraph, 32 callout, 1 chart, 3 table, 19 footnote), then retrieval-only eval, then the DB was
restored to the plain-text baseline (37 chunks). Page hit 10/10, value hit 9/10 vs baseline 10/10, 10/10. The one miss (g02) is a metric artifact:
its valueString "Production 50%" does not match a Markdown row `| Production | 50% |`; the right chunk (p10, 346 kg table) was rank 1. The value
check should normalise Markdown pipes before the real comparison (golden set is user-reviewed, so not changed here). For g06/g07 the top chunk is now the
whole p12 table with `| Mode | 100V | 115V | 230V |` above the rows, so the value is tied to its voltage (the baseline's separated-header weakness).
