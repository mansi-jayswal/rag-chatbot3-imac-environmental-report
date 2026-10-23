# Progress

## 2026-10-15
- Scaffolded with the CLIs (create-next-app, shadcn init) and the task-1 infra (Docker, Drizzle, Gemini deps, env, CLAUDE.md, decision log).
- Not started: purpose/requirements, schema, ingestion, UI.

## 2026-10-15 (grill session)
- Interviewed on approach; decisions D-05..D-14 logged (vision on visual pages with auto heuristic, per-element chunks, footnote linking, vector-first retrieval, 12-question eval, sources panel, 768-dim embeddings).
- Specs written: `specs/imac-qa/spec.md` and `plan.md` (D-15 matches task-1 UI). Next: Phase 1 page inventory.

## 2026-10-15 (Phase 1)
- `npm run dump:pdf` added; `specs/imac-qa/page-inventory.md` written (12 pages, 12 candidate golden questions, 3 acceptance answers).
- Visual pages are exactly 2, 10, 12 (vector chart/tables, 0 raster images). Image count is the wrong heuristic signal (decorative photos on 1, 4, 6, 8). Heuristic for D-06 must use vector drawing count / numeric-token density; to be tested in Phase 4.
- PDF inconsistency: p2 footnote 10 says 346 kg is for 512GB, p10 and p2 text say 256GB (512GB four ports is 391 kg). Golden set follows the p10 table.
- Gemini not called (chat quota exhausted).

## 2026-10-15 (Phase 2, plain-text baseline)
- Schema (`documents`, `chunks` with `kind`, vector(768), HNSW cosine + document_id index) + migration `drizzle/0000_*` applied.
- `scripts/ingest.mts` (`npm run ingest`): unpdf per page -> 900/135 fixed char chunks -> embeddings -> transactional replace, hash+config skip. 12 pages -> 37 chunks.
- `scripts/ask.mts` (`npm run ask -- "<q>" [--answer]`): retrieval only by default (chat quota exhausted, chat not called).
- Baseline results in `specs/imac-qa/baseline-plain-text.md`: (a) hit, (c) hit, (b) weak hit (p10 table chunks at rank 2-3, scrambled order with the 391 kg block, p9 glossary ranks first). Expect real failures on chart/table golden questions in Phase 3.

## 2026-10-15 (Phase 3, golden set + eval harness)
- `evals/golden.json` (12 items: 3 acceptance, 7 chart/table/callout/footnote incl. the 346 kg conflict and copper footnote traps, 2 refusals), values re-verified against the PDF (text + page images of p2/p10/p12). Draft awaiting user review: `specs/imac-qa/eval-review.md`.
- `scripts/eval.mts` ported from task-1 (`npm run eval`; flags `--ids`, `--json`, `--retrieval-only`); adds element kind per item, page hit vs stricter value hit (one chunk holds all expected strings) and value rank.
- Baseline plain-text-v1, retrieval only (chat not called): page hit 10/10, value hit 10/10. Retrieval is not the weak point; the risks are column/header mixups at answer time (p10, p12) and refusal behaviour, to be measured with the full eval when chat quota returns.

## 2026-10-15 (Phase 4, vision ingestion)
- Built pipeline `vision-v1`: `src/lib/rag/{pages,vision,elements}.ts`, `scripts/ingest.mts --pipeline plain|vision [--fixture] [--force]`, `scripts/check-vision.mts` (`npm run check:vision`), `scripts/vision-page.mts`. Details and heuristic table in `specs/imac-qa/vision-ingestion.md`.
- Heuristic (standalone "number + unit" text items at body size, >= 3) flags exactly pages 2, 10, 12; image count and path-op counts rejected.
- Offline checks pass; `npx tsc --noEmit` clean. One live vision call (page 2) worked and is cached; page 10 hit the daily quota (retryDelay ~1092 min). Pages 10/12 real transcripts still pending.
- Fixture dry run (hand-written p2/p10/p12 markdown): page hit 10/10, value hit 9/10 (g02 misses only because of Markdown pipes in the check string). Not real vision results. DB restored to plain-text baseline.
- Next: after quota reset run `npm run ingest`, then `npm run eval -- --retrieval-only`; normalise Markdown pipes in the eval value check.

