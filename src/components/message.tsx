import { Alert02Icon, FileSearchIcon, RotateLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AskErrorCode, AskSource } from "@/lib/ask-protocol";
import { citedPages } from "@/lib/citations";
import { isRefusal } from "@/lib/refusal";
import { sharedTone, toneStyle } from "@/lib/sections";
import { AnswerText } from "./answer-text";
import { cx } from "./cx";
import { RetrievalSteps } from "./retrieval-steps";

export type UserMessage = { id: string; role: "user"; content: string };
export type AssistantMessage = {
  id: string;
  role: "assistant";
  question: string;
  content: string;
  sources: AskSource[];
  searched?: boolean; // the sources event arrived (it may carry zero sources)
  status: "streaming" | "done" | "stopped" | "error";
  error?: { code: AskErrorCode; message: string };
};
export type ChatMessage = UserMessage | AssistantMessage;

const ERROR_TEXT: Record<AskErrorCode, string> = {
  quota: "The Gemini free-tier quota is used up for now. Please try again later.",
  unavailable: "The AI service is busy right now. Please try again in a moment.",
  invalid: "That question could not be processed. Try rephrasing it.",
  internal: "Something went wrong on our side. Please try again.",
};

export function UserBubble({ message }: { message: UserMessage }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-[0.95rem] leading-relaxed text-primary-foreground">
        {message.content}
      </p>
    </div>
  );
}

type AssistantProps = {
  message: AssistantMessage;
  selected: boolean;
  onSelect: () => void;
  onCite: (ids: number[]) => void;
  onRetry: () => void;
};

export function AssistantBubble({ message: m, selected, onSelect, onCite, onRetry }: AssistantProps) {
  const refusal = m.status === "done" && isRefusal(m.content);
  // Bar colour: the section the citations point to; before any citation, the section the excerpts share (else ink)
  const cited = citedPages(m.content);
  const tone = sharedTone(cited.size ? cited : m.sources.map((s) => s.page));
  return (
    // The answer sits on a plain page with an accent bar on its left; the bar is solid for the answer whose evidence is shown.
    <div onClick={onSelect}>
      <div style={toneStyle(tone)} className={cx("min-w-0 space-y-3 border-l-[3px] py-0.5 pl-4 transition-colors sm:pl-5", selected ? "border-(--tone)" : "border-tone-faint")}>
        <RetrievalSteps message={m} />

        {refusal ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-input bg-card p-4">
            <HugeiconsIcon icon={FileSearchIcon} size={20} aria-hidden className="mt-1 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-serif text-lg font-medium">Not in the document</p>
              <p className="mt-0.5 text-sm text-muted-foreground">The report does not answer this. The closest excerpts it found are shown under Evidence, so you can judge for yourself.</p>
            </div>
          </div>
        ) : (
          m.content && <AnswerText text={m.content} sources={m.sources} onCite={onCite} />
        )}

        {m.status === "stopped" && <p className="text-xs text-muted-foreground">Stopped. This answer may be incomplete.</p>}

        {m.status === "error" && m.error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5">
            <HugeiconsIcon icon={Alert02Icon} size={20} aria-hidden className="mt-0.5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{ERROR_TEXT[m.error.code]}</p>
              {m.sources.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">Retrieval worked, so the excerpts it found are still shown under Evidence.</p>}
              {m.error.code !== "quota" && m.error.code !== "invalid" && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onRetry(); }} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <HugeiconsIcon icon={RotateLeft01Icon} size={14} /> Try again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
