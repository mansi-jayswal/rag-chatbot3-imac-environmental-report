"use client";

import "./workspace.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { streamAsk } from "@/lib/ask-client";
import type { AskErrorCode, AskSource } from "@/lib/ask-protocol";
import { citedPages as citedPagesOf, plainAnswer } from "@/lib/citations";
import { computeHighlights, type Range } from "@/lib/highlight";
import { historyStore, type HistoryEntry } from "@/lib/history";
import { isRefusal } from "@/lib/refusal";
import { useMediaQuery } from "@/lib/use-media-query";
import { Answer, ErrorNotice, Verdict } from "./answer";
import { Composer } from "./composer";
import { EvidencePane, type EvidenceFilter } from "./evidence";
import { HistoryRail } from "./history-rail";

const EXAMPLES = [
  "How much less energy does iMac use compared to the ENERGY STAR requirement?",
  "What is the total carbon footprint of the iMac, and how much comes from product use versus manufacturing?",
  "What material is the iMac stand made from, and what percentage of it is recycled?",
];
const OUT_OF_SCOPE_EXAMPLE = "What is the battery life of the iMac?";

const NO_HIGHLIGHTS: ReadonlyMap<number, readonly Range[]> = new Map();

type Phase = "empty" | "searching" | "streaming" | "done" | "error";
type View = "empty" | "searching" | "streaming" | "answer" | "refusal" | "error";
type AskError = { code: AskErrorCode; message: string };

const STATUS: Record<View, string> = {
  empty: "idle",
  searching: "retrieving passages…",
  streaming: "generating answer…",
  answer: "answer ready",
  refusal: "refused: not in the document",
  error: "couldn't finish",
};

type Props = {
  pipeline: { topK: number; embeddingModel: string; chatModel: string; documentName: string };
};

