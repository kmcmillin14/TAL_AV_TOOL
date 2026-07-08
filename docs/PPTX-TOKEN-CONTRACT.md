# PPTX Token Contract — branded ROM export

The branded ROM PowerPoint export (`src/lib/pptxTemplateExport.ts`) loads
`public/templates/tal-rom-template.pptx` (the 35-slide TAL deck), removes the
slides the user didn't pick, fills placeholders, and downloads. This file is the
contract between the **template** (what placeholders/tables it must contain) and
the **code** (`src/lib/pptx/tokenMap.ts`). Keep them in sync.

## Slide map (template structure → `src/lib/pptx/sections.ts`)

| Slides | Section key | Notes |
|---|---|---|
| 1 | `cover` | always; bracket placeholders |
| 2–10 | `company` | static marketing |
| 11–17 | *(per-vehicle)* | overviews; included only for fleet chassis. 11 8TB · 12 8HBC · 13 M10 · 14 ML2 · 15 E7(ebase7) · 16 CB18 · 17 Cleanfix(always dropped) |
| 18 | `appReq` | Application Requirements table (P2) |
| 19–20 | `matrix` | Vehicle Selection Matrix — verdict + gate grid (P2) |
| 21–23 | `fleetEngine` | Raw / Charging / Buffer — native tables (web-app views) + progression strip |
| 24 | `materialFlow` | Material Flow — diagram image (P3) + table (P2) |
| 25–26 | `kpis` | KPIs (P1) |
| 27 | `investment` | Investment Summary / CAPEX (P1) |
| 28 | `roi` | ROI / payback (P1) |
| 29–32 | `services` | static |
| 33 | `whyTal` | static |
| 34 | `contact` | always; bracket placeholders |
| 35 | — | trailing; always kept |

## Placeholders

### Slide anatomy (all filled data slides)

Fillers compose through the shared frame in `src/lib/pptx/layout.ts` — zones in fixed
order **eyebrow → hero (takeaway | tiles) → evidence (table/image) → caption**, each
optional per slide, all placed at shared spacing tokens. Eyebrow strings:
S18 `01 — APPLICATION REQUIREMENTS` · S19/S20 `02 — VEHICLE SELECTION` ·
S21–23 `03 — FLEET ENGINE · TIER n OF 3 — NAME` · S24 `04 — MATERIAL FLOW` ·
S25 `05 — FINANCIALS` · S26 `05 — FLEET & FLOW` · S27 `06 — INVESTMENT` ·
S28 `06 — RETURN ON INVESTMENT` · appendices `APPENDIX — METHODOLOGY` /
`APPENDIX — CYCLE MATH`. Money slides (S25–28) lead with an auto-generated takeaway
sentence from `src/lib/pptx/takeaways.ts` (null → zone skipped). Table style: white
header + TAL-red underline rule, hairline dividers, no zebra (`cellXml` in `ooxml.ts`);
explicit per-cell `fill`/`color` (verdicts, TOTAL row) still wins.

### P0 — live now (cover S1 + contact S34, native single-run brackets)

| Placeholder text (in template) | Filled with |
|---|---|
| `[TAL Representative]` | `bastianRep` |
| `[TAL Representative Name]` | `bastianRep` |
| `[Project Name + Rev + OPP #]` | `projectName · Rev {versionNumber} · {OPP|LEAD} {opportunityNumber}` |
| `[Customer and Location]` | `customerName — facilityLocation` |

A placeholder with no value is left as-is (editable bracket), never blanked.
`[Title]` / `[Email]` / `[Phone Number]` on S34 have no app field → left as brackets.

**Filename:** `Rev# Opp# Customer Project.pptx` (empty parts skipped; spaces kept;
filesystem-illegal chars stripped) — `buildFilename` in `pptxTemplateExport.ts`.

### KPI slides (S25/26) — metric tiles via the frame

`src/lib/pptx/content.ts` → `fillKpis` composes both slides through the shared frame
(`layout.ts`): eyebrow → auto-generated takeaway sentence (`takeaways.ts`; skipped when
not computable) → native metric-tile grid (`metricTile` in `ooxml.ts`), plus the fleet-mix
caption on S26. The template's empty body placeholder is removed so nothing ghosts
behind the tiles. No-op for any slide the user removed.
- **S25 Financials:** ROM CAPEX · Net benefit/yr · Payback · Labor offset/yr · Annual
  OPEX · TCO @ life · Cost/move.
- **S26 Fleet & flow:** Total fleet · Vehicle types · Flows · Throughput · Energy +
  status gauges (Utilization · Availability · Charging · Redundancy) + fleet-mix caption.

