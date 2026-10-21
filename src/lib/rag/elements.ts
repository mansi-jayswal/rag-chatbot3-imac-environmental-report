import type { Chunk } from "./chunk";

export type Kind = "paragraph" | "table" | "chart" | "callout" | "footnote";
export type Element = {
  page: number;
  kind: Kind;
  text: string;
  refs: number[]; // footnote numbers this element cites
  footnote?: number; // set when kind === 'footnote'
  source: "vision" | "plain";
};

// ---------- vision Markdown -> elements ----------

const TAG_LINE = /^\[(heading|paragraph|table|chart|callout|footnote\s*(\d+))\]\s*(.*)$/i;
const VISION_MARKER = /\[\^(\d+)\]/g;

function takeVisionRefs(text: string): { text: string; refs: number[] } {
  const refs = [...text.matchAll(VISION_MARKER)].map((m) => Number(m[1]));
  return { text: text.replace(VISION_MARKER, "").replace(/[ \t]+$/gm, "").trim(), refs: [...new Set(refs)] };
}

// Blocks start with a tag line (see VISION_PROMPT). A [heading] is folded into the next table/chart as its title
// and otherwise dropped (the embedding header already names the page). Untagged leading text counts as a paragraph.
export function parseVisionMarkdown(md: string, page: number): Element[] {
  type Block = { tag: string; note?: number; lines: string[] };
  const blocks: Block[] = [];
  for (const line of md.replace(/<!--[\s\S]*?-->/g, "").replace(/```[a-z]*/g, "").split("\n")) {
    const m = TAG_LINE.exec(line.trim());
    if (m) {
      const tag = m[1].toLowerCase().startsWith("footnote") ? "footnote" : m[1].toLowerCase();
      blocks.push({ tag, note: m[2] ? Number(m[2]) : undefined, lines: m[3] ? [m[3]] : [] });
    } else if (line.trim() !== "" || blocks.at(-1)?.tag === "table") {
      if (blocks.length === 0) blocks.push({ tag: "paragraph", lines: [] });
      blocks.at(-1)!.lines.push(line);
    }
  }
  const out: Element[] = [];
  let heading = "";
  for (const b of blocks) {
    const body = b.lines.join("\n").trim();
    if (!body) continue;
    if (b.tag === "heading") {
      heading = body;
      continue;
    }
    const { text, refs } = takeVisionRefs(body);
    const withTitle = (b.tag === "table" || b.tag === "chart") && heading && !text.startsWith(heading) ? `${heading}\n${text}` : text;
    heading = "";
    out.push({
      page,
      kind: b.tag as Kind,
      text: withTitle,
      refs: b.tag === "footnote" ? [] : refs,
      footnote: b.tag === "footnote" ? b.note : undefined,
      source: "vision",
    });
  }
  return out;
}

// ---------- plain page text -> elements ----------

const RUNNING_HEADER = /^iMac \| Product Environmental Report \d+\s*/;
const MIN_PIECE = 40; // shorter fragments ("Packaging", "Smarter chemistry") are merged into the next piece
const MAX_PIECE = 1000;
const CALLOUT_MAX = 220; // plain text cannot tell a call-out from a paragraph; short pieces are labelled callout
const SENTENCE_END = /[.!?]["”’)]?\d{0,2}\s*$/; // a line ending a sentence, optionally with a glued footnote digit

// Endnotes: lines starting "N Word..." where N continues an increasing sequence (1, 2, 3 ...). The sequence
// requirement keeps lines such as "14040, 14044" or "95-99 percent" from being read as footnotes.
export function splitFootnotes(lines: string[]): { body: string[]; notes: { n: number; text: string }[] } {
  const starts: { i: number; n: number }[] = [];
  lines.forEach((line, i) => {
    const m = /^(?:Endnotes\s+)?(\d{1,2}) (?=[A-Za-z])/.exec(line);
    if (!m) return;
    const n = Number(m[1]);
    const prev = starts.at(-1);
    if (!prev || n === prev.n + 1) starts.push({ i, n });
  });
  // Need at least two consecutive notes, otherwise this is not an endnote page.
  if (starts.length < 2) return { body: lines, notes: [] };
  const notes = starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].i : lines.length;
    const first = lines[s.i].replace(/^(?:Endnotes\s+)?\d{1,2} /, "");
    return { n: s.n, text: [first, ...lines.slice(s.i + 1, end)].join(" ").replace(/\s+/g, " ").trim() };
  });
  return { body: lines.slice(0, starts[0].i), notes };
}

export function parsePlainPage(raw: string, page: number): Element[] {
  const lines = raw
    .replace(RUNNING_HEADER, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\d{1,2}$/.test(l) && l !== "Endnotes"); // drop bare marker digits and the title line
  const { body, notes } = splitFootnotes(lines);
  const out: Element[] = [];
  let buf = "";
  const flush = () => {
    const text = buf.replace(/\s+/g, " ").trim();
    buf = "";
    if (text) out.push({ page, kind: text.length <= CALLOUT_MAX ? "callout" : "paragraph", text, refs: [], source: "plain" });
  };
  for (const line of body) {
    buf += (buf ? " " : "") + line;
    if ((SENTENCE_END.test(line) && buf.length >= MIN_PIECE) || buf.length > MAX_PIECE) flush();
  }
  if (buf.trim().length < MIN_PIECE && out.length) out[out.length - 1].text += " " + buf.trim();
  else flush();
  for (const n of notes) out.push({ page, kind: "footnote", text: n.text, refs: [], footnote: n.n, source: "plain" });
  return out;
}

// Footnote digits are glued to the word in plain text ("audits.12", "content1", "wood fibers4").
// Rule: a 1-2 digit number directly after a letter (optionally one punctuation mark) and before whitespace or the end
// is a marker, but only if that footnote number is defined somewhere in the document. A sentence-final " 3"
// after a letter or comma/period is also accepted ("packaging 3"). Decimals ("20.5 W"), "CO2e" and years are not matched.
const GLUED = /(?<=[A-Za-z][.,;:)"”’]?)(\d{1,2})(?=\s|$)/g;
const TRAILING_SPACED = /(?<=[A-Za-z.,])\s(\d{1,2})$/;

export function extractPlainMarkers(text: string, known: Set<number>): { text: string; refs: number[] } {
  const refs: number[] = [];
  let cleaned = text.replace(GLUED, (all, d: string) => {
    if (!known.has(Number(d))) return all;
    refs.push(Number(d));
    return "";
  });
  const t = TRAILING_SPACED.exec(cleaned);
  if (t && known.has(Number(t[1]))) {
    refs.push(Number(t[1]));
    cleaned = cleaned.slice(0, t.index);
  }
  return { text: cleaned.replace(/\s{2,}/g, " ").trim(), refs: [...new Set(refs)] };
}

// ---------- footnote linking (D-08) + chunks (D-07) ----------

export function linkFootnotes(elements: Element[]): { elements: Element[]; missing: number[] } {
  const notes = new Map<number, string>();
  for (const e of elements) if (e.kind === "footnote" && e.footnote !== undefined && !notes.has(e.footnote)) notes.set(e.footnote, e.text);
  const known = new Set(notes.keys());
  const missing = new Set<number>();
  const linked = elements.map((e): Element => {
    if (e.kind === "footnote") return e;
    const plain = e.source === "plain" ? extractPlainMarkers(e.text, known) : { text: e.text, refs: e.refs };
    for (const r of plain.refs) if (!known.has(r)) missing.add(r);
    return { ...e, text: plain.text, refs: plain.refs.filter((r) => known.has(r)) };
  });
  return { elements: linked, missing: [...missing] };
}

export function elementsToChunks(elements: Element[]): Chunk[] {
  const notes = new Map<number, string>();
  for (const e of elements) if (e.kind === "footnote" && e.footnote !== undefined && !notes.has(e.footnote)) notes.set(e.footnote, e.text);
  return elements.map((e, chunkIndex) => {
    let content: string;
    if (e.kind === "footnote") content = `Footnote ${e.footnote}: ${e.text}`;
    else {
      const appended = e.refs.map((r) => `Footnote ${r}: ${notes.get(r)}`);
      content = [e.text, ...appended].join("\n\n");
    }
    return { page: e.page, chunkIndex, kind: e.kind, content };
  });
}
