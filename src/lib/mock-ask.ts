import type { AskEvent, AskSource } from "./ask-protocol";

// Fake backend for `/?mock=1`: lets every UI state be checked without the API, the database or chat quota.
// The excerpts below are short demo paraphrases of the report, NOT exact quotes; each starts with "Demo text."
// Pick a state with the question text: "refusal-test", "error-test" (quota), "busy-test" (unavailable),
// a question containing "carbon" or "footprint" (table + chart, answer parts in two colours), anything else = the energy answer.

const src = (id: number, page: number, kind: AskSource["kind"], content: string, score: number): AskSource => ({ id, page, kind, content, score });

const ENERGY_SOURCES: AskSource[] = [
  src(101, 7, "callout", "Demo text. iMac uses 58 percent less energy than the requirement for ENERGY STAR.\n\nFootnote 18: Demo text. Values are based on the ENERGY STAR Program Requirements for Computers.", 0.81),
  src(102, 7, "paragraph", "Demo text. ENERGY STAR specifications typically reflect the 25 percent most energy-efficient devices on the market.", 0.77),
  src(103, 12, "table", "Power consumption for iMac (demo)\n| Mode | 100V | 115V | 230V |\n|---|---|---|---|\n| Off | 0.27W | 0.27W | 0.29W |\n| Sleep | 0.56W | 0.57W | 0.59W |\n| Idle-Display On | 20.5W | 20.6W | 20.9W |", 0.74),
  src(104, 12, "footnote", "Footnote 18: Demo text. Tested with the power adapter and cables in the box; Sleep is measured after 10 minutes of inactivity.", 0.71),
  src(105, 9, "paragraph", "Demo text. The use phase assumes four years of use for macOS devices.", 0.62),
];

const ENERGY_TEXT = `iMac uses **58 percent less energy** than the ENERGY STAR requirement (page 7).

- In Idle with the display on it draws **20.6W at 115V**, and **0.57W** in Sleep (page 12).
- ENERGY STAR levels reflect the most efficient 25 percent of devices on the market (page 7).
- A made-up claim with a citation that matches no retrieved excerpt (page 3).`;

const CARBON_SOURCES: AskSource[] = [
  src(201, 10, "table", "Carbon Footprint (demo)\n| iMac (two ports) 256GB | |\n|---|---|\n| Total product footprint | 346 kg CO2e |\n| Production | 50% |\n| Transportation | 5% |\n| Product use | 45% |\n| End-of-life processing | <1% |", 0.83),
  src(202, 2, "chart", "Progress toward carbon neutral (demo)\nBaseline emissions 445 kg, emissions reductions -99 kg, iMac emissions 346 kg.", 0.78),
  src(203, 10, "table", "Carbon Footprint (demo)\n| iMac (four ports) 512GB | 391 kg CO2e |", 0.75),
  src(204, 9, "paragraph", "Demo text. Carbon footprint: emissions are calculated following ISO 14040, ISO 14044 and ISO 14067.", 0.66),
];

const CARBON_TEXT = `**Total footprint**
The iMac (two ports, 256GB) has a total footprint of **346 kg CO2e** (page 10). Production is 50% and product use 45% (page 10).

**Reductions**
Apple's baseline was 445 kg, and reductions of 99 kg bring it to 346 kg (page 2).

**How it is measured**
Emissions follow ISO 14040, ISO 14044 and ISO 14067 (page 9).`;

const REFUSAL_SOURCES: AskSource[] = [
  src(301, 7, "callout", "Demo text. Designed to last: durable unibody construction.", 0.55),
  src(302, 1, "callout", "Demo text. iMac uses 100% recycled aluminum in the stand.", 0.52),
];

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

export async function mockAskStream(question: string, signal: AbortSignal, emit: (e: AskEvent) => void): Promise<void> {
  const q = question.toLowerCase();
  let sources: AskSource[], text: string;
  if (q.includes("refusal-test")) {
    sources = REFUSAL_SOURCES;
    text = "Not in the document.";
  } else if (/carbon|footprint/.test(q)) {
    sources = CARBON_SOURCES;
    text = CARBON_TEXT;
  } else {
    sources = ENERGY_SOURCES;
    text = ENERGY_TEXT;
  }

  await wait(600, signal);
  if (signal.aborted) return;
  emit({ type: "sources", sources });
  await wait(500, signal); // "generation" starts
  if (signal.aborted) return;
  if (q.includes("error-test")) return emit({ type: "error", code: "quota", message: "mock quota error" });
  if (q.includes("busy-test")) return emit({ type: "error", code: "unavailable", message: "mock busy error" });

  for (const piece of text.match(/\S+\s*|\s+/g) ?? []) {
    if (signal.aborted) return;
    emit({ type: "text", text: piece });
    await wait(22, signal);
  }
  if (!signal.aborted) emit({ type: "done" });
}
