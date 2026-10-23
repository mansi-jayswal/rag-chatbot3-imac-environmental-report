import { Cancel01Icon, File02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { PDF_URL, type AskSource } from "@/lib/ask-protocol";
import { sectionOfPage, toneStyle, type Section } from "@/lib/sections";
import { cx } from "./cx";
import type { AssistantMessage } from "./message";

const CLAMP_CHARS = 320;
const KIND_LABEL: Record<AskSource["kind"], string> = { table: "Table", chart: "Chart", callout: "Call-out", footnote: "Footnote", paragraph: "Paragraph" };

type Piece = { kind: "text"; text: string } | { kind: "table"; rows: string[][] };

// An excerpt is plain text, or (tables from the vision transcript) a Markdown table followed by the footnotes it cites.
// Lines starting with "|" become table rows; the "| --- |" separator line is dropped.
function toPieces(content: string): Piece[] {
  const pieces: Piece[] = [];
  for (const line of content.split("\n")) {
    const last = pieces[pieces.length - 1];
    if (line.trim().startsWith("|")) {
      if (/^\|[\s:|-]+\|?$/.test(line.trim())) continue;
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (last?.kind === "table") last.rows.push(cells);
      else pieces.push({ kind: "table", rows: [cells] });
    } else if (last?.kind === "text") last.text += `\n${line}`;
    else pieces.push({ kind: "text", text: line });
  }
  return pieces.map((p) => (p.kind === "text" ? { ...p, text: p.text.trim() } : p)).filter((p) => p.kind === "table" || p.text);
}

const tableChars = (rows: string[][]) => rows.flat().join(" ").length;

// Collapsed, an excerpt shows its tables in full (they are the evidence) and text up to CLAMP_CHARS in all.
// True when that would hide some text, i.e. the card needs "Show more".
function isClamped(pieces: Piece[]): boolean {
  let budget = CLAMP_CHARS;
  for (const p of pieces) {
    if (p.kind === "text" && p.text.length > budget) return true;
    budget -= p.kind === "text" ? p.text.length : tableChars(p.rows);
  }
  return false;
}

function ExcerptBody({ pieces, expanded }: { pieces: Piece[]; expanded: boolean }) {
  let budget = expanded ? Infinity : CLAMP_CHARS;
  const out = [];
  for (const [i, p] of pieces.entries()) {
    if (p.kind === "table") {
      budget -= tableChars(p.rows);
      out.push(
        <div key={i} className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {p.rows.map((row, r) => (
                <tr key={r} className={cx("border-border", r > 0 && "border-t", r === 0 && "bg-muted font-semibold")}>
                  {row.map((cell, c) => <td key={c} className={cx("px-2 py-1 align-top", c > 0 && "text-right whitespace-nowrap")}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (budget <= 0) continue;
    const cut = p.text.length > budget;
    out.push(<p key={i} className="whitespace-pre-line">{cut ? `${p.text.slice(0, budget).trimEnd()}…` : p.text}</p>);
    budget -= p.text.length;
  }
  return <div className="mt-2 space-y-2 break-words leading-relaxed">{out}</div>;
}

// `pulse` changes on every citation click, so the pulse restarts even when the same card is clicked twice.
function EvidenceCard({ source, highlighted, pulse }: { source: AskSource; highlighted: boolean; pulse: number }) {
  const [expanded, setExpanded] = useState(false);
  const section = sectionOfPage(source.page);
  const pieces = toPieces(source.content);
  const long = isClamped(pieces);
  return (
    <article
      id={`ev-${source.id}`}
      style={toneStyle(section.tone)}
      className={cx(
        "relative rounded-xl border border-l-[3px] border-l-(--tone) bg-card p-3.5 text-sm transition-shadow duration-300",
        highlighted ? "border-(--tone) ring-2 ring-(--tone)/40" : "border-border",
      )}
    >
      {highlighted && <span key={pulse} aria-hidden className="pointer-events-none absolute inset-0 animate-tone-pulse rounded-xl" />}
      <p className="text-xs leading-snug text-muted-foreground">
        iMac report<span aria-hidden className="mx-1 text-input">›</span><span className="font-medium text-foreground">{section.name}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-tone-soft px-1.5 py-0.5 font-medium">
          <span aria-hidden className="size-1.5 rounded-full bg-(--tone)" />{section.tag}
        </span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-medium">PDF p.{source.page}</span>
        <span className="rounded-md bg-brand-soft px-1.5 py-0.5 font-medium text-primary">{KIND_LABEL[source.kind] ?? source.kind}</span>
        <span className="rounded-md border border-border px-1.5 py-0.5 text-muted-foreground" title="Similarity between the question and this excerpt (0 to 1).">
          match {source.score.toFixed(2)}
        </span>
      </div>
      <ExcerptBody pieces={pieces} expanded={expanded} />
      <div className="mt-2 flex items-center justify-between gap-2">
        {long ? (
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="rounded text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : <span />}
        <a href={`${PDF_URL}#page=${source.page}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Open page <HugeiconsIcon icon={LinkSquare02Icon} size={12} aria-hidden />
          <span className="sr-only">(opens the PDF at page {source.page} in a new tab)</span>
        </a>
      </div>
    </article>
  );
}

// Groups by report section, in the order they first appear (the sources arrive best match first).
function groupBySection(sources: AskSource[]): { section: Section; sources: AskSource[] }[] {
  const out: { section: Section; sources: AskSource[] }[] = [];
  for (const s of sources) {
    const section = sectionOfPage(s.page);
    const g = out.find((x) => x.section.name === section.name);
    if (g) g.sources.push(s);
    else out.push({ section, sources: [s] });
  }
  return out;
}

type Props = { message: AssistantMessage | undefined; highlight: { ids: number[]; n: number } | null; open: boolean; onClose: () => void };

export function EvidencePanel({ message, highlight, open, onClose }: Props) {
  const sources = message?.sources ?? [];
  const groups = groupBySection(sources);
  return (
    <>
      {open && <div aria-hidden className="fixed inset-0 z-20 bg-foreground/30 lg:hidden" onClick={onClose} />}
      <aside
        aria-label="Evidence: excerpts from the report"
        className={cx(
          "z-30 flex-col border-border bg-shelf",
          // phone/tablet: a bottom sheet; desktop: a fixed column beside the chat
          open ? "fixed inset-x-0 bottom-0 top-16 flex rounded-t-2xl border-t shadow-2xl lg:static lg:rounded-none lg:border-t-0 lg:shadow-none" : "hidden",
          "lg:flex lg:w-[26rem] lg:shrink-0 lg:border-l xl:w-[28rem]",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Evidence</h2>
            <p className="truncate text-xs text-muted-foreground">
              {message ? (sources.length ? `${sources.length} ${sources.length === 1 ? "excerpt" : "excerpts"} used for: “${message.question}”` : "No excerpts yet") : "Excerpts from the report appear here"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close evidence" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden">
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {!message && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
              <HugeiconsIcon icon={File02Icon} size={32} aria-hidden />
              <p>Ask a question and the report excerpts behind the answer will show up here, with their section, PDF page and element type.</p>
            </div>
          )}
          {groups.map(({ section, sources: gs }) => (
            <section key={section.name} aria-label={section.name}>
              <h3 style={toneStyle(section.tone)} className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden className="size-2 rounded-full bg-(--tone)" />
                {section.name}
                {section.pages.length > 0 && <span className="font-normal text-muted-foreground">{section.pages.length > 1 ? `pp.${section.pages[0]}–${section.pages.at(-1)}` : `p.${section.pages[0]}`}</span>}
              </h3>
              <div className="space-y-2.5">
                {gs.map((s) => <EvidenceCard key={s.id} source={s} highlighted={!!highlight?.ids.includes(s.id)} pulse={highlight?.n ?? 0} />)}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
