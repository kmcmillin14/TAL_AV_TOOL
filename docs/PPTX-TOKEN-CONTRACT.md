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
| 21–23 | `fleetEngine` | Raw / Charging / Buffer — canvas chart (web-app panel), text fallback |
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

### P1 — live now (Fleet Engine math + money slides, via placeholder fill)

The empty step shells each ship with one body **Content Placeholder** (`<p:ph idx="1"/>`)
laid out by the template. `src/lib/pptx/content.ts` → `fillRomContent` writes paragraphs into
that placeholder's `<p:txBody>` (`fillBodyPlaceholder` in `ooxml.ts`) so the content **inherits
the slide's branded position/style** rather than appearing in a free-floating box. The content
lives in code (reviewable, testable), not as template tokens. No-op for any slide the user removed.

Fleet Engine (S21/22/23) — rendered as **canvas charts matching the web-app engine-result panel**
(`src/lib/pptx/engineChart.ts` → `addImage`): TOTAL FLEET figure, the `Raw + Charging × Buffer =
Total` build-up bar (active stage + Total lit), demand KPIs, per-vehicle breakdown. One image per
stage (Raw S21 / Charging S22 / Buffer S23). Non-DOM contexts fall back to the text fill
(`fillFleetEngineText` in `content.ts`), which mirrors the `computeFleetModel` waterfall:
- **S21 Raw fleet:** per chassis `raw → base = ⌈Σ demand⌉`; total base fleet; daily op hours.
- **S22 Charging:** regime; per chassis availability `→ +N for charging`; total with charging.
- **S23 Buffer:** buffer %; `(base + charging) × (1 + buffer) → ⌈ ⌉`; fleet sold.

ROM money:
- **S25 KPIs:** fleet total · flow count · throughput; base + charging → buffered.
- **S26 KPIs:** per-vehicle fleet mix.
- **S27 Investment Summary:** CAPEX range (`rom.pricing.totalMin–totalMax`), total fleet, mix.
- **S28 ROI:** simple payback, annual labor offset, annual operating cost.

Data comes from `computeFleetModel(project, vehicles)` (`src/lib/fleetModel.ts`); money via a
local `usd()`; TAL red via theme `accent1`.

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

### P3 — partial (material-flow diagram image live)

- **Material-flow diagram image** (S24) — **live.** `src/lib/pptx/flowDiagram.ts`
  (`renderFlowDiagramPng`) draws the flow network (locations as nodes, flows as labelled arrows)
  on an offscreen `<canvas>` and returns PNG bytes; `addImage` in `ooxml.ts` writes the media part
  + slide rel + `<p:pic>`. The image sits on top of S24 with a compact flow table beneath it. The
  renderer returns `null` in non-DOM contexts → the exporter falls back to the full flow table.

Still planned:
- **Charts** (e.g. CAPEX/payback bars) on the money slides — same canvas-PNG + `addImage` path.
- **Dynamic pricing/mix `<a:tbl>` rows** on S27 (per-line CAPEX / per-vehicle mix).

The free-standing `textBox` + `appendShapesToSlide` helpers (kept in `ooxml.ts`) are for content
that has no placeholder, e.g. those graphics/images.
