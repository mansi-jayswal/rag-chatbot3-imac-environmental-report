import type { AskSource } from "./ask-protocol";

// Past questions live in this browser only (localStorage), never on the server. Every storage access can throw
// (blocked cookies, private mode, quota), so the store keeps working in memory when persistence fails.
// Schema is versioned: bump `v` and the key together if the entry shape changes.

export type HistoryEntry = {
  id: string;
  question: string;
  answer: string;
  sources: AskSource[];
  secs: number;
  ts: number;
};

const KEY = "imac-ask:history:v1";
const VERSION = 1;
export const MAX_HISTORY = 30;

const EMPTY: HistoryEntry[] = [];

function isSource(x: unknown): x is AskSource {
  const s = x as AskSource;
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.id === "number" &&
    typeof s.page === "number" &&
    typeof s.content === "string" &&
    typeof s.score === "number"
  );
}

function isEntry(x: unknown): x is HistoryEntry {
  const e = x as HistoryEntry;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof e.id === "string" &&
    typeof e.question === "string" &&
    typeof e.answer === "string" &&
    typeof e.secs === "number" &&
    typeof e.ts === "number" &&
    Array.isArray(e.sources) &&
    e.sources.every(isSource)
  );
}

function read(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw) as { v?: number; entries?: unknown };
    if (data.v !== VERSION || !Array.isArray(data.entries)) return EMPTY;
    return data.entries.filter(isEntry).slice(0, MAX_HISTORY);
  } catch {
    return EMPTY;
  }
}

function write(entries: HistoryEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, entries }));
  } catch {
    // Persistence is best effort; the in-memory list still works for this session.
  }
}

// External store for useSyncExternalStore: the server and the first hydration render see an empty list,
// the client then reads localStorage once.
let cache: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

export const historyStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): HistoryEntry[] {
    if (cache === null) cache = read();
    return cache;
  },
  getServerSnapshot(): HistoryEntry[] {
    return EMPTY;
  },
  add(entry: HistoryEntry) {
    const key = entry.question.trim().toLowerCase();
    const rest = historyStore.getSnapshot().filter((e) => e.question.trim().toLowerCase() !== key);
    set([entry, ...rest].slice(0, MAX_HISTORY));
  },
  clear() {
    set(EMPTY);
  },
};

function set(entries: HistoryEntry[]) {
  cache = entries;
  write(entries);
  listeners.forEach((l) => l());
}