### Fleet Engine (S21/22/23) — independent tiers + worked derivations

`src/lib/pptx/tables.ts` → `fillFleetEngine`. Each slide is a self-contained tier: a **meaning
caption** (`TIER n — NAME` + what it does), the `Raw + Charging × Buffer = Total` **progression
strip** (this tier + Total lit), and a **worked derivation table** (Step · What it means ·
Calculation · Result) for a representative example, rendered from the shared `src/lib/derivation.ts`
model (`cycleDerivation` / `chargingDerivation` / `bufferDerivation`):
- **S21 Raw:** travel + transfer + lift = cycle, then throughput × cycle ÷ 3600 = vehicle count.
- **S22 Charging:** usable Ah → runtime/recharge → availability → ⌈demand ÷ availability⌉ → +N.
- **S23 Buffer:** (base + charging) × (1 + buffer), rounded up = fleet.

(Per-flow detail data lives in the web app; the deck shows the method via one worked example.)

### Investment + ROI (S27/28) — native pricing table + payback chart

- **S27 Investment:** dynamic per-line pricing **table** (`fillInvestment`) — Vehicle · Qty · Unit
  Price (ROM range) · Line Total (ROM range) + red TOTAL row, from `rom.pricing.lines` via shared
  `money()`.
- **S28 ROI:** the **payback-curve chart** (`romChart.ts` → `renderPaybackChartPng`, reusing the
  pure `paybackSeries`) on top of an ROI metrics table (simple payback · annual labor offset ·
  annual operating cost); table-only fallback when no DOM. The chart owns its service-life window.

### P2 — live now (requirements + matrix + flows, via native tables)

`src/lib/pptx/tables.ts` appends native, editable `<a:tbl>` graphic frames (built by `table()`
in `ooxml.ts` — explicit cell borders/fills, no table-style dependency) into the slide body.
No-op for any slide the user removed.

- **S18 Application Requirements:** requirement → value table from project fields (imperial),
  only rows with a captured value.
- **S19 Vehicle Selection Matrix:** per-chassis verdict (GREEN/YELLOW/RED, color-filled) + notes
  (failing gates / review items). Shows **all** candidate chassis — it's the selection rationale.
- **S20 Vehicle Selection Matrix:** gate × vehicle grid (✓ pass / ✗ fail / ~ review / – n/a),
  from `qualifyVehicle` (`src/calc/trafficLight.ts`); only gates that actually ran are shown.
- **S24 Material Flow:** flow list table (route, distance, moves/hr, layout, lift, vehicle).

### P3 — live (graphics)

- **Material-flow diagram image** (S24) — `src/lib/pptx/flowDiagram.ts` (`renderFlowDiagramPng`)
  draws the flow network (locations as nodes, flows as labelled arrows) on an offscreen `<canvas>`;
  `addImage` in `ooxml.ts` writes the media part + slide rel + `<p:pic>`. Image on top of S24, flow
  table beneath. Falls back to the full flow table in non-DOM contexts.
- **Payback-curve chart** (S28) — `src/lib/pptx/romChart.ts` (`renderPaybackChartPng`), see above.
- **Dynamic per-line pricing rows** (S27) — `fillInvestment`, see above.

Canvas images are only rendered when their slide survives the section picker (no wasted PNG
encoding). The free-standing `textBox` + `appendShapesToSlide` helpers (kept in `ooxml.ts`) are
for content that has no placeholder, e.g. those graphics/images.

### Methodology appendix (appended slide)

Every export appends a **Methodology** slide after the template's last slide — `cloneSlide`
(`ooxml.ts`) clones a content shell (S18) into a new slide and wires its part/rels/content-type/
`sldIdLst`; `setSlideTitle` sets the heading; `fillMethodology` (`tables.ts`) builds a reference
table (Stage · Formula · Variables · Why) from `src/content/methodology.ts` — the same content
as the web Methodology panel. This is the first pipeline step that *adds* (not just removes) a slide.

A **per-flow cycle-math appendix** follows — `fillFlowMath` (`tables.ts`) builds, for each assigned
flow, its substituted cycle formula → cycle → demand (`out + back + load + unload + lift = cycle`,
`Q × cycle ÷ 3600 = vehicles`) from `cycleDerivation`, so the deck shows the actual figures in the
formula for every flow. Paginated 9 flows/slide via `cloneSlide`.

### Still planned

- A **CAPEX bar chart** (per-vehicle line totals via `capexBarsSeries`) if a visual alongside the
  S27 pricing table is wanted. Other ROM dashboard charts (duty cycle, utilization, battery SoC,
  TCO) already have pure series builders in `src/calc/romCharts.ts` and could be added the same way.
