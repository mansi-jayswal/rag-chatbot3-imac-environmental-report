import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";

// Dumps raw per-page text so we can inspect it before writing cleaning rules.
const pdfPath = process.argv[2] ?? "data/iMac_PER_Oct2024.pdf";
const outPath = "data/extracted/raw-pages.txt";

const pdf = await getDocumentProxy(new Uint8Array(await readFile(pdfPath)));
const { totalPages, text } = await extractText(pdf, { mergePages: false });

const out = text.map((t, i) => `===== PAGE ${i + 1} =====\n${t}`).join("\n\n");
await mkdir("data/extracted", { recursive: true });
await writeFile(outPath, out);
console.log(`${totalPages} pages, ${out.length} chars -> ${outPath}`);
