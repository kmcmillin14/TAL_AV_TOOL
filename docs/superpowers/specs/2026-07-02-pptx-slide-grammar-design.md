# PPTX Slide Grammar — visual redesign of the branded ROM deck

**Date:** 2026-07-02
**Status:** Approved design, pending implementation plan
**Scope:** `src/lib/pptx/*` + `src/lib/pptxTemplateExport.ts` (fill pipeline only — the
template `public/templates/tal-rom-template.pptx` and its theme/masters are untouched)

## Problem

The filled data slides (S18–S28 + appendices) are visually inconsistent — each filler
composes its slide ad-hoc (different stacks of tiles, captions, and tables at different
heights and gaps) — and lack hierarchy: every number carries the same visual weight, so
the one thing a customer should remember per slide doesn't jump out. Tables stack three
competing decorations (solid TAL-red header band + heavy ink rule + zebra stripes),
which reads dense and spreadsheet-like.

Usage context: the deck is **presented live, then left behind** — each slide needs a
clear headline takeaway plus enough supporting detail to survive re-reading. The apps
engineer deletes slides they don't use, so completeness stays; every slide just gets one
consistent, calmer composition. All TAL branding rules hold (template theme, Toyota Type
via the theme, TAL red as the accent).

## Design

### 1. Shared slide grammar — new module `src/lib/pptx/layout.ts`

A **frame** — a y-cursor builder over the slide body region — that every filler uses:

```ts
const f = frame(zip, slideNum)          // owns BODY region + spacing tokens
f.eyebrow('02 — VEHICLE SELECTION')     // spaced red caps label
f.takeaway(runs)                        // hero sentence (money slides only)
f.tiles(tileSpecs)                      // metric tile row/grid (hero zone)
f.table(colW, rows, opts)               // evidence zone, auto-positioned at cursor
f.caption('Fleet mix — CB18 ×10 · ML2 ×3')
```

Each call appends shapes at the cursor and advances it by the zone height plus a shared
gap token, so spacing rhythm is identical on every slide **by construction**. Fixed
anatomy, top to bottom (zones optional per slide, but always this order):

**eyebrow → hero (takeaway or tiles) → evidence (table / chart / diagram) → caption**

Consolidations into `layout.ts`:
- The `BODY` region constant (currently duplicated in `content.ts` and `tables.ts`).
- `eyebrow` / `caption` (from `content.ts`), `tileRow`/`tileGrid` (from both), and the
  `put` table-placement helper (from `tables.ts`).
- Fillers in `content.ts` / `tables.ts` become thin data → frame calls.

Type scale (sizes in hundredths of a point, as `TextRun.sz`):

| Zone | Treatment |
|---|---|
| Eyebrow | 1400 bold, TAL red `EB0A1E`, letter-spaced caps |
| Takeaway | ~2100 ink sentence; key figures as bold TAL-red runs |
| Tiles | existing `metricTile` unchanged |
| Table header | 1100 bold ink, letter-spaced |
| Table body | 1000 ink, numerics right-aligned |
| Caption | 1300 muted gray `8A8A8E` |

### 2. Table restyle — `cellXml`/`table` in `ooxml.ts`

Replace the three stacked decorations with one:
- **Header row:** white (no fill), bold ink text, a single **TAL-red underline rule**
  (the brand moment, once per table). The heavy ink rule and red band are removed.
- **Body rows:** no zebra fill; hairline `E4E4E7` bottom dividers only; row height up
  ~25% (`ROW_H` 320000 → 400000 EMU); wider cell padding (marL/marR up).
- **Semantic color survives:** S19 verdict cell fills (green/amber/red), the red TOTAL
  row on S27, ✓/✗/~ glyph colors on S20, red emphasis results on derivation tables.
  Explicit `fill`/`color` on a `TableCell` always wins — only the *defaults* change.
- **Row caps recomputed** from the taller rows against the body height: e.g. the
  per-flow cycle-math appendix drops from 11 to ~9 flows per slide (pagination already
  handles overflow); S24's flow-table cap likewise recomputed.
- The grouped super-header (`bands`) row keeps its red centered labels.

Principle: red on a data slide is either the rule under a header or the number that
matters — never wallpaper.

### 3. Slide-by-slide application

