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
| 11–17 | *(per-vehicle)* | overviews; included only for engineer-assigned fleet chassis. 11 8TB · 12 8HBC · 13 M10 · 14 ML2 · 15 E7(ebase7) · 16 CB18 · 17 Cleanfix(always dropped) |
| 18 | `appReq` | Application Requirements table — ≤ 8 design-driving rows (P2) |
| 19 | `matrix` | Vehicle fit cards — engineer-assigned chassis only; dropped when none assigned (P2) |
| 20 | *(retired)* | Gate × vehicle screening grid — **always removed; content moved to appendix** |
| 21 | `fleetEngine` | Fleet Sizing waterfall — single merged slide (replaces S21–23) |
| 22 | *(retired)* | Charging tier math — **always removed; content in appendix** |
| 23 | *(retired)* | Buffer tier math — **always removed; content in appendix** |
| 24 | `materialFlow` | Material Flow — diagram image (P3) + trimmed table (P2) |
| 25 | `kpis` | Financials — three big numbers: ROM investment · labor offset/yr · simple payback |
| 26 | *(retired)* | Fleet & flow dashboard tiles — **always removed; content in appendix** |
| 27 | `investment` | Investment Summary / CAPEX pricing table (P1) |
| 28 | `roi` | ROI / payback (P1) |
| 29–32 | `services` | static |
| 33 | `whyTal` | static |
| 34 | `contact` | always; bracket placeholders |
| 35 | — | trailing; always kept |

**Appendix chain** (all cloned after S35, in order): vehicle verdict table →
gate × vehicle screening grid → sizing derivations (3 slides: Raw / Charging /
Buffer) → methodology → per-flow cycle math → cost detail.

## Placeholders

### Slide anatomy (all filled data slides)

Fillers compose through the shared frame in `src/lib/pptx/layout.ts` — zones in fixed
order: **native title** (auto-generated claim set via `setSlideTitle`; descriptive
fallback `FALLBACK_TITLE` per slide when not computable — never blank) **→ eyebrow**
(spaced red caps, numbered section label) **→ red rule** (short decorative rule beneath
the title) **→ proof** (at most one of: tile strip / table ≤ 6–8 rows / image+table)
**→ gray footnote caption** (source / assumption / appendix pointer line). Claims come
from `src/lib/pptx/takeaways.ts` title builders (second-person, confident, ≈ ≤ 60 chars);
`null` → the per-slide descriptive `FALLBACK_TITLE`, never a blank or formula string.

Eyebrow strings: S18 `01 — APPLICATION` · S19 `02 — VEHICLE SELECTION` ·
S21 `03 — FLEET SIZING` · S24 `04 — MATERIAL FLOW` · S25 `05 — FINANCIALS` ·
S27 `06 — INVESTMENT` · S28 `06 — RETURN ON INVESTMENT`.

Appendix eyebrows: verdict table + gate grid → `APPENDIX — VEHICLE SCREENING` ·
sizing derivations (3 slides) → `APPENDIX — SIZING DERIVATION` ·
methodology → `APPENDIX — METHODOLOGY` · per-flow cycle math → `APPENDIX — CYCLE MATH` ·
cost detail → `APPENDIX — COST DETAIL`.

Table style: white header + TAL-red underline rule, hairline dividers, no zebra (`cellXml`
in `ooxml.ts`); explicit per-cell `fill`/`color` (verdicts, TOTAL row) still wins.

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

### S18 Application Requirements

