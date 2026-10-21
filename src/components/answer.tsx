import { parseCitations } from "@/lib/citations";
import type { AskErrorCode } from "@/lib/ask-protocol";

// The model sometimes answers with light markdown ("* " bullets, **bold**) despite the plain-text prompt (D-61);
// render just those two instead of showing raw asterisks.
const BOLD = /\*\*([^*]+)\*\*/g;

function Inline({ text }: { text: string }) {
  const pieces = text.replace(/^\*\s+/gm, "• ").split(BOLD);
  return pieces.map((piece, i) => (i % 2 ? <strong key={i}>{piece}</strong> : piece));
}

type Node = { kind: "text"; text: string } | { kind: "cite"; pages: number[]; lead: string; trail: string };

// A citation chip is kept on the same line as the word before it and the punctuation after it,
// so a line break can never strand a lone chip or period.
function toNodes(paragraph: string): Node[] {
  const nodes: Node[] = [];
  let afterCite = false;
  for (const part of parseCitations(paragraph)) {
    if ("text" in part) {
      let text = part.text;
      if (afterCite) {
        const punct = /^[.,;:)!?'’"”]+/.exec(text)?.[0] ?? "";
        const last = nodes[nodes.length - 1];
        if (punct && last.kind === "cite") {
          last.trail = punct;
          text = text.slice(punct.length);
        }
      }
      if (text) nodes.push({ kind: "text", text });
      afterCite = false;
    } else {
      let lead = "";
      const prev = nodes[nodes.length - 1];
      if (prev?.kind === "text") {
        const word = /\S+\s*$/.exec(prev.text)?.[0] ?? "";
        // Don't split a **bold** run in half.
        if (word && !word.includes("*")) {
          lead = word;
          prev.text = prev.text.slice(0, prev.text.length - word.length);
          if (!prev.text) nodes.pop();
        }
      }
      nodes.push({ kind: "cite", pages: part.pages, lead, trail: "" });
      afterCite = true;
    }
  }
  return nodes;
}

type AnswerProps = {
  text: string;
  streaming: boolean;
  retrieved: ReadonlySet<number>;
  activePage: number | null;
  onCite: (page: number) => void;
};

export function Answer({ text, streaming, retrieved, activePage, onCite }: AnswerProps) {
  const paragraphs = text.trim().split(/\n{2,}/);
  return (
    <div className="answer">
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="para">
          {toNodes(paragraph).map((node, j) =>
            node.kind === "text" ? (
              <Inline key={j} text={node.text} />
            ) : (
              <span key={j} className="nw">
                {node.lead}
                {node.pages.map((page) =>
                  retrieved.has(page) ? (
                    <button
                      key={page}
                      type="button"
                      onClick={() => onCite(page)}
                      aria-label={`Show the retrieved excerpt from PDF page ${page}`}
                      className={`cite${activePage === page ? " is-linked" : ""}`}
                    >
                      p.{page}
                    </button>
                  ) : (
                    <span key={page} className="cite off" title="This page was not among the retrieved excerpts">
                      p.{page}
                      <span className="sr-only"> (not among the retrieved excerpts)</span>
                    </span>
                  ),
                )}
                {node.trail}
              </span>
            ),
          )}
          {streaming && i === paragraphs.length - 1 ? <span className="caret" aria-hidden="true" /> : null}
        </p>
      ))}
    </div>
  );
}

// "Not in the document." is a designed outcome, not an error: the system declining to invent an answer.
export function Verdict() {
  return (
    <div className="verdict">
      <p className="verdict-t">Not in the document.</p>
      <p className="verdict-s">
        The report doesn&rsquo;t contain an answer to this question. The nearest passages it does contain are shown as
        evidence, so you can judge for yourself.
      </p>
    </div>
  );
}

const ERROR_TITLE: Record<AskErrorCode, string> = {
  quota: "Chat quota reached",
  invalid: "Check the question",
  unavailable: "Couldn’t finish the answer",
  internal: "Couldn’t finish the answer",
};

type NoticeProps = { code: AskErrorCode; message: string; hasSources: boolean; onRetry: () => void };

export function ErrorNotice({ code, message, hasSources, onRetry }: NoticeProps) {
  return (
    <div className="notice" role="alert">
      <p className="notice-t">{ERROR_TITLE[code]}</p>
      <p className="notice-s">
        {message}
        {hasSources ? " Retrieval worked, so the passages it found are still listed under Evidence." : ""}
      </p>
      {code !== "invalid" ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
