export const DOCUMENT_NAME = "iMac Product Environmental Report";
export const PDF_PATH = "data/iMac_PER_Oct2024.pdf";

export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 135; // ~15%

export const EMBEDDING_MODEL = "gemini-embedding-001";
// Chat models in preference order (D-28): an answer uses the first one that starts streaming. A single model turned
// Gemini overload into a dead app: gemini-3.8-flash hung past every timeout (measured 2026-10-23, same as rag-chatbot
// saw), while these answered in ~2-11 s. Each model has its own free-tier quota, so a 429 on one also falls through
// to the next. Free-tier models only; reorder to trade speed for capability, no other file needs to change.
// Measured first chunk on this key (2026-10-23): 3.5-flash 2.1 s, 3.6-flash 4.0 s, 3.5-flash-lite 1.7 s,
// 3.1-flash-lite 10.9 s, 3.8-flash no response in 20 s.
export const CHAT_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;
export const CHAT_MODEL = CHAT_MODELS[0];
// How long one model may take to send its first chunk before the next model is tried. Only the wait for the first
// chunk is capped: the SDK's httpOptions.timeout would stay armed while the body streams and cut long answers off.
export const CHAT_FIRST_CHUNK_TIMEOUT_MS = 15_000;
export const EMBED_BATCH_SIZE = 20;

export const TOP_K = 5;

// Label for the ingestion pipeline; bump the versions when extraction or chunking changes so ingest re-embeds.
export const PIPELINE = "plain-text-v1";
export const CLEAN_VERSION = "plain-text-v1";
export const CHUNK_VERSION = "plain-text-v1";

// ---- Pipeline 'vision-v1' (Phase 4, D-05/D-06/D-12) ----
export const VISION_PIPELINE = "vision-v1";
// D-13 used one Flash model for vision and chat; chat now has a fallback list (D-28) and vision stays on the model
// that made the cached transcripts (the cache key and the ingest config include it, so changing it re-transcribes).
export const VISION_MODEL = "gemini-3.8-flash";
// Bump when the vision prompt changes: the on-disk cache key includes it, so old transcripts are not reused.
export const VISION_PROMPT_VERSION = "v1";
export const VISION_CACHE_DIR = "data/extracted/vision-cache";
// Version of the element parser + footnote linking; bump on any change so ingest re-embeds.
export const ELEMENT_VERSION = "elements-v1";

// Visual-page heuristic (D-06). Why these signals: the iMac PDF's charts/tables are vector drawings and text,
// with 0 raster images, and decorative photos sit on text pages, so image count is the wrong signal.
// A table or chart stores its values as many separate short text items that are nothing but "number + unit"
// ("20.6W", "346 kg CO2e", "50%"), whereas prose keeps numbers inside long sentence items.
// A page is visual when it has at least MIN_QUANT_ITEMS such standalone items at body-text size
// (<= MAX_QUANT_FONT_HEIGHT pt: the 18pt big-number callouts on p6 are excluded because they are
// self-contained facts, not a grid). Measured on this PDF: pages 2/10/12 = 3/11/18, every other page <= 2
// (p6 has 3 big-number items but at 18pt).
export const MIN_QUANT_ITEMS = 3;
export const MAX_QUANT_FONT_HEIGHT = 14;
export const HEURISTIC_VERSION = "quant-items-v1";