`src/lib/pptx/tables.ts` → `fillAppReq`. Slide title: takeaway claim (e.g. "Your
operation moves 240 pallets/hr across 5 flows") or descriptive fallback "Application
requirements". Proof: a native `<a:tbl>` requirement → value table, at most 8 rows —
only the fields that drive the design (max load, unit type, transfer method, throughput,
distance/shifts, environment). All rows have a captured value; rows with no value are
omitted. Footnote carries any ROM caveats.

### S19 Vehicle Selection fit cards — assigned chassis only

`src/lib/pptx/tables.ts` → `fillFitCards`. Slide title: takeaway (e.g. "Two vehicles
fit your application") or fallback "Vehicle selection". Proof: one card per distinct
chassis in the engineer's flow→vehicle assignments — vehicle photo, verdict pill (GREEN /
YELLOW / RED), and a plain-English "why it fits" line derived from `qualifyVehicle`
results + which flows it serves. A REVIEW verdict names its review item ("viable if the
ramp survives the site walk"). Footnote: "Selected from N chassis screened · screening
matrix in appendix."

**Data rule:** the card set is exactly the distinct chassis the engineer assigned to
flows. The tool never auto-selects a vehicle (consistent with the app rule that the
engineer always assigns). If no flows have an assigned vehicle, S19 is **dropped from
the export** — the screening matrix remains in the appendix regardless.

### S21 Fleet Sizing waterfall (replaces S21–23)

`src/lib/pptx/tables.ts` → `fillFleetEngine`. Slide title: headline claim (e.g. "Your
operation needs a fleet of 12") or fallback "Fleet sizing". Proof: the `Workload +
Charging × Buffer = Fleet` waterfall tile strip — four tiles, each with the numeric
result and a one-line human explanation (no formulas). Fleet-mix caption below the strip
(vehicle types and counts). Footnote: "ROM estimate · full derivation in appendix."
Sizing derivations (Raw / Charging / Buffer worked tables) are relocated to the
appendix — detail is preserved, not deleted.

### S24 Material Flow

`src/lib/pptx/tables.ts` + `src/lib/pptx/flowDiagram.ts`. Slide title: takeaway
(e.g. "Five flows drive your throughput requirement") or fallback "Material flow".
Proof: flow-network PNG (hero) + flow table trimmed to four columns: # · Route ·
Moves/hr · Vehicle. Parallel flows between the same two locations are merged on the
diagram (summed moves/hr + distinct vehicles); the table still lists each flow.
Falls back to table-only in non-DOM contexts.

### S25 Financials — three big numbers

`src/lib/pptx/content.ts` → `fillKpis`. Slide title: takeaway (e.g. "Payback in about
2.3 years") or fallback "Financial overview". Proof: three large-number tiles —
**ROM investment range** · **labor offset/yr** · **simple payback**. Each tile: big bold
figure + unit + spaced caps label. Figures recomputed from the shared `FleetModel` via
`costs` + `serviceLifeYears`. TCO, cost/move, and annual OPEX are relocated to the
cost-detail appendix. No S26 (retired; always removed).

### Investment + ROI (S27/28) — pricing table + payback chart

- **S27 Investment:** slide title: takeaway (e.g. "Total investment in the \$1.1M–\$1.4M
  range") or fallback "Investment summary". Proof: dynamic per-line pricing **table**
  (`fillInvestment`) — Vehicle · Qty · Unit Price (ROM range) · Line Total (ROM range)
  + red TOTAL row, from `rom.pricing.lines` via shared `money()`.
- **S28 ROI:** slide title: takeaway (e.g. "Annual labor offset of \$520K") or fallback
  "Return on investment". Proof: the **payback-curve chart** (`romChart.ts` →
  `renderPaybackChartPng`, reusing the pure `paybackSeries`) on top of a 3-row ROI
  metrics table (simple payback · annual labor offset · annual OPEX); table-only fallback
  when no DOM. The chart owns its service-life window. Annual OPEX resurfaces here; TCO +
  cost/move go to the cost-detail appendix.

### P2 — native editable tables

`src/lib/pptx/tables.ts` appends native, editable `<a:tbl>` graphic frames (built by
`table()` in `ooxml.ts` — explicit cell borders/fills, no table-style dependency) into
the slide body. No-op for any slide the user removed or that was retired.

### P3 — graphics

- **Material-flow diagram image** (S24) — `src/lib/pptx/flowDiagram.ts`
  (`renderFlowDiagramPng`) draws the flow network on an offscreen `<canvas>`; `addImage`
  in `ooxml.ts` writes the media part + slide rel + `<p:pic>`. Image on top of S24, flow
  table beneath. Falls back to the full flow table in non-DOM contexts.
- **Payback-curve chart** (S28) — `src/lib/pptx/romChart.ts` (`renderPaybackChartPng`),
  reusing the pure `paybackSeries`.
- **Vehicle photos** in S19 fit cards — reuses `addImage`; PNG with transparency.
- **Dynamic per-line pricing rows** (S27) — `fillInvestment`.

Canvas images are only rendered when their slide survives the section picker (no wasted
PNG encoding). The free-standing `textBox` + `appendShapesToSlide` helpers (kept in
`ooxml.ts`) are for content that has no placeholder.

### Appendix chain (cloned after S35)

All appendix slides are appended via the existing `cloneSlide` machinery and carry the
`APPENDIX — <NAME>` eyebrow. Order:

1. **Vehicle verdict table** — all screened chassis, verdict (GREEN/YELLOW/RED,
   color-filled) + notes (failing gates / review items). Eyebrow:
   `APPENDIX — VEHICLE SCREENING`.
2. **Gate × vehicle screening grid** — `✓` pass / `✗` fail / `~` review / `–` n/a per
   gate×chassis, from `qualifyVehicle` (`src/calc/trafficLight.ts`); only gates that
   actually ran are shown. Glyph legend caption. Eyebrow: `APPENDIX — VEHICLE SCREENING`.
3. **Sizing derivations** (3 slides: Raw / Charging / Buffer) — the worked tier tables
   (Step · What it means · Calculation · Result) for a representative example, from
   `cycleDerivation` / `chargingDerivation` / `bufferDerivation` (`src/lib/derivation.ts`).
   Eyebrow: `APPENDIX — SIZING DERIVATION`.
4. **Methodology** — Stage · Formula · Variables · Why reference table from
   `src/content/methodology.ts` (same content as the web Methodology panel). Eyebrow:
   `APPENDIX — METHODOLOGY`.
5. **Per-flow cycle math** — each assigned flow's substituted cycle formula → cycle →
   demand (`out + back + load + unload + lift = cycle`, `Q × cycle ÷ 3600 = vehicles`),
   from `cycleDerivation`. Paginated 9 flows/slide via `cloneSlide`. Eyebrow:
   `APPENDIX — CYCLE MATH`.
6. **Cost detail** — TCO @ service life, cost/move, and other financial tiles cut from
   the body (annual OPEX, status gauges). Eyebrow: `APPENDIX — COST DETAIL`.

### Still planned

- A **CAPEX bar chart** (per-vehicle line totals via `capexBarsSeries`) if a visual
  alongside the S27 pricing table is wanted. Other ROM dashboard charts (duty cycle,
  utilization, battery SoC, TCO) already have pure series builders in
  `src/calc/romCharts.ts` and could be added the same way.
