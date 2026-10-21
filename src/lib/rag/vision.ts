import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VISION_CACHE_DIR, VISION_MODEL, VISION_PROMPT_VERSION } from "./config";

// Versioned prompt (bump VISION_PROMPT_VERSION in config.ts when you change it).
// The output format is a contract with parseVisionMarkdown() in elements.ts: every block starts with a tag.
export const VISION_PROMPT = `You are transcribing ONE page of a PDF report into Markdown so that a search system can index it.
Transcribe ONLY page {PAGE} of the attached PDF (counting from 1). Ignore every other page.

Output a sequence of blocks separated by a blank line. Start each block with exactly one of these tags on its own first line:
[heading]          a section title or table/chart title (one line)
[paragraph]        body text, as written
[table]            one table as a Markdown table, header row kept, one row per line; never split a table, and put the table's own title above it as a plain line
[chart]            a chart or diagram as sentences: every number with its label, which column or series each number belongs to, and the arithmetic when the numbers relate (for example "Baseline emissions 445 kg, minus emissions reductions of 99 kg, equals 346 kg")
[callout]          one highlighted fact or icon call-out per block, one line
[footnote N]       the text of endnote number N, as written

Rules:
- Footnote markers (small superscript numbers attached to words or numbers) are written as [^N] right after the word, for example "stand.[^12]". Keep every marker.
- Keep every number, unit and sign exactly as printed. Do not round, convert or compute new numbers (except the arithmetic sentence in a [chart] block when the page itself shows the parts and the total).
- Table cells that are empty stay empty. Keep column headers attached to the table.
- Do not invent anything and do not describe decoration (photos, logos, icons) unless it carries text.
- Output only the blocks, no preface and no code fences.`;

export function visionPrompt(page: number): string {
  return VISION_PROMPT.replace("{PAGE}", String(page));
}

// Cache key = page content hash + prompt version + model: any change to the page, prompt or model is a miss.
export function visionCacheKey(pageHash: string): string {
  return createHash("sha256").update(`${pageHash}|${VISION_PROMPT_VERSION}|${VISION_MODEL}`).digest("hex").slice(0, 32);
}

export function visionCachePath(pageHash: string, dir = VISION_CACHE_DIR): string {
  return path.join(dir, `${visionCacheKey(pageHash)}.md`);
}

export async function readVisionCache(pageHash: string, dir = VISION_CACHE_DIR): Promise<string | null> {
  try {
    return await readFile(visionCachePath(pageHash, dir), "utf8");
  } catch {
    return null;
  }
}

export async function writeVisionCache(pageHash: string, markdown: string, dir = VISION_CACHE_DIR): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(visionCachePath(pageHash, dir), markdown, "utf8");
}

export type VisionResult = { markdown: string; fromCache: boolean };

// D-12: the whole PDF is sent (native PDF input) with "transcribe page N only". A 12-page PDF is a few thousand
// input tokens, so splitting out a single page (which would need pdf-lib) is not worth a new dependency.
// The Gemini client is imported lazily so the offline checks never need an API key.
export async function transcribePage(
  pdfBytes: Uint8Array,
  page: number,
  pageHash: string,
  opts: { maxAttempts?: number } = {},
): Promise<VisionResult> {
  const cached = await readVisionCache(pageHash);
  if (cached !== null) return { markdown: cached, fromCache: true };
  const { ai, withRetry } = await import("./embed");
  const res = await withRetry(
    () =>
      ai.models.generateContent({
        model: VISION_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "application/pdf", data: Buffer.from(pdfBytes).toString("base64") } },
              { text: visionPrompt(page) },
            ],
          },
        ],
        config: { temperature: 0 },
      }),
    { maxAttempts: opts.maxAttempts ?? 3 },
  );
  const markdown = (res.text ?? "").trim();
  if (!markdown) throw new Error(`Vision returned no text for page ${page}`);
  await writeVisionCache(pageHash, markdown);
  return { markdown, fromCache: false };
}
