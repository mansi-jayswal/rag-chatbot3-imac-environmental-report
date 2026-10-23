# iMac Environmental Report Q&A (RAG, Use Case 3)

Question answering over one PDF, Apple's iMac Product Environmental Report (October 2024, 12 pages). The facts that
matter are not only in sentences: they sit in charts, tables, call-outs and footnotes. A correct answer pulls the
right number from the right place (for example the total carbon footprint and its use vs manufacturing split, or
the stand material and its recycled content). If the document has no answer, the system says so.

## How it works

Two ingestion pipelines are stored side by side as config, so they can be compared on the same test questions:

- `plain-text-v1` (baseline): extract text per page with `unpdf`, cut it into fixed 900-character windows with
  135 characters of overlap. Deliberately naive; a table can be split across windows.
- `vision-v1` (default): a heuristic picks the visual pages, those pages are transcribed by Gemini from the PDF,
  the rest use plain text, and every element becomes one chunk.

```
PDF -> heuristic: which pages are visual? (pages 2, 10, 12)
    -> visual pages: Gemini reads the PDF page -> tagged blocks (heading / paragraph / table / chart / callout / footnote)
    -> other pages: unpdf text -> sentence groups
    -> one chunk per element (a table is never split), each with its page number and kind
    -> footnote text appended to every chunk that cites it, and each footnote also stored as its own chunk
    -> Gemini embeddings (gemini-embedding-001, 768 dims) -> Postgres + pgvector (HNSW, cosine)

question -> embed -> vector search -> strict grounded prompt -> Gemini chat -> streamed answer
         -> evidence column: report section, page, element kind (chart/table/callout/footnote/paragraph) and text
```

In plain language:

1. **Picking visual pages.** A table or chart stores its values as many tiny text items that are only a number plus
   a unit (`20.6W`, `346 kg CO2e`, `50%`). A page with at least 3 such items at body-text size is sent to vision. The
   heuristic flags exactly pages 2, 10 and 12 on this PDF; it has only been tested on this one document.
2. **One chunk per element.** Splitting by size can cut a table from its headers; splitting by element keeps a
   number with its heading.
3. **Footnote linking.** A claim like "346 kg" carries a footnote caveat. The footnote text is appended to the chunk
   that cites it so the caveat is retrieved with the claim.
4. **Search and answer.** The question is embedded and compared with the chunk vectors. The top chunks go to the
   model with a prompt that allows only facts from them. The web UI shows the answer and, next to it, the evidence
   cards so the number can be checked against its source.

Next.js 16 serves the chat page and a streaming `POST /api/ask` route (NDJSON events: `sources`, `text`, `done` or
`error`). Ingestion, the CLI and the eval run on the host against the Dockerized database. The app container runs
only the server; it has no ingestion tooling, and the only file it reads from `data/` is the report PDF (served by
`GET /api/pdf` so "Open page" works).

## Chat UI

Same look and layout as the sibling task-2 ("Atlas"): a chat thread with an evidence column beside it (a bottom sheet
on phones), light and dark themes with a toggle.

- **Report sections.** Every excerpt and citation is named after the report section its page belongs to
  (`src/lib/sections.ts`): Highlights (p1), Progress toward carbon neutral (p2), Life cycle overview (p3), Design and
  Source (p4), Make (p5), Package and Ship (p6), Use (p7), Recover (p8), Definitions (p9), Carbon footprint (p10),
  Endnotes (p11-12). The five life-cycle stages and the carbon pages each have a colour; the rest use the ink colour.
- **Welcome screen.** One tile per section (fills the question box) and the three acceptance questions (send at once).
- **Answer.** A checklist shows the steps (searched the report, found N excerpts in which sections, wrote the answer).
  Page citations such as `(page 10)` become chips like "Carbon, p.10" in the section colour; clicking one highlights its
  excerpt. A cited page that was not retrieved shows as a dashed grey chip. "Not in the document." is its own state.
- **Evidence.** Cards grouped by section, with page, element kind, match score, tables rendered as tables, and
  "Open page" (opens the PDF at that page).
- **Mock mode.** `/?mock=1` fakes the stream (no API, no chat quota). Type `refusal-test`, `error-test` (quota),
  `busy-test` (busy), a question with "carbon" (table + chart, two-colour answer), or anything else (energy answer).

## Prerequisites

- Node.js 22, npm
- Docker (Compose v2)
- A Gemini API key
- The PDF at `data/iMac_PER_Oct2024.pdf`

## Setup

