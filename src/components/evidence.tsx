import { segments, type Range } from "@/lib/highlight";
import type { AskSource } from "@/lib/ask-protocol";

export type EvidenceFilter = "all" | "cited";

// Similarity is shown as a short bar; real scores sit roughly between 0.5 and 0.85.
const barWidth = (score: number) => `${Math.round(Math.max(0, Math.min(1, (score - 0.4) / 0.5)) * 100)}%`;

type CardProps = {
  source: AskSource;
  cited: boolean;
  refused: boolean;
  active: boolean;
  flashKey: number;
  ranges: readonly Range[] | undefined;
};

function Card({ source, cited, refused, active, flashKey, ranges }: CardProps) {
  return (
    // flashKey remounts the active card so the flash animation replays on every click.
    <article
      key={active ? `a${flashKey}` : "i"}
      id={`ev-${source.id}`}
      tabIndex={-1}
      className={`card ${cited ? "cited" : "uncited"}${active ? " is-active flash" : ""}`}
    >
      <header className="card-h">
        <span className="pg">Page {source.page}</span>
        <span className="kind" data-kind={source.kind}>{source.kind}</span>
        <span className="score" title="Cosine similarity to your question (higher is closer)">
          <i style={{ "--w": barWidth(source.score) } as React.CSSProperties} />
          <b>{source.score.toFixed(3)}</b>
        </span>
        <span className="tag">{refused ? "Nearest passage" : cited ? "Cited" : "Retrieved"}</span>
      </header>
      <p className={source.kind === "table" ? "excerpt pre" : "excerpt"}>
        {segments(source.content, ranges).map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : s.text))}
      </p>
    </article>
  );
}

type PaneProps = {
  view: "empty" | "searching" | "streaming" | "answer" | "refusal" | "error";
  sources: readonly AskSource[];
  citedPages: ReadonlySet<number>;
  highlights: ReadonlyMap<number, readonly Range[]>;
  activePage: number | null;
  flashKey: number;
  filter: EvidenceFilter;
  onFilter: (filter: EvidenceFilter) => void;
  onClose: () => void;
  inert: boolean;
  closeRef: React.Ref<HTMLButtonElement>;
};

export function EvidencePane({
  view,
  sources,
  citedPages,
  highlights,
  activePage,
  flashKey,
  filter,
  onFilter,
  onClose,
  inert,
  closeRef,
}: PaneProps) {
  const refused = view === "refusal";
  const citedCount = sources.filter((s) => citedPages.has(s.page)).length;
  return (
    <aside className="evidence" id="evidence-pane" aria-label="Evidence" inert={inert}>
      <div className="col-h">
        <span>{refused ? "Nearest passages" : "Evidence"}</span>
        {sources.length > 0 && !refused ? (
          <span className="tabs" role="group" aria-label="Filter passages">
            <button type="button" aria-pressed={filter === "all"} onClick={() => onFilter("all")}>
              All<b>{sources.length}</b>
            </button>
            <button type="button" aria-pressed={filter === "cited"} onClick={() => onFilter("cited")}>
              Cited<b>{citedCount}</b>
            </button>
          </span>
        ) : null}
        <button ref={closeRef} type="button" className="icon-btn sheet-only sp" aria-label="Close evidence" onClick={onClose}>
          ✕
        </button>
      </div>

      {view === "empty" ? (
        <div className="ev-empty">
          <p>
            <b>Passages appear here.</b> The few closest to your question, each with its page and a similarity score.
          </p>
          <p>
            <b>Page chips are links.</b> Click one in the answer to jump to the passage it cites.
          </p>
          <p>
            <b>Highlights show overlap.</b> Wording the passage shares with the answer is marked.
          </p>
        </div>
      ) : view === "searching" ? (
        <div className="cards" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card skeleton">
              <i />
              <i />
              <i />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="cards" data-filter={refused ? "all" : filter}>
            {sources.map((source) => (
              <Card
                key={source.id}
                source={source}
                cited={citedPages.has(source.page)}
                refused={refused}
                active={activePage === source.page}
                flashKey={flashKey}
                ranges={highlights.get(source.id)}
              />
            ))}
            {sources.length === 0 ? (
              <p className="hist-empty">No passages were retrieved for this question.</p>
            ) : null}
          </div>
          {sources.length > 0 ? (
            <div className="legend">
              <mark>shared wording</mark>
              <span>page cited by the answer</span>
              <span className="sp">cosine similarity</span>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
