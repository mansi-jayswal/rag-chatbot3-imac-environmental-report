# Spec: iMac Product Environmental Report Q&A (Use Case 3)

## Goal
Question answering over one short, visual PDF (`data/iMac_PER_Oct2024.pdf`, 12 pages). Most facts sit
inside charts, small tables, icon call-outs and footnotes, not in body paragraphs. A correct answer
pulls the exact number from that chart/table/call-out, not a vague sentence nearby. If the document
does not say, answer "Not in the document."

## Acceptance questions (pass/fail bar)
1. How much less energy does iMac use compared to the ENERGY STAR requirement?
2. What is the total carbon footprint of the iMac, and how much comes from product use versus manufacturing?
3. What material is the iMac stand made from, and what percentage of it is recycled?
Plus an out-of-scope question that must answer "Not in the document."

## Pipeline requirements
1. Extract: `unpdf` per page for plain text (page numbers kept). A heuristic flags visual pages
   (embedded images, low text per image, chart/table signals). Flagged pages are cut out as a single-page PDF
   and sent to Gemini vision (D-05, D-06, D-12). Vision output is cached on disk, keyed by page content hash.
2. Vision prompt: transcribe the page into Markdown; tables as Markdown tables, charts as sentences with
   every number and its label (and the arithmetic, e.g. baseline minus reductions equals total), call-outs as
   one line each, footnote markers and notes preserved.
3. Chunk: one chunk per element (table, chart description, call-out, paragraph, footnote). Each chunk has
   `page` and `kind` (`paragraph | table | chart | callout | footnote`). Never split a table (D-07).
4. Footnotes: note text is appended to every chunk that cites it, and each note is also its own chunk (D-08).
5. Embed: `gemini-embedding-001`, 768 dims, document vs query task types, "title + page + kind" header
   embedded, clean text stored (D-13).
6. Store: Postgres + pgvector via Drizzle (`documents`, `chunks` with `kind`), HNSW or exact search.
7. Re-run: replace the document's chunks in one transaction; skip if hash + config unchanged; vision cache
   avoids repeat Gemini calls.
8. Retrieve: vector top-K (D-09). Keyword search is a later, measured experiment. No reranker.
9. Answer: strict grounding prompt (context only, cite PDF pages, exact "Not in the document." refusal,
   temperature ~0), streamed.

## UI requirements (now match task-2, D-25; the task-1 version below is superseded)
Chat thread + evidence column like `../task-2` ("Atlas" look, theme toggle, retrieval checklist, mock mode), with the
iMac report's own sections (by page, `src/lib/sections.ts`) in place of task-2's regions: section-coloured citation
chips, evidence cards grouped by section, one welcome tile per section, "Open page" via `GET /api/pdf`. Current chat
only (no saved history). NDJSON protocol and server prompt unchanged.

## UI requirements (match task-1, D-15; superseded by D-25)
Same layout and components as `../task-1`: workspace with composer, streamed answer, collapsible evidence
panel, history rail (browser-only localStorage), refusal state, quota/error states, NDJSON `POST /api/ask`
(`sources`, `text`, `done`/`error`). Differences from task-1:
- Evidence cards show the element kind (chart / table / callout / footnote / paragraph) next to the page.
- Citations by PDF page, as in task-1.
- Branding and constants switched to the iMac report (document name, history storage key).

## Evaluation
`evals/golden.json`: ~12 questions with expected strings and pages (3 acceptance, ~9 on charts, tables,
callouts, footnotes, plus out-of-scope). `npm run eval` reports retrieval hit, correctness, refusal.
Includes a plain-text-only vs vision comparison on the same set (D-10).

## Non-goals
Reranking, GraphRAG, multi-document support, page-image viewer, auth.

See `specs/decisions.md` for rationale.
