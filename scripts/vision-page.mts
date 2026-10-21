// One live vision call for a single page (uses the shared on-disk cache). Run: npm run vision:page -- 2
import { readFile } from "node:fs/promises";
import { getDocumentProxy } from "unpdf";
import { PDF_PATH } from "../src/lib/rag/config";
import { classifyPages } from "../src/lib/rag/pages";
import { transcribePage } from "../src/lib/rag/vision";

const page = Number(process.argv[2]);
const file = new Uint8Array(await readFile(PDF_PATH));
const infos = await classifyPages(await getDocumentProxy(file.slice()));
const info = infos[page - 1];
if (!info) throw new Error("Usage: npm run vision:page -- <page 1-12>");
try {
  const r = await transcribePage(file, page, info.hash, { maxAttempts: 2 }); // one retry, after the server's retryDelay
  console.log(`page ${page} (${r.fromCache ? "cache hit" : "API call"}):\n\n${r.markdown}`);
} catch (err) {
  console.error(`Vision call failed: ${String((err as Error).message).slice(0, 500)}`);
  process.exitCode = 1;
}
process.exit();
