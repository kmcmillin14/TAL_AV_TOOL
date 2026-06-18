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

### KPI slides (S25/26) — placeholder text fill

The empty step shells each ship with one body **Content Placeholder** (`<p:ph idx="1"/>`)
laid out by the template. `src/lib/pptx/content.ts` → `fillKpis` writes paragraphs into that
placeholder's `<p:txBody>` (`fillBodyPlaceholder` in `ooxml.ts`) so the content **inherits the
slide's branded position/style**. No-op for any slide the user removed.
- **S25 KPIs:** fleet total · flow count · throughput; base + charging → buffered.
- **S26 KPIs:** per-vehicle fleet mix.

### Fleet Engine (S21/22/23) — native tables (web-app views)

`src/lib/pptx/tables.ts` → `fillFleetEngine`. Each slide = a `Raw + Charging × Buffer = Total`
**progression strip** (active stage + Total highlighted) above that stage's detail table, from
`computeFleetModel`:
- **S21 Raw:** Flows table — Vehicle · Route Input · Output bands (#/Vehicle/Transfer Type/Route
  Avg Speed/Origin/Destination/Distance/Moves-hr/Cycle Time/Vehicle Count).
- **S22 Charging:** Flow / Charge Method / Cycle / Vehicles / Runtime / Recharge / Availability / Charging.
- **S23 Buffer:** Flow / Base / + Charging / × (1+buffer) / Fleet.

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

### Still planned

- A **CAPEX bar chart** (per-vehicle line totals via `capexBarsSeries`) if a visual alongside the
  S27 pricing table is wanted. Other ROM dashboard charts (duty cycle, utilization, battery SoC,
  TCO) already have pure series builders in `src/calc/romCharts.ts` and could be added the same way.
