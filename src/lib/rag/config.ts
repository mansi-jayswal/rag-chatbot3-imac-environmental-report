export const DOCUMENT_NAME = "iMac Product Environmental Report";
export const PDF_PATH = "data/iMac_PER_Oct2024.pdf";

export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 135; // ~15%

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const CHAT_MODEL = "gemini-3.8-flash";
export const EMBED_BATCH_SIZE = 20;

export const TOP_K = 5;

// Label for the ingestion pipeline; bump the versions when extraction or chunking changes so ingest re-embeds.
export const PIPELINE = "plain-text-v1";
export const CLEAN_VERSION = "plain-text-v1";
export const CHUNK_VERSION = "plain-text-v1";

// ---- Pipeline 'vision-v1' (Phase 4, D-05/D-06/D-12) ----
export const VISION_PIPELINE = "vision-v1";
// D-13: one Flash model for page vision and chat answers.
export const VISION_MODEL = CHAT_MODEL;
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