1. `cp .env.example .env.local`, set `GEMINI_API_KEY`, change the Postgres password and keep `DATABASE_URL` in sync.
2. Start the database and install dependencies:

   ```bash
   docker compose --env-file .env.local up -d db
   npm install
   npm run db:migrate
   ```

3. Ingest:

   ```bash
   npm run ingest                      # default pipeline: vision
   npm run ingest -- --pipeline plain  # baseline pipeline
   npm run ingest -- --force           # re-ingest even if the PDF and settings are unchanged
   ```

   Vision output is cached in `data/extracted/vision-cache/` (git-ignored); a re-run with the same page content,
   prompt version and model makes no API calls.

## Usage

| Command | What it does |
|---|---|
| `npm run dev` | Chat UI at http://localhost:3000 (`npm run dev -- -p <port>` if 3000 is taken) |
| `npm run ask -- "<question>"` | Retrieval only: prints the retrieved chunks and scores. Add `--answer` to also call the chat model |
| `npm run eval` | Run the golden set (`evals/golden.json`); flags `--ids a,b`, `--json`, `--retrieval-only` |
| `npm run eval -- --retrieval-only` | Retrieval checks without the chat model (page hit and value hit, per element kind) |
| `npm run check:vision` | Offline checks of the heuristic, parsing and footnote linking (no API calls); `-- --print` shows all chunks |
| `npm run vision:page -- <n>` | One live vision call for page n (uses the cache) |
| `npm run dump:pdf` | Dump raw per-page PDF text to `data/extracted/` |
| `npm run db:generate` / `npm run db:migrate` | Create / apply Drizzle migrations |
| `npm run lint` / `npm run build` | Lint / production build |

## Full stack in Docker

```bash
docker compose --env-file .env.local up -d --build
```

Runs `db` (pgvector/pgvector:pg17, 384 MB limit) and `app` (standalone Next.js image, 256 MB limit, read-only
filesystem with tmpfs for `/tmp` and `.next/cache`) on http://localhost:3000. Ingest still runs on the host against
`localhost:5432`, so run it before asking questions. Stop with `docker compose --env-file .env.local down` (this
keeps the data volume).

**Ports caveat.** task-3 and the sibling task-1 both default to host ports 5432 (db) and 3000 (app). Run only one
stack at a time, or set `DB_PORT` / `APP_PORT` in `.env.local` for one of them (and point `DATABASE_URL` at the new
db port for host scripts).

## Free-tier quotas

- Embeddings: about 100 requests per minute, so ingest may pause and retry.
- Chat and vision (Flash model): about 20 requests per day. When exhausted the UI shows a quota message,
  `npm run eval` cannot complete answer checks (`--retrieval-only` still works), and uncached vision pages cannot
  be transcribed. Retries honor the `retryDelay` the server returns.

## Layout

```
src/app/            Next.js page, /api/ask (streamed answers) and /api/pdf (the report) routes
src/components/     chat UI (chat-app, message, retrieval-steps, answer-text, evidence-panel, composer, theme-toggle)
src/lib/sections.ts report sections by page, and their colours
src/lib/rag/        pages (heuristic), vision, elements, chunk, embed, answer, config
src/lib/db/         Drizzle schema and client
scripts/            ingest, ask, eval, check-vision, vision-page, dump-pdf
evals/golden.json   golden questions (draft, awaiting review)
drizzle/            SQL migrations
db/init.sql         enables the pgvector extension
specs/              decisions and per-feature specs (see below)
```

## Project docs

- `specs/decisions.md`: append-only decision log
- `specs/imac-qa/spec.md`, `plan.md`: requirements and phased plan; `specs/progress.md`: session log
- `specs/imac-qa/page-inventory.md`, `baseline-plain-text.md`, `vision-ingestion.md`, `eval-review.md`

## Status

Verified:
- Plain-text baseline ingest (37 chunks) and retrieval; retrieval-only eval on the draft golden set: page hit 10/10,
  value hit 10/10.
- Vision pipeline code, heuristic (flags pages 2, 10, 12) and footnote linking, offline (`npm run check:vision`).
  Page 2 has one real cached vision transcript.
- Chat API and UI: type check, lint, build; Docker full-stack run (see `specs/progress.md`) with GET / 200, invalid
  body 400, and a streamed question returning sources and an answer.

Waiting on quota or review:
- Real vision transcripts for pages 10 and 12 (the page 10 call hit the daily quota), then a real
  `npm run ingest` and `npm run eval -- --retrieval-only` on the vision pipeline.
- The full eval (answer checks) and the plain-text vs vision comparison.
- User review of the golden set (`specs/imac-qa/eval-review.md`).
- Not checked in a browser: layout, citation highlights, the refusal state.