## 2026-10-15 (Phase 5, answer API + chat UI)
- Ported from task-1: `src/app/api/ask/route.ts`, `src/lib/{ask-protocol,ask-client,highlight,citations,refusal,history,use-media-query}.ts`, `src/components/{workspace.tsx,workspace.css,composer,answer,evidence,history-rail}`, `globals.css`, `layout.tsx`, `page.tsx` (server shell reading `config.ts`, client island `Workspace`). `ui/button` and env/utils were already identical.
- `streamAnswer` added to `src/lib/rag/answer.ts`; prompt/config shared with `generateAnswer` via `generationRequest` (wording unchanged, eval unaffected).
- Adaptations: iMac wording/titles, the 3 acceptance questions as examples, out-of-scope example (battery life), history key `imac-ask:history:v1`, `AskSource.kind` + kind chip on evidence cards, table chunks rendered monospace/pre-wrap (no new deps).
- Verified: `tsc --noEmit`, `npm run lint`, `npm run build` (standalone) clean; no server deps found in `.next/static`; dev server: GET / 200, empty body 400, valid question streamed `sources` (with kind) then `error` code `quota`.
- Blocked by chat quota: a real streamed answer, citation chips/highlights on a live answer, refusal state live. No browser/screenshot tool used, so no visual verification.

## 2026-10-15 (Phase 6 groundwork, no-quota parts)
- README rewritten for task-3 (pipelines, setup, commands from package.json, compose run, ports caveat, quotas, status).
- Docker full stack: `docker compose --env-file .env.local up -d --build` built without Dockerfile/compose changes (image 335 MB; runner node_modules hold only next, react, sharp and their runtime deps; no `data/`, no tsx/drizzle-kit). db was already running and was left running; only the app container was started, checked and removed.
- Verified: GET / 200, `POST /api/ask` with `{}` 400, one valid question streamed `sources` then a real answer (346 kg two-port 256GB, 391 kg four-port 512GB) then `done` (chat quota appears available again). Memory: app 57 MiB / 256 MiB, db 30 MiB / 384 MiB; 0 restarts, no OOM.
- `npm audit`: 13 findings (4 moderate, 9 high), all in dev/build tooling (shadcn CLI chain, drizzle-kit/esbuild-kit, eslint-config-next). None in the production image (checked its node_modules). Only fixes offered are major downgrades; `--force` not run.
- Still pending: real vision ingest of pages 10 and 12, full eval, golden-set review, browser check of the UI.

## 2026-10-15 (real vision ingest)
- Real vision ingest done (pages 2, 10, 12 cached), 85 chunks stored, DB now on vision-v1. Retrieval-only eval 10/10 page and value hit (same as baseline). See D-21.
- Full eval blocked: chat quota exhausted again (429, ~999 min). Next: after reset, `npm run eval -- --json` for correctness/refusal, compare with the plain-text baseline (`npm run ingest -- --pipeline plain --force` then eval), review golden set, check 3 exam questions in the browser.
- Uncommitted: README, Phase 6 notes, D-20/D-21.

## 2026-10-16 (budgeted eval attempt)
- Ran the 10-item budgeted eval on vision-v1 (DB confirmed 85 chunks, no chat). Chat call 1 succeeded, call 2 hit 429 (daily limit 20 already spent); stopped as planned. 2 chat calls used, 0 recorded results (g01 answer lost because eval.mts only saves JSON at the end). See `specs/imac-qa/eval-review.md`.
- Added opt-in `EVAL_CHAT_BUDGET=1` to `generateAnswer` in `src/lib/rag/answer.ts` (5xx retried once, 429 never, logs call count); default behaviour unchanged. Uncommitted.
- Next after quota reset: save results incrementally in eval.mts, then rerun the 10 items.

## 2026-10-16 (full eval)
- Budgeted full eval on vision-v1 passed: 8/8 correct, 2/2 refusals, 10 chat calls on gemini-3.6-flash (D-23). Eval hardened (call cap, incremental save, pacing).
- Not done: g08/g09, plain-text chat baseline, browser check of the 3 exam questions, golden-set review by the user.

## 2026-10-23 (UI matched to task-2, report sections)
- Replaced the task-1 style UI with task-2's "Atlas" UI (D-25): `src/components/{chat-app,message,retrieval-steps,answer-text,evidence-panel,composer,theme-toggle,cx}`, `src/lib/{sections,mock-ask}.ts`, `src/app/api/pdf/route.ts`; removed `workspace(.css)`, `answer`, `evidence`, `history-rail`, `lib/{history,highlight,use-media-query}`.
- Report sections by page with colours for the life-cycle stages and carbon pages (D-26); "Open page" via `/api/pdf`, PDF shipped in the Docker image (D-27).
- Verified: `tsc --noEmit`, `npm run lint`, `npm run build` clean; dev server on port 3003 (3000/5432 are used by another project on this machine; `.env.local` already sets DB 5434 / app 3003): GET / 200 with the new welcome screen, GET /api/pdf 200 (6.8 MB) and Range 206, `POST /api/ask {}` 400, one real question (footprint split) streamed 5 sources (p10 table, p2 chart, p9, p10) and an answer citing `(page 10)` with 346 kg / 50% / 45% (1 chat call used).
- NOT verified: anything visual or interactive in a browser (layout, chip click/highlight, theme toggle, phone sheet, mock mode states); Docker image rebuild with the PDF.
