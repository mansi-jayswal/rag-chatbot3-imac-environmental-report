import { Cancel01Icon, Loading03Icon, Tick02Icon, UnavailableIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { AskSource } from "@/lib/ask-protocol";
import { isRefusal } from "@/lib/refusal";
import { sectionOfPage, toneStyle, type Section } from "@/lib/sections";
import { cx } from "./cx";
import type { AssistantMessage } from "./message";

// The retrieval checklist (same idea as task-2): the steps of answering, filled in from the stream events.
//   (request sent)  -> 1 "Searching the report…"
//   sources event   -> 1 done and 2 "Found N excerpts in: <sections>"
//   done event      -> 3 "Wrote the answer"
// There is no router in this project, so step 2 reports where the vector search landed rather than a chosen section.
// It stays open on every answer, so the reader can always see where an answer came from.

type StepState = "done" | "active" | "pending" | "failed" | "stopped";

const KIND_NAMES: Record<AskSource["kind"], [string, string]> = {
  table: ["table", "tables"],
  chart: ["chart", "charts"],
  callout: ["call-out", "call-outs"],
  footnote: ["footnote", "footnotes"],
  paragraph: ["paragraph", "paragraphs"],
};

function StepIcon({ state }: { state: StepState }) {
  // `key` remounts the icon when the state changes, so a new tick pops in once
  const base = "relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full";
  if (state === "done") return <span key="done" className={cx(base, "animate-step-pop bg-primary text-primary-foreground")}><HugeiconsIcon icon={Tick02Icon} size={10} strokeWidth={3} /></span>;
  if (state === "active") return <span key="active" className={cx(base, "bg-background text-primary")}><HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" /></span>;
  if (state === "failed") return <span key="failed" className={cx(base, "animate-step-pop bg-destructive text-background")}><HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={3} /></span>;
  if (state === "stopped") return <span key="stopped" className={cx(base, "bg-background text-muted-foreground")}><HugeiconsIcon icon={UnavailableIcon} size={16} /></span>;
  return <span key="pending" className={cx(base, "border border-input bg-background")} />;
}

function Step({ state, last, children }: { state: StepState; last: boolean; children: ReactNode }) {
  return (
    <li className="relative flex gap-2.5 pb-2.5 last:pb-0">
      {!last && <span aria-hidden className="absolute top-4 bottom-0 left-[7.5px] w-px bg-border" />}
      <StepIcon state={state} />
      <div className={cx("min-w-0 flex-1 leading-4", state === "pending" ? "text-muted-foreground/70" : state === "done" ? "text-foreground/85" : "text-foreground")}>
        <span className="sr-only">{state === "done" ? "Done: " : state === "active" ? "In progress: " : state === "failed" ? "Failed: " : state === "stopped" ? "Stopped: " : "Not started: "}</span>
        {children}
      </div>
    </li>
  );
}

// The sections the excerpts came from, in rank order, each dotted in its colour
function Places({ sections }: { sections: Section[] }) {
  return sections.map((s) => (
    <span key={s.name} style={toneStyle(s.tone)} className="ml-1 inline-flex items-center gap-1 rounded-md bg-tone-soft px-1.5 py-px font-medium">
      <span aria-hidden className="size-1.5 rounded-full bg-(--tone)" />{s.name}
    </span>
  ));
}

// "2 tables, 1 footnote and 2 call-outs"
function kindSummary(sources: AskSource[]): string {
  const counts = new Map<AskSource["kind"], number>();
  for (const s of sources) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => `${n} ${KIND_NAMES[k]?.[n === 1 ? 0 : 1] ?? k}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

export function RetrievalSteps({ message: m }: { message: AssistantMessage }) {
  // How many steps are complete: 0 while searching, 2 once the excerpts arrived, 3 when the answer is done
  const progress = m.status === "done" ? 3 : m.searched ? 2 : 0;
  const ended = m.status === "error" || m.status === "stopped";
  const stateOf = (i: number): StepState => {
    if (i < progress) return "done";
    if (i > progress) return "pending";
    return m.status === "error" ? "failed" : m.status === "stopped" ? "stopped" : "active";
  };

  const sections = [...new Map(m.sources.map((s) => [sectionOfPage(s.page).name, sectionOfPage(s.page)])).values()];
  const best = m.sources.length ? Math.max(...m.sources.map((s) => s.score)) : null;
  const refusal = m.status === "done" && isRefusal(m.content);

  const steps: ReactNode[] = [
    m.searched ? (
      <>
        Searched the whole report
        <details className="group pt-1 text-muted-foreground">
          <summary className="w-fit cursor-pointer list-none rounded underline decoration-dotted underline-offset-2 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">How?</span><span className="hidden group-open:inline">Hide</span>
          </summary>
          <p className="mt-1 max-w-prose">
            The question was turned into a vector (an embedding) and compared with every excerpt of the report. The {m.sources.length} closest
            excerpts were kept. Tables, the chart and call-outs are separate excerpts, and each one carries the footnotes it cites.
          </p>
        </details>
      </>
    ) : { done: "", active: "Searching the report…", failed: "Could not search the report", stopped: "Stopped while searching", pending: "" }[stateOf(0)],
    m.searched ? (
      m.sources.length ? (
        <>
          Found {kindSummary(m.sources)} in:<Places sections={sections} />
          {best !== null && <span className="block pt-1 text-muted-foreground">Best match {best.toFixed(2)} (1 = identical meaning)</span>}
        </>
      ) : "Found no excerpts"
    ) : "Find the closest excerpts",
    refusal ? "Checked the excerpts: the answer is not in them"
      : m.status === "done" ? "Wrote the answer"
      : { done: "", active: "Writing the answer…", failed: "Could not finish the answer", stopped: "Stopped while writing", pending: "Write the answer" }[stateOf(2)],
  ];

  // Once an answer has ended early, the steps it never reached are left out
  const shown = ended ? steps.slice(0, progress + 1) : steps;
  return (
    <ol aria-label="How this answer was found" className="font-sans text-xs">
      {shown.map((content, i) => (
        <Step key={i} state={stateOf(i)} last={i === shown.length - 1}>{content}</Step>
      ))}
    </ol>
  );
}
