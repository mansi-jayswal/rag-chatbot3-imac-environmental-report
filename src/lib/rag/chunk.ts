export type Chunk = { page: number; chunkIndex: number; kind: string; content: string };

// Naive baseline: collapse whitespace, then slice each page into fixed-size character windows with overlap.
// Deliberately ignores sentences, tables and layout.
export function chunkPages(pages: string[], size: number, overlap: number): Chunk[] {
  const out: Chunk[] = [];
  pages.forEach((raw, i) => {
    const text = raw.replace(/\s+/g, " ").trim();
    for (let start = 0; start < text.length; start += size - overlap) {
      const content = text.slice(start, start + size).trim();
      if (content) out.push({ page: i + 1, chunkIndex: out.length, kind: "paragraph", content });
      if (start + size >= text.length) break;
    }
  });
  return out;
}
