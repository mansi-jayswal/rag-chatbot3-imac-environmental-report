# iMac PER page inventory (Phase 1)

Source: `data/iMac_PER_Oct2024.pdf`, 12 pages. Every page was viewed as a PNG (`pdftoppm -r 80`, kept in the
scratchpad, not in the repo) and compared against `pdftotext -layout` and the `unpdf` dump
(`npm run dump:pdf` -> `data/extracted/raw-pages.txt`, git-ignored). Numbers below were read on the page image
unless marked **(derived)** or **(uncertain)**. Gemini was not called.

Signals: `imgs` = embedded raster images from `pdfimages -list` (an smask counts as part of its image, so p1 = 1,
p6 = 1). `chars` = non-newline characters in the unpdf page text. Extraction = does unpdf keep numbers tied to
their labels (yes / partly / no).

## Summary table

| Pg | Topic | Elements | imgs | chars | Extraction | Visual? |
|----|-------|----------|------|-------|-----------|---------|
| 1 | Cover / highlights | callouts, 100% recycled aluminum stand banner, footnote markers | 1 | 1076 | yes | no (borderline) |
| 2 | Progress toward carbon neutral | paragraph, stacked-bar chart (vector), footnote markers | 0 | 1296 | partly | **yes** |
| 3 | Life-cycle diagram | paragraph, icon cycle diagram | 0 | 1029 | yes | no |
| 4 | Design and Source | paragraph, 6 material callouts, smarter chemistry | 9 | 2398 | yes | no |
| 5 | Make | paragraph, 3 callouts | 0 | 1253 | yes | no |
| 6 | Package and Ship | paragraph, 3 big-number callouts | 1 | 1039 | yes | no |
| 7 | Use | paragraph, ENERGY STAR statement, 2 callouts | 0 | 1460 | yes | no |
| 8 | Recover | paragraph, photos | 1 | 1608 | yes | no |
| 9 | Definitions | paragraphs / glossary | 0 | 4000 | yes | no |
| 10 | Carbon Footprint | table (2), paragraph, footnote marker | 0 | 1545 | partly | **yes** |
| 11 | Endnotes 1-16 | footnotes | 0 | 5672 | yes (order slightly off) | no |
| 12 | Endnotes 17-19 + power table | footnotes, table, legal | 0 | 2586 | partly | **yes** (table) |

Visual pages (ground truth for the D-06 heuristic): **2, 10, 12**. Pages 1 and 7 hold the headline claims but are
plain text on the page; they need no vision.

### Important finding for the heuristic (D-06)
"Has embedded images" is the WRONG signal here.
- False negatives: p2 (chart), p10 (tables), p12 (table) have **0 raster images** (charts and tables are vector
  drawings and text).
- False positives: p4 (9 images), p1, p6, p8 are photos or product renders with fully extractable text.
Candidate signals to test in Phase 4 (not yet tested): vector path / drawing-operator count per page, a high
share of numeric tokens, short text lines with number+unit, and low chars on a page that also has a heading. Any
heuristic must flag exactly {2, 10, 12}.

## Per page

### Page 1 - Cover
- Topic: product, date introduced 2024-10-28, six highlight blocks.
- Callouts: "More than 15% recycled content" (marker 1); "Over 20% of manufacturing electricity sourced from
  renewable energy" (marker 2); Packaging "100% fiber-based" (marker 3), "100% recycled or responsibly sourced
  wood fibers" (marker 4); Smarter chemistry (marker 5): arsenic-free glass, mercury-free, brominated flame
  retardant-free, PVC-free; Longevity; Recovery (Apple Trade In); Supplier Code of Conduct.
- Banner: **"iMac uses 100% recycled aluminum in the stand"** (callout, bottom of page).
- Footer note: data current at launch, U.S. configuration; carbon footprint includes in-box accessories and
  packaging. EPEAT Gold / ENERGY STAR logos with marker 6.
- Footnotes pointed to (p11): 1 recycled content = certified recycled mass relative to device mass, excluding
  packaging and in-box accessories; 2 low-carbon manufacturing electricity estimate (assessed for iMac two ports
  256GB, only Supplier Clean Energy Program); 3 packaging breakdown by weight, excludes adhesives/inks/coatings;
  4 forests, see Environmental Progress Report; 5 Regulated Substances Specification (PVC/phthalate exceptions:
  AC cords in India, Thailand 2-prong, South Korea); 6 EPEAT Gold in US and Canada (IEEE 1680.1 / UL 110).
- Extraction: yes. Multi-column layout is flattened but each number stays with its sentence. Caveat: footnote
  markers are glued to text ("content1", "packaging 3") and the page text has the page number "6" in the middle
  (from the EPEAT logo marker), easy to mistake for content.
