// Must match REFUSAL in src/lib/rag/answer.ts (kept separate so client code never imports server modules).
export const REFUSAL_TEXT = "Not in the document.";

export function isRefusal(answer: string): boolean {
  return answer.trim().replace(/[.\s]+$/, "").toLowerCase() === "not in the document";
}
