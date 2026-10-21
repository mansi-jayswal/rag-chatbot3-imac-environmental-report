import { useLayoutEffect } from "react";
import { MAX_QUESTION_LENGTH } from "@/lib/ask-protocol";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
};

export function Composer({ value, onChange, onSubmit, onStop, busy, inputRef }: Props) {
  // Grow with the content up to the CSS max-height.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, inputRef]);

  const remaining = MAX_QUESTION_LENGTH - value.length;
  return (
    <div className="composer">
      <div className="in">
        <form
          className="askbar"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) onStop();
            else onSubmit();
          }}
        >
          <label className="sr-only" htmlFor="composer-input">
            Ask a question about the report
          </label>
          <textarea
            ref={inputRef}
            id="composer-input"
            name="question"
            rows={1}
            value={value}
            maxLength={MAX_QUESTION_LENGTH}
            enterKeyHint="send"
            placeholder="Ask about the report…"
            aria-describedby="composer-hint"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy) onSubmit();
              }
            }}
          />
          <button type="submit" className="send" data-busy={busy} disabled={!busy && !value.trim()}>
            {busy ? "Stop" : "Ask"}
            <kbd aria-hidden="true">{busy ? "esc" : "↵"}</kbd>
          </button>
        </form>
        <p id="composer-hint" className="askhint">
          Each question is answered on its own &mdash; follow-ups aren&rsquo;t remembered. <kbd>/</kbd> focuses the
          box, <kbd>Shift ↵</kbd> adds a line.
          {remaining <= 100 ? <span className="count"> {remaining} characters left.</span> : null}
        </p>
      </div>
    </div>
  );
}