export function Workspace({ pipeline }: Props) {
  const [input, setInput] = useState("");
  const [asked, setAsked] = useState("");
  const [phase, setPhase] = useState<Phase>("empty");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<AskSource[]>([]);
  const [error, setError] = useState<AskError | null>(null);
  const [secs, setSecs] = useState<number | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [filter, setFilter] = useState<EvidenceFilter>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const history = useSyncExternalStore(historyStore.subscribe, historyStore.getSnapshot, historyStore.getServerSnapshot);
  const narrowRail = useMediaQuery("(max-width: 1180px)");
  const narrowSheet = useMediaQuery("(max-width: 860px)");

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstHistoryRef = useRef<HTMLButtonElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const refused = phase === "done" && isRefusal(answer);
  const view: View =
    phase === "done" ? (refused ? "refusal" : "answer") : phase === "empty" ? "empty" : phase;
  const busy = phase === "searching" || phase === "streaming";

  const citedPages = useMemo(() => (refused ? new Set<number>() : citedPagesOf(answer)), [answer, refused]);
  const retrieved = useMemo(() => new Set(sources.map((s) => s.page)), [sources]);
  const highlights = useMemo(
    () => (phase === "done" && !refused ? computeHighlights(answer, sources) : NO_HIGHLIGHTS),
    [phase, refused, answer, sources],
  );
  const citedCount = useMemo(() => sources.filter((s) => citedPages.has(s.page)).length, [sources, citedPages]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const openSheet = useCallback(() => {
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    setSheetOpen(true);
  }, []);
  const openDrawer = useCallback(() => {
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    setDrawerOpen(true);
  }, []);

  const resetResult = useCallback(() => {
    setAnswer("");
    setSources([]);
    setError(null);
    setSecs(null);
    setCurrentId(null);
    setActivePage(null);
    setFilter("all");
    setSheetOpen(false);
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const startedAt = performance.now();

      resetResult();
      setAsked(q);
      setPhase("searching");
      setInput("");
      setDrawerOpen(false);
      setAnnouncement("Searching the report…");
      scrollRef.current?.scrollTo({ top: 0 });

      let text = "";
      let found: AskSource[] = [];
      let terminal = false;

      // Saves to history only when the stream ended properly with an answer.
      const finish = (save: boolean) => {
        terminal = true;
        const elapsed = (performance.now() - startedAt) / 1000;
        setSecs(elapsed);
        setPhase("done");
        setAnnouncement(isRefusal(text) ? "Not in the document." : `Answer ready. ${plainAnswer(text, true)}`);
        if (save && text.trim()) {
          const entry: HistoryEntry = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            question: q,
            answer: text,
            sources: found,
            secs: elapsed,
            ts: Date.now(),
          };
          historyStore.add(entry);
          setCurrentId(entry.id);
        }
      };
      const fail = (code: AskErrorCode, message: string) => {
        terminal = true;
        setError({ code, message });
        setPhase("error");
        setAnnouncement(message);
      };

      void streamAsk(q, controller.signal, (event) => {
        if (controller.signal.aborted) return;
        switch (event.type) {
          case "sources":
            found = event.sources;
            setSources(found);
            setPhase("streaming");
            break;
          case "text":
            text += event.text;
            setAnswer(text);
            break;
          case "done":
            finish(true);
            break;
          case "error":
            fail(event.code, event.message);
            break;
        }
      }).then(() => {
        // The stream ended without a terminal event (e.g. the server died): don't leave the UI spinning.
        if (controller.signal.aborted || terminal) return;
        if (text) finish(false);
        else fail("unavailable", "The server closed the connection without answering. Try again.");
      });
    },
    [resetResult],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setPhase((p) => (p === "searching" ? "empty" : "done"));
  }, []);

  const newQuestion = useCallback(() => {
    abortRef.current?.abort();
    resetResult();
    setAsked("");
    setPhase("empty");
    setDrawerOpen(false);
    setAnnouncement("");
    inputRef.current?.focus();
  }, [resetResult]);

  // History entries reopen from memory: no network call and no chat quota.
  const openEntry = useCallback(
    (entry: HistoryEntry) => {
      abortRef.current?.abort();
      resetResult();
      setAsked(entry.question);
      setAnswer(entry.answer);
      setSources(entry.sources);
      setSecs(entry.secs);
      setCurrentId(entry.id);
      setPhase("done");
      setDrawerOpen(false);
      setAnnouncement(isRefusal(entry.answer) ? "Not in the document." : "Past answer opened.");
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [resetResult],
  );

  const onCite = useCallback(
    (page: number) => {
      setActivePage(page);
      setFlashKey((k) => k + 1);
      if (narrowSheet) openSheet();
    },
    [narrowSheet, openSheet],
  );

  // After a chip click: scroll to the first card of that page (once the bottom sheet has slid in on phones).
  useEffect(() => {
    if (flashKey === 0 || activePage === null) return;
    const target = sources.find((s) => s.page === activePage);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(
      () => {
        const el = document.getElementById(`ev-${target.id}`);
        el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        el?.focus({ preventScroll: true });
      },
      narrowSheet ? 260 : 0,
    );
    return () => clearTimeout(timer);
  }, [flashKey, activePage, sources, narrowSheet]);

  // Focus moves into an opened drawer/sheet and returns to whatever opened it when it closes.
  useEffect(() => {
    if (sheetOpen) sheetCloseRef.current?.focus();
    else if (lastFocusRef.current?.isConnected) {
      lastFocusRef.current.focus();
      lastFocusRef.current = null;
    }
  }, [sheetOpen]);
  useEffect(() => {
    if (drawerOpen) firstHistoryRef.current?.focus();
    else if (lastFocusRef.current?.isConnected) {
      lastFocusRef.current.focus();
      lastFocusRef.current = null;
    }
  }, [drawerOpen]);

  // Esc closes the sheet, then the drawer, then stops a running request. "/" jumps to the question box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sheetOpen) closeSheet();
        else if (drawerOpen) closeDrawer();
        else if (busy) stop();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen, drawerOpen, busy, closeSheet, closeDrawer, stop]);

  const copy = useCallback(async () => {
    const seen = new Set<number>();
    const lines: string[] = [];
    for (const s of sources) {
      if (!citedPages.has(s.page) || seen.has(s.page)) continue;
      seen.add(s.page);
      lines.push(`- Page ${s.page} (similarity ${s.score.toFixed(3)}): "${s.content.slice(0, 140).trim()}…"`);
    }
    const parts = [asked, plainAnswer(answer, true)];
    if (lines.length) parts.push(`Sources (${pipeline.documentName}, PDF page index):\n${lines.join("\n")}`);
    const text = parts.join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing more to try; the toast below is still accurate about what we attempted.
      }
      ta.remove();
    }
    setToast(`Copied answer with ${seen.size} citation${seen.size === 1 ? "" : "s"}`);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 2200);
  }, [asked, answer, sources, citedPages, pipeline.documentName]);

  const overlayOpen = (narrowRail && drawerOpen) || (narrowSheet && sheetOpen);
  const railInert = (narrowRail && !drawerOpen) || (narrowSheet && sheetOpen);
  const evidenceInert = (narrowSheet && !sheetOpen) || (narrowRail && drawerOpen);

  return (
    <div
      className="ws"
      data-view={view}
      data-has-result={view !== "empty"}
      data-drawer={drawerOpen ? "open" : "closed"}
      data-sheet={sheetOpen ? "open" : "closed"}
    >
      <a className="skip" href="#composer-input">
        Skip to question box
      </a>

      <header className="top">
        <button
          type="button"
          className="icon-btn history-toggle"
          aria-expanded={drawerOpen}
          aria-controls="history-rail"
          aria-label="Past questions"
          onClick={() => (drawerOpen ? closeDrawer() : openDrawer())}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M3 5.5h14M3 10h14M3 14.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
        </button>
        <div className="crumbs">
          <b>Report Q&amp;A</b>
          <i>/</i>
          <span className="c2">{pipeline.documentName}</span>
          <i>/</i>
          <span className="c2">single-turn</span>
        </div>
        <button type="button" className="btn" onClick={newQuestion}>
          New question
        </button>
      </header>

      <div className="cols">
        <HistoryRail
          entries={history}
          currentId={currentId}
          onOpen={openEntry}
          onClear={historyStore.clear}
          onClose={closeDrawer}
          inert={railInert}
          firstRef={firstHistoryRef}
        />

        <main className="center" inert={overlayOpen}>
          <div className="scroll" ref={scrollRef}>
            <div className="wrap">
              {view === "empty" ? (
                <div className="empty">
                  <p className="eyebrow">Document Q&amp;A</p>
                  <h2>What would you like to find in the report?</h2>
                  <p className="lede">
                    Every answer comes from the {pipeline.documentName} and shows the passages behind it. If the report
                    doesn&rsquo;t say, it says so.
                  </p>
                  <ul className="examples" aria-label="Example questions">
                    {EXAMPLES.map((example) => (
                      <li key={example}>
                        <button type="button" className="example" onClick={() => ask(example)}>
                          {example}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button type="button" className="example ghost" onClick={() => ask(OUT_OF_SCOPE_EXAMPLE)}>
                        Try something the report doesn&rsquo;t cover
                      </button>
                    </li>
                  </ul>
                </div>
              ) : (
                <section aria-label="Answer" aria-busy={busy}>
                  <header className="qhead">
                    <p className="eyebrow">Question</p>
                    <h1 className="q">{asked}</h1>
                  </header>

                  {view === "searching" ? (
                    <div className="searching" role="status">
                      <span className="dots" aria-hidden="true" />
                      Searching the report…
                    </div>
                  ) : null}

                  {view === "streaming" && !answer ? (
                    <div className="searching" role="status">
                      <span className="dots" aria-hidden="true" />
                      Drafting from {sources.length} passages…
                    </div>
                  ) : null}

                  {(view === "streaming" && answer) || view === "answer" ? (
                    <>
                      <Answer
                        text={answer}
                        streaming={view === "streaming"}
                        retrieved={retrieved}
                        activePage={activePage}
                        onCite={onCite}
                      />
                      {view === "answer" ? (
                        <div className="actions">
                          <button type="button" className="btn" onClick={copy}>
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                              <path
                                d="M5 2h7a1 1 0 0 1 1 1v8M3 5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            Copy with citations
                          </button>
                          <span className="meta">
                            {sources.length} passages retrieved · {citedCount} cited
                            {secs !== null ? ` · ${secs.toFixed(1)}s` : ""}
                          </span>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {view === "refusal" ? <Verdict /> : null}

                  {view === "error" && error ? (
                    <ErrorNotice
                      code={error.code}
                      message={error.message}
                      hasSources={sources.length > 0}
                      onRetry={() => ask(asked)}
                    />
                  ) : null}
                </section>
              )}
            </div>
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => ask(input)}
            onStop={stop}
            busy={busy}
            inputRef={inputRef}
          />
        </main>

        <EvidencePane
          view={view}
          sources={sources}
          citedPages={citedPages}
          highlights={highlights}
          activePage={activePage}
          flashKey={flashKey}
          filter={filter}
          onFilter={setFilter}
          onClose={closeSheet}
          inert={evidenceInert}
          closeRef={sheetCloseRef}
        />
      </div>

      <footer className="status">
        <span>
          <span className="dot" />
          {STATUS[view]}
        </span>
        <span className="hide-m">pgvector · top-{pipeline.topK}</span>
        <span className="hide-m c3">{pipeline.embeddingModel}</span>
        <span className="hide-m c3">{pipeline.chatModel}</span>
      </footer>

      <button
        type="button"
        className="ev-fab"
        aria-controls="evidence-pane"
        aria-expanded={sheetOpen}
        onClick={openSheet}
      >
        Evidence <b>{sources.length}</b>
      </button>

      <div className="scrim" aria-hidden="true" onClick={() => (closeSheet(), closeDrawer())} />
      <div className={`toast${toast ? " show" : ""}`} role="status">
        {toast}
      </div>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