- Verdict: visual no.

### Page 2 - Progress toward carbon neutral (CHART)
- Paragraph: reduced emissions for iMac (two ports) 256GB by more than 20 percent vs business-as-usual (marker
  7); more than 15 percent recycled content incl. 100 percent recycled aluminum in the stand, **reducing total
  product emissions by about 13 percent**; supplier low-carbon electricity already reduced product emissions by
  **5 percent**.
- Chart: three stacked-bar columns. Labels with numbers: **445 kg** baseline emissions (marker 7), **-99 kg**
  emissions reductions, **346 kg** iMac emissions (marker 10). Segments (categories only, no per-segment
  numbers): Materials and process emissions, Electricity for manufacturing, Electricity for product use,
  Transportation. Middle column shows reduction pieces: Recycled and low-carbon materials (marker 8),
  Low-carbon electricity (marker 9), Non-air shipping, plus a pointer "Renewable energy emissions" (marker 11).
  Green arrow from the -99 kg column to 346 kg. Arithmetic check: 445 - 99 = 346.
- Footnotes (p11): 7 baseline definition (no clean electricity beyond the grid; 2015 material carbon intensity;
  2017-2019 transport mix); 8 recycled/low-carbon materials savings counted only for aluminum, titanium,
  stainless steel, lithium, cobalt, tungsten, gold in select parts; 9 low-carbon electricity method;
  10 **the 346 kg figure is stated to be based on iMac (two ports) with 512GB** - see inconsistency below;
  11 renewable energy emissions too small to see on the chart.
- Extraction: partly. unpdf returns "445 kg", "-99 kg", "346 kg" and every label, but as separate lines, with
  "445 kg" ~30 lines AFTER the labels and the segment names repeated per column. The numbers are present but not
  tied to their column meaning (which one is baseline, which is final).
- Verdict: visual yes.

### Page 3 - Life-cycle overview
- Intro paragraph; headline "We sell millions of products. So making even small adjustments can have a
  meaningful impact."; circular diagram of five stages: Design and Source, Make, Package and Ship, Use, Recover,
  each with a one-line description. No numbers.
- Extraction: yes (diagram labels appear as text, order scrambled but harmless).
- Verdict: visual no.

### Page 4 - Design and Source
- Lead: "iMac contains more than 15 percent recycled content" (marker 1).
- Paragraph: smelter/refiner audits for tin, tantalum, tungsten, gold, cobalt, lithium (marker 12); by 2025 plans
  100% recycled cobalt in Apple-designed batteries (marker 13), 100% recycled tin soldering and gold plating in
  PCBs, 100% recycled rare earth in magnets.
- Six material callouts (each with a photo):
  - **Aluminum: 100 percent recycled aluminum in the stand.**
  - Copper: 100 percent recycled copper in multiple PCBs, also in multiple thermal module components (marker 14).
  - Gold: 100 percent recycled gold in plating of multiple PCBs.
  - Plastic: at least 50 percent recycled plastic in 13 components.
  - Rare earth elements: 100 percent recycled in all magnets, 99 percent of total rare earths in the device.
  - Tin: 100 percent recycled tin in solder of multiple PCBs.
- Smarter chemistry (marker 5): free of brominated flame retardants, PVC, phthalates, arsenic in the glass,
  mercury; 100 percent of materials covered by the Regulated Substances Specification; makeup of over 80 percent
  by mass identified.
- Footnotes: 12 (smelter lists), 13 (cobalt uses mass balance), **14 recycled copper in thermal module applies to
  iMac (four ports) only** (a caveat that changes the copper claim), 5, 1.
- Extraction: yes; callout blocks read as independent sentences. Footnote digits glued to words/numbers
  ("audits.12", "batteries,13", "components.14") which can corrupt number parsing.
- imgs 9 are decorative material photos; no chart.
- Verdict: visual no.

### Page 5 - Make
- Paragraph on Supplier Code of Conduct. Three callouts: Smarter chemicals (safer cleaners/degreasers at all
  established iMac final assembly sites, GreenScreen, marker 15); Zero Waste to Landfill (no established final
  assembly site sends waste to landfill, marker 16); Supplier energy use: **over 20 percent of manufacturing
  electricity is sourced from supplier low-carbon energy projects** (Supplier Clean Energy Program, marker 2).
- Footnotes: 15 GreenScreen benchmark 3 or 4; 16 UL 2799 Zero Waste verification, sites that have been suppliers
  over one year, at least 90 percent diversion (Silver 90-94, Gold 95-99, Platinum 100).
