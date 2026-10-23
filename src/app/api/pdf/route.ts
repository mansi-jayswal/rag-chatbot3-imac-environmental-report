import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { PDF_PATH } from "@/lib/rag/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves the one report file (fixed path from config, never from user input) so the browser's PDF viewer can open "#page=N".
// turbopackIgnore: this one fixed file is read at runtime; without the hint the bundler traces the whole project into the server output.
const FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), PDF_PATH);

const baseHeaders = {
  "Content-Type": "application/pdf",
  "Content-Disposition": 'inline; filename="iMac_PER_Oct2024.pdf"',
  "Accept-Ranges": "bytes",
  "Cache-Control": "public, max-age=3600",
};

export async function GET(request: Request): Promise<Response> {
  let size: number;
  try {
    size = (await stat(FILE)).size;
  } catch {
    return new Response("PDF not found", { status: 404 });
  }

  // Single "bytes=start-end" ranges only; PDF viewers use them to jump straight to a page.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start < 0) start = 0;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = Readable.toWeb(createReadStream(FILE, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...baseHeaders, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
    });
  }

  const body = Readable.toWeb(createReadStream(FILE)) as ReadableStream;
  return new Response(body, { headers: { ...baseHeaders, "Content-Length": String(size) } });
}
