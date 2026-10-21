# Baseline: plain-text pipeline (`plain-text-v1`)

Pipeline: `unpdf` text per page, whitespace collapsed, fixed 900-char windows with 135 overlap (page kept), embedded
with `gemini-embedding-001` at 768 dims (RETRIEVAL_DOCUMENT for chunks, RETRIEVAL_QUERY for queries), pgvector cosine
search, top 5. No vision, no cleaning, no element awareness. Ingest result: 12 pages -> 37 chunks
(min 197, avg 773, max 900 chars). Retrieval only; the chat model was not called.

Run with `npm run ask -- "<question>"`.

## Results

| # | Question | Expected | Top-5 (page, score) | Chunk with the value tied to its label? | Verdict |
|---|----------|----------|---------------------|------------------------------------------|---------|
| a | How much less energy does iMac use compared to the ENERGY STAR requirement? | 58 percent (p7) | p7 .816, p7 .800, p12 .791, p2 .764, p12 .760 | Yes. #1 and #2 (both p7) contain "iMac consumes 58 percent less energy than the requirement for ENERGY STAR" | HIT |
| b | Total carbon footprint, and use vs manufacturing split? | 346 kg; use 45%, production 50% (p10 table) | p9 .816, p10 .806, p10 .802, p9 .793, p2 .784 | Partly. #2 and #3 (p10) hold "Total product footprint 346 kg CO2e ... Production 50% ... Product use 45%". But the best hit is the p9 glossary, and #2 also carries the four-port "391 kg" ahead of the two-port block, with the column header "iMac (two ports) 256GB" only loosely before the rows. The p2 chart chunk has 346 kg but no split | WEAK HIT (right chunks present at rank 2-3, tied to labels only by reading order; the p9 definition text outranks them) |
| c | Stand material and % recycled? | 100 percent recycled aluminum (p1/p4) | p4 .795, p2 .782, p4 .776, p1 .776, p11 .747 | Yes. #1 (p4) "Aluminum. We use 100 percent recycled aluminum in the stand."; also p2 and p1 | HIT |

Score: a and c pass cleanly; b is a fragile pass.

## Why (plain language)

- **a** is a normal sentence that appears twice on p7 as prose. Plain text keeps the number next to its words, so
  this works. It is the kind of question plain text is good at. (The watt table on p12 does show up, but its
  column headers 100V/115V/230V are separated from the values, so a follow-up about "idle power at 115V" would fail.)
- **b** is the table question. Luck, not design, saved it: the whole p10 table happened to land in one 900-char
  window, so "346 kg", "Production 50%" and "Product use 45%" sit in one chunk. But the text order is scrambled:
  the four-port 391 kg block is printed before the two-port block, and the table headers are not next to the
  rows (see page-inventory p10). An LLM could easily answer 391 kg, or mix the splits. The nearest-neighbour ranking
  also preferred the p9 glossary ("Production", "Use" phase definitions) because its wording matches the question
  better than a table of numbers. With slightly different chunk boundaries the table would be cut and the
  numbers detached from their labels. The p2 chart chunk shows "-99 kg ... 346 kg iMac emissions" but the chart's
  segments and baseline 445 kg are lost to reading order (page-inventory p2).
- **c** is a prose callout on p1 and p4 ("uses 100% recycled aluminum in the stand"), so plain text keeps it intact.
  The p4 chunk is a long mix of callouts (gold, plastic, tin, aluminum), which dilutes its score, but it still ranks first.

Takeaway: the three acceptance questions are mostly answerable from plain text, because the headline facts are
written as sentences. The baseline's real weaknesses are expected on the golden-set questions about the chart (p2:
445 kg baseline, -99 kg) and tables (p10 four-port 391 kg vs two-port, p12 power by voltage), where
labels and numbers are separated or ambiguous. Phase 3's eval harness should measure that on this baseline.