- Extraction: yes. Verdict: visual no (decorative line art).
- Note: p1 says "renewable energy", p5 says "low-carbon" for the same 20% - wording differs (potential
  trick question).

### Page 6 - Package and Ship
- Paragraph: packaging 100 percent fiber-based, no plastic except inks, coatings, adhesives (marker 3);
  **76 percent recycled content** in packaging; forests protected to cover new wood fiber (marker 4).
- Three big-number callouts: 100% of packaging fiber-based (marker 3); 76% recycled content in fiber packaging;
  100% of virgin wood fiber responsibly sourced (marker 17).
- Footnote 17 (p12): responsible fiber specification, wood fibers include bamboo.
- Extraction: yes, but the big-number callouts ("100%", "of the packaging3 is fiber-based...") are fragments; the
  number comes before its sentence and stays tied. 1 image = box render (decorative).
- Verdict: visual no.

### Page 7 - Use (energy)
- Lead: **"iMac uses 58 percent less energy than the requirement for ENERGY STAR"** (marker 18). Repeated in the
  section "Energy consumption of ENERGY STAR-rated products": ENERGY STAR specs "typically reflect the 25 percent
  most energy-efficient devices on the market"; "iMac consumes 58 percent less energy than the requirement for
  ENERGY STAR" (marker 18).
- Callouts: Designed to last (durable unibody construction); Made with smarter chemistry (toxicologists and
  dermatologists).
- No chart on this page despite the heading; the actual watt numbers are in footnote 18 on **p12**.
- Extraction: yes. Verdict: visual no.

### Page 8 - Recover
- Apple Trade In; free recycling if not eligible for credit (marker 19); take-back and recycling programs in
  **99 percent of countries** where products are sold; Apple Recycler Guides; apple.com/recycle.
- Footnote 19 (p12): trade-in values vary; must be 18+; in-store needs government photo ID.
- Extraction: yes. 1 image is a large decorative photo of devices. Verdict: visual no.

### Page 9 - Definitions
- Glossary: bio-based plastics, carbon footprint (ISO 14040/14044/14067; GWP100, IPCC AR6, includes biogenic
  carbon; phases Production, Transport, Use, End-of-life), low-carbon electricity, low-carbon materials (Elysis,
  hydro-smelted aluminum), recycled materials (ISO 14021), renewable materials, Supplier Clean Energy Program.
- Key detail: Use phase assumes **four years for macOS devices** (three for iOS/watchOS; four for iPadOS, tvOS).
  Production definition includes packaging manufacture.
- Extraction: yes. Verdict: visual no.

### Page 10 - Carbon Footprint (TABLES)
- Table 1, column "iMac (two ports) 256GB": Total product footprint **346 kg CO2e**; Apple emissions from
  utility-purchased electricity (scope 2) 0 kg CO2e; Life cycle product emissions (scope 3) 346 kg CO2e;
  **Production 50%, Transportation 5%, Product use 45%, End-of-life processing <1%**; GHG reductions achieved
  (marker 7) down arrow >20%. Note under table: "Percentages may not total 100 due to rounding."
- Table 2, column "iMac (four ports) 512GB": **391 kg CO2e**.
- Derived (not stated on the page) **(derived)**: production ~ 0.50 x 346 = ~173 kg; use ~ 0.45 x 346 = ~156 kg;
  transport ~17 kg. Rounded percentages, so approximate.
- Extraction: partly. unpdf keeps "Production 50%" etc. on one line each, but the column header
  ("iMac (two ports) 256GB") and the table title are far from the rows (header lands after the rows, and the
  text is scrambled: "Configuration iMac (four ports) 512GB" appears before the first table). The number
  391 is near its label but not tied to "four ports" vs "two ports" unless the reader infers it.
- Verdict: visual yes (tables with column headers).

### Page 11 - Endnotes 1-16
- Footnotes 1-16 (details above). unpdf text keeps the "N text" form but footnote numbers sometimes appear on
  their own line.
- Extraction: yes. Verdict: visual no. Each footnote is its own chunk (D-08).

### Page 12 - Endnotes 17-19 + power consumption table
- Footnote 17 wood fiber; **footnote 18 ENERGY STAR**: values based on ENERGY STAR Program Requirements for
  Computers incl. max energy allowance for iMac; tested with 143W power adapter, AC cable (1m), DC cable (2m);
  definitions of Off, Sleep (after 10 min inactivity), Idle-Display on, Power adapter no-load, Power adapter
  efficiency.
