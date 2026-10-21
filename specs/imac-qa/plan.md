# Plan: iMac visual-document Q&A (Use Case 3)

Vertical slices, same style as task-1: each phase runs end to end and ends with something measurable.
Status lives in `progress.md`. Decision IDs refer to `specs/decisions.md`.

## Phase 0 - Foundation (DONE)
Docker, packages, env, PDF in `data/`, decisions D-01..D-15, spec and plan.

## Phase 1 - Look at the document (no code design yet)
- `scripts/dump-pdf.mts`: dump per-page plain text to `data/extracted/` (copy from task-1).
- Look at all 12 pages once (page images via `pdftoppm` to the scratchpad, not committed) and note which
  hold charts/tables/call-outs. This becomes the ground truth for checking the page heuristic (D-06) and
  for writing golden questions.
Exit: a written page-by-page inventory in `specs/imac-qa/page-inventory.md`.

## Phase 2 - Walking skeleton, plain text only (BASELINE)
- `src/lib/env.ts` check, `src/lib/db/schema.ts` (`documents`, `chunks` with `kind`, vector(768)), first
  migration, `npm run db:migrate`.
- Minimal ingest with plain text only, fixed-size chunks, batched embed; `scripts/ask.mts` CLI.
- Confirm Gemini model IDs (task-1 uses `gemini-embedding-001` and `gemini-3.8-flash`).
Exit: the 3 acceptance questions run end to end; record results as the plain-text BASELINE (expected to fail
the chart/table ones, which is the lesson).

## Phase 3 - Golden set + eval harness
- Draft ~12 questions from the page inventory with expected values and pages; user reviews them against the
  PDF (`specs/imac-qa/eval-review.md`).
- Port `scripts/eval.mts` (retrieval hit, correctness, refusal, `--retrieval-only`).
- Run on the baseline to get numbers before any improvement.
Exit: documented baseline score.

## Phase 4 - Vision ingestion (the main work)
- Page heuristic (images, text per image) checked against the inventory; log each page's decision.
- Single-page PDF split, Gemini vision call, disk cache, retry honoring the server's `retryDelay` (free-tier limits).
- Parse vision Markdown into elements (kind per chunk); footnote linking (D-08); one chunk per element (D-07).
- Transactional re-ingest with hash + config + version skip (like task-1 D-18).
Exit: eval re-run and compared to the baseline; the 3 acceptance questions pass retrieval.

## Phase 5 - Answer + API + UI
- Port `src/lib/rag/answer.ts` (grounding prompt, streaming) and `POST /api/ask` + `ask-protocol.ts` from task-1.
- Port UI from task-1: `workspace`, `composer`, `answer`, `evidence`, `history-rail`, `workspace.css`,
  `globals.css`, `highlight`, `citations`, `refusal`, `history` (new storage key). Add the `kind` chip to
  evidence cards (D-15).
- `npm run build` passes; no server deps in the client bundle.
Exit: acceptance questions answered in the browser with visible sources.

## Phase 6 - Experiments and hardening
- Keyword search + merge experiment, measured on the golden set (D-09). Keep only if it helps.
- Full compose run within resource limits, README (setup, ingest, eval).
Exit: fresh clone -> documented commands -> working app.

## Cross-cutting rules
- After each phase: update `progress.md`, append to `decisions.md` (flag overrides).
- No tuning before the eval harness exists (Phase 3).
- Chat quota is ~20/day: use `--retrieval-only` while iterating.
