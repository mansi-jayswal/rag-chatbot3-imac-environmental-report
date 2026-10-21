import { index, integer, jsonb, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 768;

export const documents = pgTable("documents", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull().unique(),
  contentHash: text("content_hash").notNull(),
  config: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // PDF page index (1-based).
    page: integer().notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    // Element kind (paragraph/table/chart/callout/footnote); the baseline only ever writes 'paragraph'.
    kind: text().notNull().default("paragraph"),
    content: text().notNull(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_document_id_idx").on(t.documentId),
  ],
);
