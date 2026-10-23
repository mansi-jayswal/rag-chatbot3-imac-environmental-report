// Wire format shared by POST /api/ask and the chat UI. Types only (plus one constant), so it is safe to
// import from client components.
//
// Success responses are NDJSON (one JSON object per line, application/x-ndjson):
//   {"type":"sources","sources":[...]}   exactly once, first
//   {"type":"text","text":"..."}         zero or more answer fragments, in order
//   {"type":"done"}                      last line on success
//   {"type":"error","code":"...","message":"..."}   last line if generation fails after sources were sent
// Failures before streaming starts (bad input, retrieval errors) are plain JSON with a non-2xx status:
//   {"error":{"code":"...","message":"..."}}

export const MAX_QUESTION_LENGTH = 500;

export type AskSourceKind = "paragraph" | "table" | "chart" | "callout" | "footnote";

export type AskSource = { id: number; page: number; kind: AskSourceKind; content: string; score: number };

export type AskErrorCode = "invalid" | "quota" | "unavailable" | "internal";

export type AskEvent =
  | { type: "sources"; sources: AskSource[] }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; code: AskErrorCode; message: string };

export const PDF_URL = "/api/pdf"; // GET serves the report; append "#page=N" to open a page
