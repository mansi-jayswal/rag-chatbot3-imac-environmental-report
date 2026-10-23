import type { CSSProperties } from "react";

// The report's own sections, by PDF page (see specs/imac-qa/page-inventory.md). Every chunk carries its page, so the
// UI can name and colour the section of any excerpt or citation without asking the server.
// Colour coding: only the five life-cycle stages and the carbon pages get a colour; the cover, the life-cycle overview,
// the definitions and the endnotes use the ink colour. Colours are CSS tokens in globals.css.
export const INK = "var(--primary)";

export type Section = { name: string; tag: string; pages: number[]; tone: string };

export const SECTIONS: Section[] = [
  { name: "Highlights", tag: "Cover", pages: [1], tone: INK },
  { name: "Progress toward carbon neutral", tag: "Carbon", pages: [2], tone: "var(--section-carbon)" },
  { name: "Life cycle overview", tag: "Life cycle", pages: [3], tone: INK },
  { name: "Design and Source", tag: "Design & Source", pages: [4], tone: "var(--section-source)" },
  { name: "Make", tag: "Make", pages: [5], tone: "var(--section-make)" },
  { name: "Package and Ship", tag: "Package & Ship", pages: [6], tone: "var(--section-ship)" },
  { name: "Use", tag: "Use", pages: [7], tone: "var(--section-use)" },
  { name: "Recover", tag: "Recover", pages: [8], tone: "var(--section-recover)" },
  { name: "Definitions", tag: "Definitions", pages: [9], tone: INK },
  { name: "Carbon footprint", tag: "Carbon", pages: [10], tone: "var(--section-carbon)" },
  { name: "Endnotes", tag: "Endnotes", pages: [11, 12], tone: INK },
];

// The six coloured topics in life-cycle order (logo bars, welcome tiles).
export const STAGE_TONES = [
  "var(--section-carbon)",
  "var(--section-source)",
  "var(--section-make)",
  "var(--section-ship)",
  "var(--section-use)",
  "var(--section-recover)",
];

const UNKNOWN: Section = { name: "Report", tag: "Report", pages: [], tone: INK };

export const sectionOfPage = (page: number): Section => SECTIONS.find((s) => s.pages.includes(page)) ?? UNKNOWN;

// Sets the --tone variable that the tone utilities in globals.css (bg-tone-soft, border-tone-faint, ...) read.
export const toneStyle = (tone: string) => ({ "--tone": tone }) as CSSProperties;

// One colour for a set of pages: the shared one when they all sit in same-coloured sections, ink when they disagree
// or there are none. An answer citing Use and Endnotes therefore gets an ink bar.
export function sharedTone(pages: Iterable<number>): string {
  const tones = new Set([...pages].map((p) => sectionOfPage(p).tone));
  return tones.size === 1 ? [...tones][0] : INK;
}
