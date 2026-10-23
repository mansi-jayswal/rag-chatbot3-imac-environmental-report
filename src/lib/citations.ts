// "(page 5)", "(pages 10, 22, 39)", "(page 5, page 21)", "(p. 7)": the model cites PDF pages this way.
const CITATION = /\(((?:pages?|pp?\.)\s*\d+(?:\s*(?:,|;|and|&|–|-)\s*(?:pages?\s*)?\d+)*)\)/gi;
const DIGITS = /\d+/g;

export type Part = { text: string } | { pages: number[] };

export function parseCitations(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(CITATION)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ pages: [...m[1].matchAll(DIGITS)].map((d) => Number(d[0])) });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function citedPages(text: string): Set<number> {
  const pages = new Set<number>();
  for (const m of text.matchAll(CITATION)) for (const d of m[1].matchAll(DIGITS)) pages.add(Number(d[0]));
  return pages;
}