| Slide | Eyebrow | Hero zone | Evidence | Caption |
|---|---|---|---|---|
| S18 Requirements | `01 — APPLICATION REQUIREMENTS` | 4 spec tiles (as today) | requirement→value table | — |
| S19 Matrix verdicts | `02 — VEHICLE SELECTION` | verdict-count tiles (as today) | verdict table | — |
| S20 Gate grid | `02 — VEHICLE SELECTION` | — | gate×vehicle grid, centered | legend: `✓ pass · ~ review · ✗ fail · – not evaluated` (new) |
| S21–23 Fleet Engine | `03 — FLEET ENGINE · TIER n OF 3` | progression tile strip (as today) | worked derivation table | tier meaning + example merged into one muted caption line (replaces the stacked caption textbox) |
| S24 Material flow | `04 — MATERIAL FLOW` | flow network diagram | compact flow table | — |
| S25 Financials | `05 — FINANCIALS` | **takeaway sentence** | KPI tile grid (as today) | — |
| S26 Fleet & flow | `05 — FLEET & FLOW` | **takeaway sentence** | KPI tiles + gauges (as today) | fleet mix (as today) |
| S27 Investment | `06 — INVESTMENT` | **takeaway sentence** | pricing table + red TOTAL row | — |
| S28 ROI | `06 — RETURN ON INVESTMENT` | **takeaway sentence** | payback chart + metrics table | — |
| Methodology appendix | `APPENDIX — METHODOLOGY` | — | reference table | — |
| Cycle-math appendix | `APPENDIX — CYCLE MATH` | — | per-flow table (~9/slide) | — |

Also: remove the canvas-internal "Material flow network" title from
`flowDiagram.ts` — the slide title and eyebrow already carry it. The payback chart's
canvas title stays (the chart is the sole hero of S28's evidence zone and the title
names the metric, not the slide).

### 4. Takeaway sentences (money slides only — S25/26/27/28)

Pure builders (`FleetModel → TextRun[] | null`) in `layout.ts` (or a sibling
`takeaways.ts` if `layout.ts` grows past ~250 lines). Key figures render as bold
TAL-red runs inside an ink sentence:

- **S25:** "A **$980K – $1.2M** investment returns **$520K/yr** net — payback in
  **2.1 years**."
- **S26:** "**13 vehicles** across **2 types** handle **221 moves/hr** at **77%
  utilization**."
- **S27:** "Total ROM investment: **$980K – $1.2M** for **13 vehicles**."
- **S28:** "Breaks even in **2.1 years** — **+$3.4M** cumulative over 10 years."

Graceful degradation: a missing figure drops its clause; if nothing is computable
(no fleet sized) the builder returns null, the takeaway zone is skipped, and the slide
renders without it. No placeholder text ever reaches a customer deck. Number formatting
reuses the existing compact `usd`/`usdRange`/`pct` helpers (moved to the shared module).

Vertical budget: on the tile-heavy KPI slides (S25/26) the takeaway zone's height comes
out of the tile heights (trimmed ~10–15%), keeping the whole stack inside the body
region. The frame guards this: it warns (dev) when the cursor would pass the body
bottom, so overflow is caught in tests rather than in a customer deck.

## Non-goals

- No new rendered-PNG graphics (tables stay native and editable in PowerPoint). The
  two existing canvas graphics (S24 diagram, S28 payback chart) stay. The planned
  CAPEX bar chart remains future work.
- No changes to the section picker, slide removal, cover/contact token fill, filename,
  or the template file itself.
- No changes to `metricTile` visuals — the tile design is kept as-is.

## Testing

- Existing `src/lib/pptx/__tests__/` (ooxml / tables / content against the real
  template) keep passing; assertions referencing the red header band update to the new
  header style.
- New Vitest coverage: takeaway builders (full data · partial data · empty project →
  null) and frame cursor math (zone order, spacing, table auto-position).
- Manual: export a seeded project's deck; open in PowerPoint/Keynote; confirm tables
  remain native-editable, nothing overflows the body region, appendix pagination
  correct at the new row height.

## Docs (before implementation, per CLAUDE.md)

- `docs/SPECIFICATION.md` — Branded PowerPoint section updated to the slide grammar.
- `docs/PPTX-TOKEN-CONTRACT.md` — filled-slide anatomy + new module noted.
- `docs/CHANGELOG.md` — entry for the visual redesign.
