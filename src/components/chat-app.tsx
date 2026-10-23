"use client";

import { Add01Icon, File02Icon, TestTube01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { streamAsk } from "@/lib/ask-client";
import { INK, STAGE_TONES, toneStyle } from "@/lib/sections";
import { Composer } from "./composer";
import { cx } from "./cx";
import { EvidencePanel } from "./evidence-panel";
import { ThemeToggle } from "./theme-toggle";
import { AssistantBubble, UserBubble, type AssistantMessage, type ChatMessage } from "./message";

// The three acceptance questions (spec D-14): energy vs ENERGY STAR, footprint split, stand material.
const STARTERS = [
  "How much less energy does iMac use compared to the ENERGY STAR requirement?",
  "What is the total carbon footprint of the iMac, and how much comes from product use versus manufacturing?",
  "What material is the iMac stand made from, and what percentage of it is recycled?",
];

// Welcome tiles: one per part of the report, in the report's own order. Each fills the question box with a starter
// for that section; the reader edits it and sends.
const TILES = [
  { title: "Carbon footprint", tag: "pp.2, 10", tone: "var(--section-carbon)", draft: "How is the iMac's carbon footprint split across its life cycle?" },
  { title: "Design and Source", tag: "p.4", tone: "var(--section-source)", draft: "Which materials in the iMac use recycled content?" },
  { title: "Make", tag: "p.5", tone: "var(--section-make)", draft: "How much of the iMac's manufacturing electricity comes from low-carbon sources?" },
  { title: "Package and Ship", tag: "p.6", tone: "var(--section-ship)", draft: "How much of the iMac packaging is fiber-based and recycled?" },
  { title: "Use", tag: "pp.7, 12", tone: "var(--section-use)", draft: "How much power does the iMac draw when idle and in sleep?" },
  { title: "Recover", tag: "p.8", tone: "var(--section-recover)", draft: "How can an old iMac be traded in or recycled?" },
  { title: "Highlights", tag: "p.1", tone: INK, draft: "What are the main environmental highlights of the iMac?" },
  { title: "Definitions and endnotes", tag: "pp.9, 11–12", tone: INK, draft: "How does the report define low-carbon electricity?" },
];

let seq = 0;
const nextId = () => `m${++seq}`;

// `/?mock=1` swaps the API for a fake stream (see lib/mock-ask.ts). Read with useSyncExternalStore so the
// server render (false) and the first client render agree, and no effect is needed.
const noopSubscribe = () => () => {};
const readMock = () => new URLSearchParams(window.location.search).get("mock") === "1";
const readMockOnServer = () => false;

const isAssistant = (m: ChatMessage): m is AssistantMessage => m.role === "assistant";

// The logo: six bars in the six life-cycle colours. It is always navy; `.atlas-mark` (globals.css) switches the bars
// to the shades made for dark backgrounds.
const MARK_HEIGHTS = [18, 12, 14, 10, 16, 9];
function LifecycleMark() {
  return (
    <div aria-hidden className="atlas-mark flex h-8 shrink-0 items-end gap-[3px] rounded-lg bg-[#12263f] px-[7px] pb-[7px] ring-1 ring-white/10 ring-inset">
      {STAGE_TONES.map((tone, i) => (
        <span key={tone} className="w-[3px] rounded-full" style={{ height: MARK_HEIGHTS[i], background: tone }} />
      ))}
    </div>
  );
}

export function ChatApp() {
  const mock = useSyncExternalStore(noopSubscribe, readMock, readMockOnServer);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [highlight, setHighlight] = useState<{ ids: number[]; n: number } | null>(null);
  const [draft, setDraft] = useState({ text: "", n: 0 }); // `n` remounts the composer with the new text
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true); // keep following the newest text only while the reader is at the bottom

  const streaming = messages.some((m) => isAssistant(m) && m.status === "streaming");
  const assistants = messages.filter(isAssistant);
  const evidenceMsg = assistants.find((m) => m.id === selectedId) ?? assistants[assistants.length - 1];

  // Stop a running answer when the page goes away
  useEffect(() => () => abortRef.current?.abort(), []);

  // Follow the newest text
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight });
  }, [messages]);

  // Highlight a card briefly and scroll it into view (the sheet is already open by then)
  useEffect(() => {
    if (!highlight) return;
    document.getElementById(`ev-${highlight.ids[0]}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(t);
  }, [highlight]);

  const patch = useCallback((id: string, fn: (m: AssistantMessage) => AssistantMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id && isAssistant(m) ? fn(m) : m)));
  }, []);

  const run = useCallback(async (id: string, question: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    await streamAsk(question, controller.signal, (e) => {
      if (e.type === "sources") patch(id, (m) => ({ ...m, sources: e.sources, searched: true }));
      else if (e.type === "text") patch(id, (m) => ({ ...m, content: m.content + e.text }));
      else if (e.type === "done") patch(id, (m) => ({ ...m, status: "done" }));
      else patch(id, (m) => ({ ...m, status: "error", error: { code: e.code, message: e.message } }));
    }, mock);
    // The stream closed without a done/error event (and we did not stop it): the connection dropped mid-answer.
    if (!controller.signal.aborted) {
      patch(id, (m) => (m.status === "streaming" ? { ...m, status: "error", error: { code: "unavailable", message: "The connection closed before the answer finished." } } : m));
    }
  }, [mock, patch]);

  const send = (question: string) => {
    if (streaming) return;
    const assistantId = nextId();
    stickRef.current = true;
    setMessages((ms) => [
      ...ms,
      { id: nextId(), role: "user", content: question },
      { id: assistantId, role: "assistant", question, content: "", sources: [], status: "streaming" },
    ]);
    setSelectedId(assistantId);
    void run(assistantId, question);
  };

  const stop = () => {
    abortRef.current?.abort();
    setMessages((ms) => ms.map((m) => (isAssistant(m) && m.status === "streaming" ? { ...m, status: "stopped" } : m)));
  };

  const retry = (id: string) => {
    if (streaming) return;
    const target = messages.find((m) => m.id === id);
    if (!target || !isAssistant(target)) return;
    patch(id, (m) => ({ ...m, content: "", sources: [], searched: false, status: "streaming", error: undefined }));
    setSelectedId(id);
    void run(id, target.question);
  };

  const newChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setSelectedId(null);
    setSheetOpen(false);
    setHighlight(null);
    document.getElementById("question")?.focus();
  };

  const cite = (messageId: string, ids: number[]) => {
    setSelectedId(messageId);
    setSheetOpen(true);
    setHighlight((h) => ({ ids, n: (h?.n ?? 0) + 1 })); // a new `n` each click, so clicking the same chip again pulses the card again
  };

  const empty = messages.length === 0;
  const evidenceCount = evidenceMsg?.sources.length ?? 0;

  return (
    <div className="flex h-dvh">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <LifecycleMark />
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-[0.95rem] font-semibold tracking-tight"><span className="sm:hidden">iMac report</span><span className="hidden sm:inline">iMac Environmental Report</span></h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">Apple Product Environmental Report, October 2024</p>
            </div>
            {mock && <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-input px-1.5 py-0.5 text-xs font-medium text-muted-foreground" title="Fake answers for checking the interface; the API is not called."><HugeiconsIcon icon={TestTube01Icon} size={12} aria-hidden />Mock mode</span>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden">
              <HugeiconsIcon icon={File02Icon} size={16} /> Evidence{evidenceCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{evidenceCount}</span>}
            </button>
            <button type="button" onClick={newChat} disabled={empty} aria-label="New chat" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40">
              <HugeiconsIcon icon={Add01Icon} size={16} /> <span className="hidden sm:inline">New chat</span>
            </button>
          </div>
        </header>

        <div
          ref={threadRef}
          onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
          className="flex-1 overflow-y-auto"
        >
          <div role="log" aria-live="polite" aria-busy={streaming} className={cx("mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6", empty && "flex min-h-full flex-col justify-center")}>
            {empty ? (
              <div className="space-y-8 py-8">
                <div className="space-y-3">
                  <h2 className="font-serif text-[2rem] leading-[1.15] font-medium tracking-tight text-balance sm:text-[2.5rem]">Ask the iMac Product Environmental Report</h2>
                  <p className="max-w-lg text-[0.95rem] leading-relaxed text-muted-foreground">Answers come only from the 12-page report. Each one cites its PDF page, and the excerpts behind it (tables, the chart, call-outs and footnotes) appear beside the chat.</p>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">Start from a section of the report</h3>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TILES.map((t) => (
                      <li key={t.title} className="flex">
                        <button
                          type="button"
                          onClick={() => setDraft((d) => ({ text: t.draft, n: d.n + 1 }))}
                          title={`Write a question about ${t.title}`}
                          style={toneStyle(t.tone)}
                          className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-xl border border-l-[3px] border-border border-l-(--tone) bg-card px-3 py-2.5 text-left hover:bg-tone-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <span aria-hidden className="size-1.5 rounded-full bg-(--tone)" />{t.tag}
                          </span>
                          <span className="text-sm leading-snug font-medium">{t.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">Or ask one of these</h3>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {STARTERS.map((q) => (
                      <li key={q}>
                        <button type="button" onClick={() => send(q)} className="w-full cursor-pointer px-4 py-3 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              messages.map((m) =>
                isAssistant(m) ? (
                  <AssistantBubble key={m.id} message={m} selected={evidenceMsg?.id === m.id} onSelect={() => setSelectedId(m.id)} onCite={(ids) => cite(m.id, ids)} onRetry={() => retry(m.id)} />
                ) : (
                  <UserBubble key={m.id} message={m} />
                ),
              )
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <Composer key={draft.n} draft={draft.text} streaming={streaming} onSend={send} onStop={stop} />
            <p className="mt-2 text-center text-xs text-pretty text-muted-foreground">Answers can be wrong. Check the cited page in the report. Each question is answered on its own, so name what you mean in follow-ups.</p>
          </div>
        </div>
      </main>

      <EvidencePanel message={evidenceMsg} highlight={highlight} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