- Table "Power consumption for iMac" (100V / 115V / 230V): Off 0.27W / 0.27W / 0.29W; Sleep 0.56W / 0.57W /
  0.59W; Idle-Display On 20.5W / 20.6W / 20.9W; Power adapter no load 0.10W / 0.10W / 0.12W; Power adapter
  efficiency 91.1% / 91.5% / 91.9%.
- Footnote 19 trade-in terms; legal/trademark paragraph.
- Extraction: partly. Row values stay with row labels ("Idle-Display On 20.5W 20.6W 20.9W") but the column
  headers (100V 115V 230V, "Mode") are separated, so you cannot tell which watt value is which voltage from the
  text alone. Also the legal paragraph is emitted BEFORE the page content.
- Verdict: visual yes (table).

## Acceptance questions

1. **Energy vs ENERGY STAR.** iMac uses **58 percent less energy than the ENERGY STAR requirement**. Where:
   p7, lead sentence and the "Energy consumption of ENERGY STAR-rated products" paragraph (callout/paragraph,
   marker 18). Supporting detail is footnote 18 on p12 (definitions plus the power-consumption table, e.g. Idle
   20.5W at 100V). Plain text is enough for the headline number; the watt table needs structure.
2. **Total carbon footprint and use vs manufacturing split.** Total **346 kg CO2e** (iMac two ports, 256GB).
   Split: Production 50%, Product use 45%, Transportation 5%, End-of-life <1% (p10 table 1). Also on p2 chart as
   346 kg (baseline 445 kg, reduction -99 kg), but the chart has no per-segment numbers, so the split comes from
   the p10 table. "Manufacturing" = the table's "Production" row (includes materials, manufacturing electricity,
   assembly, packaging per p9 definition). Four-port 512GB variant is 391 kg (p10 table 2).
3. **Stand material and recycled %.** The stand is **100 percent recycled aluminum**. Where: p1 banner callout,
   p4 "Aluminum" callout, p2 paragraph (reduces total product emissions by about 13 percent). Device overall
   contains **more than 15 percent recycled content** (p1 callout, p2, p4 lead; marker 1: mass of certified
   recycled material relative to device mass, excluding packaging and in-box accessories).

## Inconsistency to be aware of
- p2 footnote 10 says the 346 kg figure is for "iMac (two ports) with 512GB", while p10 and the p2 paragraph
  say 256GB two ports (346 kg) and "four ports 512GB" (391 kg). The doc contradicts itself; golden questions
  should follow the p10 table (256GB two ports = 346 kg) and the refusal/caveat behaviour should not rely on
  footnote 10. Flag to user.

## Candidate golden questions (12)

| # | Question | Expected answer | Page / element | Needs |
|---|----------|-----------------|----------------|-------|
| 1 | How does the iMac's energy use compare with the ENERGY STAR requirement? | 58 percent less energy than required | p7 paragraph/callout, fn 18 | text |
| 2 | What is the total carbon footprint of the iMac (two ports, 256GB) and how does it split between production and use? | 346 kg CO2e; Production 50%, Use 45% (Transport 5%, EOL <1%) | p10 table 1 | table |
| 3 | What material is the stand made of and what percent is recycled? | Aluminum, 100 percent recycled | p1 banner, p4 callout | text |
| 4 | What were the baseline emissions before reductions, and how many kg were saved? | 445 kg baseline, -99 kg reduction | p2 chart | chart |
| 5 | What is the carbon footprint of the four-port 512GB iMac? | 391 kg CO2e | p10 table 2 | table |
| 6 | How much power does the iMac draw in Idle at 115V? | 20.6W | p12 table (fn 18) | table |
| 7 | What is the power adapter efficiency at 230V? | 91.9% | p12 table | table |
| 8 | How much of the packaging is recycled content? | 76 percent (fiber packaging) | p6 callout | text |
| 9 | Is the recycled copper in thermal module components true for all iMac models? | No, applies to iMac (four ports) only | p4 callout + fn 14 (p11) | footnote |
| 10 | What does the "more than 15 percent recycled content" cover? | Mass of certified recycled material relative to device mass, excluding packaging and in-box accessories | p1/p4 + fn 1 (p11) | footnote |
| 11 | How many years of use does Apple assume for the carbon footprint of a macOS device? | Four years | p9 definitions | text |
| 12 | What percent of rare earth elements in the device are recycled? | 100 percent recycled in all magnets, representing 99 percent of total rare earths in the device | p4 callout | text |

Optional refusal question (answer absent from the document): "What is the iMac's battery life?" or "How much does
an iMac weigh?" (no weight or battery data was seen; weight not verified absent beyond reading the 12 pages
visually, none was seen).

Plain-text vs vision comparison candidates: #2 and #4 (p2 chart, p10 table), #5, #6, #7 (tables).
