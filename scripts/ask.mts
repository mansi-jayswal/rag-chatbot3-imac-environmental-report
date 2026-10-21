import { client } from "../src/lib/db";
import { generateAnswer, retrieve } from "../src/lib/rag/answer";

const args = process.argv.slice(2);
const withAnswer = args.includes("--answer");
const question = args.filter((a) => a !== "--answer").join(" ").trim();
if (!question) {
  console.error('Usage: npm run ask -- "<question>" [--answer]');
  process.exit(1);
}

const hits = await retrieve(question);
console.log(`\nQuestion: ${question}\n`);
for (const [i, h] of hits.entries()) {
  console.log(`#${i + 1}  page ${h.page}  score ${h.score.toFixed(3)}  [${h.kind}]\n${h.content}\n`);
}
console.log(`Top-${hits.length} pages: ${hits.map((h) => `p${h.page} (${h.score.toFixed(3)})`).join(", ")}`);

if (withAnswer) {
  try {
    console.log(`\nAnswer:\n${await generateAnswer(question, hits)}`);
  } catch (err) {
    console.error(`\nAnswer generation failed: ${String((err as Error).message).slice(0, 300)}`);
  }
}
await client.end();
process.exit(0); // the Gemini HTTP client keeps the event loop alive after the last request
