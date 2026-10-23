import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { AskSource } from "@/lib/ask-protocol";
import { citedPages, parseCitations } from "@/lib/citations";
import { sectionOfPage, sharedTone, toneStyle } from "@/lib/sections";

type Props = { text: string; sources: AskSource[]; onCite: (ids: number[]) => void };

// Citation chip for one cited page. Matched = a retrieved excerpt comes from that page (click to highlight its cards),
// dotted in the page's section colour. Unmatched = dashed grey with a warning icon and not clickable: the answer cites
// a page that was not retrieved.
function CiteChip({ page, sources, onCite }: { page: number; sources: AskSource[]; onCite: (ids: number[]) => void }) {
  const section = sectionOfPage(page);
  const matched = sources.filter((s) => s.page === page);
  const label = `${section.tag}, p.${page}`;
  if (matched.length === 0) {
    return (
      <span
        title="Not among the retrieved excerpts. Check this page in the report."
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-dashed border-input px-1.5 py-0.5 align-baseline font-sans text-xs whitespace-nowrap text-muted-foreground"
      >
        <HugeiconsIcon icon={Alert02Icon} size={12} aria-hidden className="shrink-0" />
        {label}
        <span className="sr-only"> (not among the retrieved excerpts)</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCite(matched.map((s) => s.id)); }}
      title={`Show the excerpt from ${section.name}, PDF page ${page}`}
      style={toneStyle(section.tone)}
      className="mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded-md bg-tone-soft px-1.5 py-0.5 align-baseline font-sans text-xs font-medium whitespace-nowrap text-foreground hover:bg-tone-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--tone)" />
      {label}
    </button>
  );
}

// **bold** and citations inside one piece of text.
function Inline({ text, sources, onCite }: Props) {
  const nodes: ReactNode[] = [];
  parseCitations(text).forEach((part, i) => {
    if ("pages" in part) {
      part.pages.forEach((page, j) => nodes.push(<CiteChip key={`c${i}-${j}`} page={page} sources={sources} onCite={onCite} />));
      return;
    }
    part.text.split(/(\*\*[^*]+\*\*)/g).forEach((piece, j) => {
      if (/^\*\*[^*]+\*\*$/.test(piece)) nodes.push(<strong key={`b${i}-${j}`} className="font-semibold">{piece.slice(2, -2)}</strong>);
      else if (piece) nodes.push(piece);
    });
  });
  return <>{nodes}</>;
}

type Block = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

// Light markdown only: paragraphs, "- " / "* " bullets, "1. " lists, "#" headings and a lone "**Heading**" line.
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    const bullet = /^[*-]\s+(.*)$/.exec(t);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(t);
    const heading = /^#{1,4}\s+(.*)$/.exec(t) ?? /^\*\*([^*]+)\*\*:?$/.exec(t);
    const last = blocks[blocks.length - 1];
    if (!t) blocks.push({ kind: "p", text: "" });
    else if (heading) blocks.push({ kind: "h", text: heading[1] });
    else if (bullet) {
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === "ol") last.items.push(numbered[1]);
      else blocks.push({ kind: "ol", items: [numbered[1]] });
    }
    else if (last?.kind === "p" && last.text) last.text += ` ${t}`;
    else if (last?.kind === "p" && !last.text) last.text = t;
    else blocks.push({ kind: "p", text: t });
  }
  return blocks.filter((b) => b.kind !== "p" || b.text);
}

// Splits the blocks at each heading. When the parts cite different sections ("**Total footprint**" from the carbon
// table, "**Energy**" from Use), every part gets a thin bar in the colour of the section its citations share.
type Part = { blocks: Block[]; tone: string | null };

function toParts(blocks: Block[]): Part[] {
  const parts: Part[] = [];
  for (const b of blocks) {
    if (b.kind === "h" || parts.length === 0) parts.push({ blocks: [b], tone: null });
    else parts[parts.length - 1].blocks.push(b);
  }
  for (const p of parts) {
    if (p.blocks[0].kind !== "h") continue;
    const text = p.blocks.map((b) => (b.kind === "p" || b.kind === "h" ? b.text : b.items.join(" "))).join("\n");
    const pages = citedPages(text);
    p.tone = pages.size ? sharedTone(pages) : null;
  }
  return parts;
}

function Blocks({ blocks, sources, onCite }: { blocks: Block[] } & Omit<Props, "text">) {
  return blocks.map((b, i) => {
    if (b.kind === "h") return <h3 key={i} className="pt-1 font-sans text-sm font-semibold text-foreground"><Inline text={b.text} sources={sources} onCite={onCite} /></h3>;
    if (b.kind === "p") return <p key={i}><Inline text={b.text} sources={sources} onCite={onCite} /></p>;
    const items = b.items.map((item, j) => <li key={j}><Inline text={item} sources={sources} onCite={onCite} /></li>);
    return b.kind === "ul"
      ? <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{items}</ul>
      : <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">{items}</ol>;
  });
}

export function AnswerText({ text, sources, onCite }: Props) {
  const parts = toParts(toBlocks(text));
  const coloured = new Set(parts.map((p) => p.tone).filter(Boolean)).size > 1; // only when the parts really differ
  return (
    <div className="space-y-3 font-serif text-[1.0625rem] leading-[1.65]">
      {parts.map((p, i) =>
        coloured && p.tone ? (
          <div key={i} style={toneStyle(p.tone)} className="space-y-3 border-l-2 border-(--tone) pl-3">
            <Blocks blocks={p.blocks} sources={sources} onCite={onCite} />
          </div>
        ) : (
          <Blocks key={i} blocks={p.blocks} sources={sources} onCite={onCite} />
        ),
      )}
    </div>
  );
}
