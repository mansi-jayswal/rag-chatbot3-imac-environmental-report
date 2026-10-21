import type { AskEvent } from "./ask-protocol";

const NETWORK_ERROR: AskEvent = {
  type: "error",
  code: "unavailable",
  message: "Couldn't reach the server. Check your connection and try again.",
};

// Posts the question and reports each NDJSON event (see ask-protocol.ts). Resolves when the stream ends;
// an aborted request resolves silently without emitting anything.
export async function streamAsk(
  question: string,
  signal: AbortSignal,
  onEvent: (event: AskEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch {
    if (!signal.aborted) onEvent(NETWORK_ERROR);
    return;
  }

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    onEvent({
      type: "error",
      code: body?.error?.code ?? "internal",
      message: body?.error?.message ?? "Something went wrong. Try again.",
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) onEvent(JSON.parse(line));
      }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer));
  } catch {
    if (!signal.aborted) {
      onEvent({ type: "error", code: "unavailable", message: "The connection dropped mid-answer. Try again." });
    }
  }
}
