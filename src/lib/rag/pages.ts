import { createHash } from "node:crypto";
import type { PDFDocumentProxy } from "unpdf/pdfjs";
import { MAX_QUANT_FONT_HEIGHT, MIN_QUANT_ITEMS } from "./config";

export type PageInfo = {
  page: number;
  quantItems: number; // standalone "number + unit" text items at body size (the heuristic's score)
  bigQuantItems: number; // same, but larger than the font cut-off (callouts); logged, not scored
  rasterImages: number; // logged only: NOT a signal (see config.ts)
  visual: boolean;
  hash: string; // content hash of the page (text items + drawing operators), the vision cache key
};

// A text item that is only a number with a unit, e.g. "20.6W", "346 kg CO2e", "50%", "<1%", "-99 kg", "512GB".
const QUANT_ITEM = /^[-–<>]?\s?\d[\d.,]*\s?(%|kg|W|V|GB)(\s?CO2e)?$/;

// pdfjs operator codes for painting images (paintImageXObject, paintInlineImageXObject, paintImageMaskXObject).
const IMAGE_OPS = new Set([85, 86, 83]);

export async function classifyPages(pdf: PDFDocumentProxy): Promise<PageInfo[]> {
  const out: PageInfo[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const items = (await page.getTextContent()).items.filter(
      (i): i is Extract<typeof i, { str: string }> => "str" in i && i.str.trim() !== "",
    );
    const quant = items.filter((i) => QUANT_ITEM.test(i.str.trim()));
    const quantItems = quant.filter((i) => i.height <= MAX_QUANT_FONT_HEIGHT).length;
    const ops = await page.getOperatorList();
    const hash = createHash("sha256")
      .update(JSON.stringify(items.map((i) => [i.str, ...i.transform.map((n: number) => Math.round(n))])))
      .update(Buffer.from(Int32Array.from(ops.fnArray).buffer))
      .digest("hex");
    out.push({
      page: p,
      quantItems,
      bigQuantItems: quant.length - quantItems,
      rasterImages: ops.fnArray.filter((f: number) => IMAGE_OPS.has(f)).length,
      visual: quantItems >= MIN_QUANT_ITEMS,
      hash,
    });
  }
  return out;
}
