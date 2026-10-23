import { ArrowUp02Icon, StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { MAX_QUESTION_LENGTH } from "@/lib/ask-protocol";

// `draft` pre-fills the box (a welcome tile). The parent changes this component's `key` with each new draft, so the box
// starts over with the new text instead of syncing state in an effect.
type Props = { streaming: boolean; draft?: string; onSend: (question: string) => void; onStop: () => void };

const grow = (el: HTMLTextAreaElement) => {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`; // about 8 lines, then it scrolls
};

export function Composer({ streaming, draft = "", onSend, onStop }: Props) {
  const [value, setValue] = useState(draft);
  const ref = useRef<HTMLTextAreaElement>(null);

  // A pre-filled draft: size the box to it and put the cursor at the end, ready to edit or send
  useEffect(() => {
    const el = ref.current;
    if (!el || !draft) return;
    grow(el);
    el.focus();
    el.setSelectionRange(draft.length, draft.length);
  }, [draft]);

  const send = () => {
    const q = value.trim();
    if (!q || streaming) return;
    onSend(q);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); send(); }}
      className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
    >
      <label htmlFor="question" className="sr-only">Your question about the report</label>
      <textarea
        id="question"
        ref={ref}
        rows={1}
        value={value}
        maxLength={MAX_QUESTION_LENGTH}
        disabled={streaming}
        placeholder={streaming ? "Writing the answer…" : "Ask about energy use, materials, packaging or the carbon footprint…"}
        onChange={(e) => { setValue(e.target.value); grow(e.target); }}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter adds a line; ignore Enter while an IME is composing
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
        }}
        className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[0.95rem] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />
      {streaming ? (
        <button type="button" onClick={onStop} aria-label="Stop writing the answer" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <HugeiconsIcon icon={StopIcon} size={16} className="fill-current" />
        </button>
      ) : (
        <button type="submit" disabled={!value.trim()} aria-label="Send question" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40">
          <HugeiconsIcon icon={ArrowUp02Icon} size={20} />
        </button>
      )}
    </form>
  );
}
