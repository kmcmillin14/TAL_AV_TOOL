# PPTX Slide Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every filled slide of the branded ROM PPTX export one consistent anatomy (eyebrow → hero → evidence → caption), a calmer table style (white header + red underline rule, no zebra), and auto-generated takeaway sentences on the four money slides.

**Architecture:** A new `src/lib/pptx/layout.ts` module owns a y-cursor **frame** builder that every filler composes through, consolidating the duplicated `BODY` constant and eyebrow/caption/tile/table placement helpers from `content.ts`/`tables.ts`. The table cell style in `ooxml.ts` drops the red header band and zebra fill. A new `takeaways.ts` holds pure `FleetModel → TextRun[] | null` sentence builders. Spec: `docs/superpowers/specs/2026-07-02-pptx-slide-grammar-design.md`.

**Tech Stack:** TypeScript strict, PizZip OOXML string edits, Vitest (tests run against the real `public/templates/tal-rom-template.pptx`).

**Project rules that apply (CLAUDE.md):** docs first (Task 1); no orphaned helpers (deleted in the same task that unhooks them); Toyota Type only (all text runs inherit the template theme font — never set `latin` typefaces).

**File map:**

| File | Action | Responsibility |
|---|---|---|
| `docs/SPECIFICATION.md`, `docs/PPTX-TOKEN-CONTRACT.md`, `docs/CHANGELOG.md` | Modify | Docs first |
| `src/lib/pptx/ooxml.ts` | Modify | Table cell restyle (`cellXml`, `table`) |
| `src/lib/pptx/layout.ts` | Create | `frame()` builder, `BODY`/`GAP`/`ROW_H`, `usd`/`usdRange`/`pct`, `TileSpec` |
| `src/lib/pptx/takeaways.ts` | Create | Money-slide sentence builders |
| `src/lib/pptx/tables.ts` | Modify | All fillers onto `frame`; row caps; S20 legend; tier caption merge; `put`/`tileRow` deleted |
| `src/lib/pptx/content.ts` | Modify | S25/26 onto `frame` + takeaways; local helpers deleted |
| `src/lib/pptx/flowDiagram.ts` | Modify | Remove canvas-internal title |
| `src/lib/pptxTemplateExport.ts` | Modify | `fillRoi` new arg; `FLOWS_PER_SLIDE` 11 → 9 |
| `src/lib/pptx/__tests__/layout.test.ts`, `__tests__/takeaways.test.ts` | Create | New coverage |
| `src/lib/pptx/__tests__/tables.test.ts`, `__tests__/content.test.ts` | Modify | Styling/signature assertions |

---

### Task 1: Docs first

**Files:**
- Modify: `docs/SPECIFICATION.md` (the "Branded PowerPoint (template-fill)" paragraph under Step 4)
- Modify: `docs/PPTX-TOKEN-CONTRACT.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: SPECIFICATION.md** — inside the "Branded PowerPoint (template-fill)" paragraph, after the sentence ending "Client-side via **PizZip** (`src/lib/pptxTemplateExport.ts` + `src/lib/pptx/*`).", insert:

```markdown
Every filled data slide (S18–S28 + appendices) composes one shared **slide grammar**
(`src/lib/pptx/layout.ts` — a y-cursor `frame`): **eyebrow** (spaced red caps section
label, e.g. `02 — VEHICLE SELECTION`) → **hero** (a takeaway sentence on the money
slides, or the slide's metric tiles) → **evidence** (table / chart / diagram) →
**caption** (muted context line), at shared spacing tokens. Tables are light: white
header with ink text and a single TAL-red underline rule, no zebra fill, hairline row
dividers — red appears only where it carries meaning (eyebrow, key figures, verdict
fills, the TOTAL row). The four money slides (S25 Financials, S26 Fleet & flow,
S27 Investment, S28 ROI) lead with an **auto-generated takeaway sentence** (key figures
as bold red runs, e.g. "A $980K – $1.2M investment returns $520K/yr net — payback in
2.1 years."); any figure that isn't computable drops its clause, and the takeaway is
skipped entirely when nothing meaningful is available (no placeholder text ever reaches
a customer deck). The S20 gate grid gains a glyph legend caption; the S21–23 tier
meaning + example render as the slide caption; the flow-network PNG no longer draws its
own internal title (the slide title + eyebrow carry it).
```

- [ ] **Step 2: PPTX-TOKEN-CONTRACT.md** — after the "## Placeholders" heading line, insert a new section:

```markdown
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
```

- [ ] **Step 3: PPTX-TOKEN-CONTRACT.md row-cap notes** — in the "Per-flow cycle-math appendix" paragraph, change `Paginated 11 flows/slide` to `Paginated 9 flows/slide`.

- [ ] **Step 4: CHANGELOG.md** — read the file's entry format, then prepend an entry dated 2026-07-02 in that format:

```markdown
## 2026-07-02 — PPTX slide grammar (visual redesign of the branded deck)

All filled data slides now compose one shared anatomy (eyebrow → hero → evidence →
caption) via `src/lib/pptx/layout.ts`; tables restyled (white header + red underline
rule, no zebra, taller rows); auto-generated takeaway sentences on S25–S28
(`src/lib/pptx/takeaways.ts`, figures as bold red runs, graceful degradation to
omission); S20 glyph legend; S21–23 tier meaning moved to the caption zone; flow
diagram PNG no longer draws an internal title; per-flow math appendix paginates 9/slide.
Spec: `docs/superpowers/specs/2026-07-02-pptx-slide-grammar-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/SPECIFICATION.md docs/PPTX-TOKEN-CONTRACT.md docs/CHANGELOG.md
git commit -m "docs: spec + contract + changelog for PPTX slide grammar"
```

---

### Task 2: Table restyle in `ooxml.ts`

**Files:**
- Modify: `src/lib/pptx/__tests__/tables.test.ts:43-49` (styling assertions)
- Modify: `src/lib/pptx/ooxml.ts:261-334` (`cellXml`, constants, `table`)

- [ ] **Step 1: Update the styling assertions to the new style (failing test).** In `tables.test.ts`, replace the block:

```ts
    // Engineering table styling: red header band, ink header rule, zebra rows, grid hairlines.
    const s18 = out.file('ppt/slides/slide18.xml')!.asText()
    expect(s18).toContain('<a:srgbClr val="EB0A1E"/>')          // header band fill
    expect(s18).toContain('w="19050"')                          // heavy header rule
    expect(s18).toContain('<a:srgbClr val="2B2B2B"/>')          // header rule ink
    expect(s18).toContain('<a:srgbClr val="F6F6F7"/>')          // zebra data row
    expect(s18).toContain('<a:srgbClr val="E4E4E7"/>')          // hairline border
```

with:

```ts
    // Restyled tables: white header (ink text) + TAL-red underline rule, no zebra.
    const s18 = out.file('ppt/slides/slide18.xml')!.asText()
    expect(s18).toContain('<a:lnB w="19050" cap="flat"><a:solidFill><a:srgbClr val="EB0A1E"/></a:solidFill></a:lnB>') // red header rule
    expect(s18).not.toContain('F6F6F7')                         // zebra gone
    expect(s18).toContain('<a:srgbClr val="E4E4E7"/>')          // hairline body dividers
    expect(s18).toContain('<a:srgbClr val="2B2B2B"/>')          // ink text
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t "re-parse"`
Expected: FAIL — the red `lnB` string is absent (header rule is currently ink `2B2B2B`), and `F6F6F7` zebra is present.

- [ ] **Step 3: Implement the restyle in `ooxml.ts`.** Replace the constants block above `cellXml`:

```ts
export const TAL_RED = 'EB0A1E'
const HEADER_TXT = '2B2B2B'  // ink header text (band removed — brand carried by the red rule)
const BODY_TXT = '2B2B2B'
const GRID_LINE = 'E4E4E7'   // hairline between body rows (matches the dashboard grid token)
```

(delete the `HEADER_TXT = 'FFFFFF'`, `HEADER_RULE`, and `ZEBRA` lines). Then replace `cellXml` with:

```ts
/**
 * One `<a:tc>`. Header (row 0): white background, bold ink text with letter-
 * spacing, and a single TAL-red underline rule — the brand moment, once per
 * table. Body cells: hairline bottom divider, no fill. An explicit `fill` /
 * `color` on the cell (verdicts, TOTAL row) always wins.
 */
function cellXml(c: TableCell, header: boolean): string {
  const color = c.color ?? (header ? HEADER_TXT : BODY_TXT)
  const sz = header ? 1100 : 1000
  const bold = header || c.bold ? ' b="1"' : ''
  const spc = header ? ' spc="40"' : ''   // header letter-spacing
  const run = c.t
    ? `<a:r><a:rPr lang="en-US" sz="${sz}"${bold}${spc} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(c.t)}</a:t></a:r>`
    : '<a:endParaRPr lang="en-US"/>'
  // tcPr child order per schema: borders (lnB) then fill group.
  const border = header
    ? `<a:lnB w="19050" cap="flat"><a:solidFill><a:srgbClr val="${TAL_RED}"/></a:solidFill></a:lnB>`
    : `<a:lnB w="6350" cap="flat"><a:solidFill><a:srgbClr val="${GRID_LINE}"/></a:solidFill></a:lnB>`
  const fillXml = c.fill ? `<a:solidFill><a:srgbClr val="${c.fill}"/></a:solidFill>` : '<a:noFill/>'
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${c.align ?? 'l'}"/>${run}</a:p></a:txBody>`
    + `<a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr">${border}${fillXml}</a:tcPr></a:tc>`
}
```

In `table()`, update the two touchpoints: the row builder loses the zebra index — change

```ts
  const rows = bandRow + opts.rows.map((row, i) =>
    `<a:tr h="${rowH}">${row.map(c => cellXml(c, i === 0, i)).join('')}</a:tr>`).join('')
```

to

```ts
  const rows = bandRow + opts.rows.map((row, i) =>
    `<a:tr h="${rowH}">${row.map(c => cellXml(c, i === 0)).join('')}</a:tr>`).join('')
```

and the default row height `const rowH = opts.rowH ?? 370000` → `const rowH = opts.rowH ?? 400000`.

- [ ] **Step 4: Run the pptx test suite**

Run: `npx vitest run src/lib/pptx`
Expected: ALL PASS (fillers unchanged; only default cell styling moved).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/ooxml.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): restyle tables — white header + red underline rule, no zebra, taller rows"
```

---

### Task 3: `layout.ts` — the frame builder

**Files:**
- Create: `src/lib/pptx/layout.ts`
- Create: `src/lib/pptx/__tests__/layout.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/pptx/__tests__/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PizZip from 'pizzip'
import { frame, usd, usdRange, pct } from '../layout'

const TEMPLATE = resolve(process.cwd(), 'public/templates/tal-rom-template.pptx')
const load = () => new PizZip(readFileSync(TEMPLATE))
const reopen = (zip: PizZip) => new PizZip(zip.generate({ type: 'uint8array' }))

describe('frame (shared slide grammar)', () => {
  it('composes eyebrow → takeaway → tiles → table → caption in call order', () => {
    const zip = load()
    const f = frame(zip, 18)
    f.eyebrow('01 — TEST SECTION')
    f.takeaway([{ t: 'Headline ', sz: 2100 }, { t: '42', sz: 2100, bold: true, color: 'EB0A1E' }])
    f.tiles([{ value: '1', label: 'A' }, { value: '2', label: 'B' }])
    f.table([5000000, 5820400], [[{ t: 'K' }, { t: 'V' }], [{ t: 'a' }, { t: 'b' }]])
    f.caption('legend line')

    const xml = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    const order = ['01 — TEST SECTION', 'Headline ', 'KPI Tile', '<a:tbl>', 'legend line']
      .map(s => xml.indexOf(s))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)   // appended in call order
    expect(xml).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)          // body placeholder removed
  })

  it('advances the cursor per zone and skips a null takeaway', () => {
    const zip = load()
    const f = frame(zip, 18)
    const y0 = f.y
    f.takeaway(null)
    expect(f.y).toBe(y0)                                      // null → skipped entirely
    f.eyebrow('X')
    expect(f.y).toBeGreaterThan(y0)
  })

  it('no-ops cleanly on a removed slide', () => {
    const zip = load()
    zip.remove('ppt/slides/slide18.xml')
    expect(() => {
      const f = frame(zip, 18)
      f.eyebrow('X'); f.tiles([{ value: '1', label: 'A' }]); f.caption('y')
    }).not.toThrow()
  })

  it('formats compact USD and percent', () => {
    expect(usd(1_020_000)).toBe('$1.02M')
    expect(usd(366_500)).toBe('$367K')
    expect(usd(42)).toBe('$42')
    expect(usdRange(5, 5)).toBe('$5')
    expect(usdRange(900_000, 1_100_000)).toBe('$900K – $1.10M')
    expect(pct(0.766)).toBe('77%')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pptx/__tests__/layout.test.ts`
Expected: FAIL — `../layout` does not exist.

- [ ] **Step 3: Create `src/lib/pptx/layout.ts`:**

```ts
// Shared slide grammar for the branded ROM deck. Every filled data slide
// composes the same anatomy — eyebrow → hero (takeaway | tiles) → evidence
// (table / image) → caption — through a y-cursor frame, so zone order and
// spacing are identical on every slide by construction. Pure zip/XML edits.
import type PizZip from 'pizzip'
import {
  appendShapesToSlide, removeBodyPlaceholder, nextShapeId, metricTile, textBox,
  table as tableShape, addImage, containRect, pngSize, TAL_RED,
  type TextRun, type TableCell, type TableBand,
} from './ooxml'

// Body region below the template's title bar (EMU; slide is 12192000×6858000).
export const BODY = { x: 685800, y: 1828800, cx: 10820400, cy: 4114800 }
export const GAP = 200000        // shared inter-zone / inter-tile gap
export const ROW_H = 400000      // default table row height (PowerPoint grows rows to fit text)
export const GRAY = '8A8A8E'     // muted label / caption ink

const EYEBROW_H = 360000
const TAKEAWAY_H = 520000
const CAPTION_LINE_H = 330000
// Content may run slightly past BODY.cy into the bottom margin (pre-existing
// behavior); warn only past the slide-safe limit above the footer.
const MAX_Y = BODY.y + 4800000

// Compact USD (mirrors RomKpis.usd): $1.02M / $367K / $42.
export const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`
export const usdRange = (min: number, max: number) =>
  min === max ? usd(min) : `${usd(min)} – ${usd(max)}`
export const pct = (x: number) => `${Math.round(x * 100)}%`

export interface TileSpec {
  value: string; unit?: string; label: string
  barColor?: string; accent?: boolean; figSz?: number; compact?: boolean
}

export interface Frame {
  readonly y: number
  eyebrow(text: string): void
  takeaway(runs: TextRun[] | null): void
  tiles(specs: TileSpec[], opts?: { cols?: number; h?: number }): void
  image(png: Uint8Array, maxH: number): void
  table(colW: number[], rows: TableCell[][],
    opts?: { bands?: TableBand[]; center?: boolean; rowH?: number }): void
  caption(lines: string | string[]): void
}

/** A y-cursor over the slide body. Each method appends its zone at the cursor
 *  and advances by the zone height + GAP. All methods no-op when the slide was
 *  removed by the section picker (the append helpers already guard). */
export function frame(zip: PizZip, slide: number): Frame {
  removeBodyPlaceholder(zip, slide)
  let y = BODY.y
  const advance = (h: number): void => {
    y += h + GAP
    if (process.env.NODE_ENV !== 'production' && y - GAP > MAX_Y) {
      console.warn(`pptx frame: slide ${slide} content runs past the safe body bottom`)
    }
  }
  return {
    get y() { return y },
    eyebrow(text) {
      appendShapesToSlide(zip, slide, textBox({
        id: nextShapeId(zip, slide), x: BODY.x, y, cx: BODY.cx, cy: EYEBROW_H,
        paras: [[{ t: text, bold: true, sz: 1400, color: TAL_RED }]],
      }))
      advance(EYEBROW_H)
    },
    takeaway(runs) {
      if (!runs || runs.length === 0) return
      appendShapesToSlide(zip, slide, textBox({
        id: nextShapeId(zip, slide), x: BODY.x, y, cx: BODY.cx, cy: TAKEAWAY_H, paras: [runs],
      }))
      advance(TAKEAWAY_H)
    },
    tiles(specs, opts = {}) {
      if (specs.length === 0) return
      const cols = opts.cols ?? specs.length
      const h = opts.h ?? 1300000
      const tileW = Math.round((BODY.cx - (cols - 1) * GAP) / cols)
      let id = nextShapeId(zip, slide)
      const xml = specs.map((t, i) => {
        const r = Math.floor(i / cols), c = i % cols
        const s = metricTile({
          id, x: BODY.x + c * (tileW + GAP), y: y + r * (h + GAP), cx: tileW, cy: h,
          value: t.value, unit: t.unit, label: t.label,
          barColor: t.barColor, accent: t.accent, figSz: t.figSz, compact: t.compact,
        })
        id += 2   // metricTile consumes id and id+1 (card + accent rule)
        return s
      }).join('')
      appendShapesToSlide(zip, slide, xml)
      const rows = Math.ceil(specs.length / cols)
      advance(rows * h + (rows - 1) * GAP)
    },
    image(png, maxH) {
      const { w, h } = pngSize(png)
      const rect = containRect(w, h, { x: BODY.x, y, cx: BODY.cx, cy: maxH })
      if (addImage(zip, slide, png, rect)) advance(rect.cy)
    },
    table(colW, rows, opts = {}) {
      const rowH = opts.rowH ?? ROW_H
      const cy = (rows.length + (opts.bands ? 1 : 0)) * rowH
      // `center` balances a sole table in the space remaining below the cursor.
      const ty = opts.center ? y + Math.max(0, (BODY.y + BODY.cy - y - cy) / 2) : y
      const ok = appendShapesToSlide(zip, slide, tableShape({
        id: nextShapeId(zip, slide), x: BODY.x, y: ty, cx: BODY.cx, cy,
        colW, rows, rowH, bands: opts.bands,
      }))
      if (ok) { y = ty + cy; advance(0) }
    },
    caption(lines) {
      const arr = typeof lines === 'string' ? [lines] : lines
      const cy = arr.length * CAPTION_LINE_H
      appendShapesToSlide(zip, slide, textBox({
        id: nextShapeId(zip, slide), x: BODY.x, y, cx: BODY.cx, cy,
        paras: arr.map(l => [{ t: l, sz: 1300, color: GRAY }]),
      }))
      advance(cy)
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pptx/__tests__/layout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/layout.ts src/lib/pptx/__tests__/layout.test.ts
git commit -m "feat(pptx): shared slide-grammar frame (eyebrow/takeaway/tiles/image/table/caption)"
```

---

### Task 4: `takeaways.ts` — money-slide sentences

**Files:**
- Create: `src/lib/pptx/takeaways.ts`
- Create: `src/lib/pptx/__tests__/takeaways.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/pptx/__tests__/takeaways.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import type { StoredProject } from '../../storage'
import type { TextRun } from '../ooxml'
import { financialsTakeaway, fleetFlowTakeaway, investmentTakeaway, roiTakeaway } from '../takeaways'

const text = (runs: TextRun[] | null) => (runs ?? []).map(r => r.t).join('')

// Sized fleet with labor economics → every takeaway computable.
const FULL = {
  projectName: 'Smoke', shiftsPerDay: 2, hoursPerShift: 8, bufferPct: 0.1,
  numberOfOperators: 4, fullyBurdenedRateUsdPerYear: 65000,
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack A', distanceFt: 300, thruPerHr: 20, routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack A', destination: 'Pack', distanceFt: 150, thruPerHr: 15, routeLayout: 'high', liftHeightFt: 0, vehicleId: 'ml2', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject

// Fleet sized but no operators → no labor offset → no payback.
const NO_LABOR = { ...FULL, numberOfOperators: undefined } as unknown as StoredProject

const EMPTY = { projectName: 'Empty' } as unknown as StoredProject

describe('money-slide takeaways', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('full model → complete sentences with figures as bold red runs', () => {
    const m = computeFleetModel(FULL, vehicles)
    const fin = financialsTakeaway(m)!
    expect(text(fin)).toMatch(/^A \$.+ investment returns \$.+\/yr net — payback in \d+\.\d years\.$/)
    expect(fin.some(r => r.bold && r.color === 'EB0A1E')).toBe(true)

    expect(text(fleetFlowTakeaway(m))).toMatch(/^\d+ vehicles across \d+ types handle 35 moves\/hr at \d+% utilization\.$/)
    expect(text(investmentTakeaway(m))).toMatch(/^Total ROM investment: \$.+ for \d+ vehicles\.$/)
    expect(text(roiTakeaway(m, 10))).toMatch(/^Breaks even in \d+\.\d years — \+\$.+ cumulative over 10 years\.$/)
  })

  it('partial model → clauses drop, no placeholder text', () => {
    const m = computeFleetModel(NO_LABOR, vehicles)
    expect(roiTakeaway(m, 10)).toBeNull()                       // no payback at all
    const fin = text(financialsTakeaway(m))
    expect(fin).not.toContain('payback')                        // clause dropped
    expect(fin).not.toContain('returns')                        // no net benefit clause
    expect(fin).toMatch(/^A \$.+ investment\.$/)
  })

  it('empty project → every builder returns null', () => {
    const m = computeFleetModel(EMPTY, vehicles)
    expect(financialsTakeaway(m)).toBeNull()
    expect(fleetFlowTakeaway(m)).toBeNull()
    expect(investmentTakeaway(m)).toBeNull()
    expect(roiTakeaway(m, 10)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pptx/__tests__/takeaways.test.ts`
Expected: FAIL — `../takeaways` does not exist.

- [ ] **Step 3: Create `src/lib/pptx/takeaways.ts`:**

```ts
// Auto-generated headline takeaway sentences for the money slides (S25–S28).
// Pure FleetModel → TextRun[] builders: key figures render as bold TAL-red runs
// inside an ink sentence. A figure that isn't computable drops its clause; when
// nothing meaningful is available the builder returns null and the slide renders
// without the zone — no placeholder text ever reaches a customer deck.
import type { FleetModel } from '@/src/lib/fleetModel'
import { paybackSeries } from '@/src/calc/romCharts'
import { TAL_RED, type TextRun } from './ooxml'
import { usd, usdRange, pct } from './layout'

const SZ = 2100
const ink = (t: string): TextRun => ({ t, sz: SZ })
const key = (t: string): TextRun => ({ t, sz: SZ, bold: true, color: TAL_RED })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** S25 — "A $980K – $1.2M investment returns $520K/yr net — payback in 2.1 years." */
export function financialsTakeaway(model: FleetModel): TextRun[] | null {
  const { rom } = model
  if (rom.pricing.totalMid <= 0) return null
  const runs = [ink('A '), key(usdRange(rom.pricing.totalMin, rom.pricing.totalMax)), ink(' investment')]
  const net = rom.payback.annualLaborOffset - rom.opex.annualOpex
  if (net > 0) runs.push(ink(' returns '), key(`${usd(net)}/yr`), ink(' net'))
  if (rom.payback.paybackYears != null) {
    runs.push(ink(' — payback in '), key(`${rom.payback.paybackYears.toFixed(1)} years`))
  }
  runs.push(ink('.'))
  return runs
}

/** S26 — "13 vehicles across 2 types handle 221 moves/hr at 77% utilization." */
export function fleetFlowTakeaway(model: FleetModel): TextRun[] | null {
  const { fleet, flows } = model
  const sold = fleet.totalFleetSold
  if (sold <= 0) return null
  const thru = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const totalRaw = fleet.groups.reduce((s, g) => s + g.groupRaw, 0)
  const runs = [
    key(plural(sold, 'vehicle')),
    ink(` across ${plural(fleet.groups.length, 'type')} handle${sold === 1 ? 's' : ''} `),
    key(`${thru} moves/hr`),
  ]
  if (totalRaw > 0) runs.push(ink(' at '), key(pct(totalRaw / sold)), ink(' utilization'))
  runs.push(ink('.'))
  return runs
}

/** S27 — "Total ROM investment: $980K – $1.2M for 13 vehicles." */
export function investmentTakeaway(model: FleetModel): TextRun[] | null {
  const { rom, fleet } = model
  if (rom.pricing.lines.length === 0 || rom.pricing.totalMid <= 0) return null
  return [
    ink('Total ROM investment: '),
    key(usdRange(rom.pricing.totalMin, rom.pricing.totalMax)),
    ink(' for '), key(plural(fleet.totalFleetSold, 'vehicle')), ink('.'),
  ]
}

/** S28 — "Breaks even in 2.1 years — +$3.4M cumulative over 10 years." */
export function roiTakeaway(model: FleetModel, serviceLifeYears: number): TextRun[] | null {
  const payback = model.rom.payback.paybackYears
  if (payback == null) return null
  const runs = [ink('Breaks even in '), key(`${payback.toFixed(1)} years`)]
  const { points } = paybackSeries(model.rom, serviceLifeYears)
  const last = points[points.length - 1]?.cumulative
  if (last != null && last > 0) {
    runs.push(ink(' — '), key(`+${usd(last)}`), ink(` cumulative over ${serviceLifeYears} years`))
  }
  runs.push(ink('.'))
  return runs
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pptx/__tests__/takeaways.test.ts`
Expected: PASS (3 tests). If the FULL fixture's regexes fail on real numbers (e.g. utilization missing because `groupRaw` sums differently), adjust the *fixture* (not the builder) — the builders' clause rules are the contract.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/takeaways.ts src/lib/pptx/__tests__/takeaways.test.ts
git commit -m "feat(pptx): auto-generated takeaway sentences for the money slides"
```

---

### Task 5: `tables.ts` — S18/S19/S20 onto the frame

**Files:**
- Modify: `src/lib/pptx/tables.ts` (`fillRequirements`, `fillMatrix`, shared consts/imports)
- Modify: `src/lib/pptx/__tests__/tables.test.ts` (eyebrow + legend assertions)

- [ ] **Step 1: Extend the tests.** In the `'S18 leads with headline spec tiles…'` test add:

```ts
    expect(s18).toContain('01 — APPLICATION REQUIREMENTS')     // eyebrow
```

In the `'S19 colors each verdict and S20 builds a gate×vehicle grid'` test add:

```ts
    expect(s19).toContain('02 — VEHICLE SELECTION')            // eyebrow
    expect(s20).toContain('02 — VEHICLE SELECTION')
    expect(s20).toContain('not evaluated')                     // glyph legend caption
```

- [ ] **Step 2: Run to verify the new assertions fail**

Run: `npx vitest run src/lib/pptx/__tests__/tables.test.ts`
Expected: FAIL on the two updated tests (eyebrows/legend absent).

- [ ] **Step 3: Refactor `tables.ts`.** Update the imports — drop `table`, `textBox`, `metricTile` if no longer referenced after all sub-steps, add the layout import:

```ts
import { addImage, containRect, pngSize, nextShapeId, textBox, appendShapesToSlide, TAL_RED, type TableCell } from './ooxml'
import { frame, BODY, GAP, GRAY, type TileSpec } from './layout'
```

Delete from `tables.ts`: the local `BODY`, `ROW_H`, `TILE_GAP` constants, the `put` helper, the `tileRow` helper, and the local `TileSpec` interface (all superseded by `layout.ts`). *(`GRAY` moves to the layout import; the `textBox`/`appendShapesToSlide`/`nextShapeId` imports stay only while `renderTier` still uses them — they go away in Task 6.)*

Rewrite the tail of `fillRequirements` (from `removeBodyPlaceholder(...)`) as:

```ts
  const f = frame(zip, ROM_SLIDE.requirements)
  f.eyebrow('01 — APPLICATION REQUIREMENTS')
  f.tiles([
    { ...maxLoad, label: 'MAX LOAD', accent: true },
    { ...lift, label: 'LIFT / TRANSFER' },
    { ...footprint, label: 'FOOTPRINT (L×W×H)' },
    { ...schedule, label: 'SCHEDULE' },
  ], { h: 1100000 })
```

(keep the rows-building block that follows unchanged) and replace the final `put(...)` line with:

```ts
  f.table([3600000, 7220400], rows)
```

Rewrite the placement part of `fillMatrix`: replace the `removeBodyPlaceholder` + `tilesH` + `tileRow` + `put` block for S19 with:

```ts
  const f19 = frame(zip, ROM_SLIDE.matrixVerdict)
  f19.eyebrow('02 — VEHICLE SELECTION')
  f19.tiles([
    { value: String(counts.GREEN), label: 'PASS', barColor: STATUS_COLOR.GREEN },
    { value: String(counts.YELLOW), label: 'REVIEW', barColor: STATUS_COLOR.YELLOW },
    { value: String(counts.RED), label: 'FAIL', barColor: STATUS_COLOR.RED },
    { value: String(results.length), label: 'CANDIDATES' },
  ], { h: 1100000 })
  f19.table([3000000, 2000000, 5820400], verdictRows)
```

and the S20 `put(..., { center: true })` with:

```ts
  const f20 = frame(zip, ROM_SLIDE.matrixGrid)
  f20.eyebrow('02 — VEHICLE SELECTION')
  f20.table([3000000, ...byVeh.map(() => vehColW)], gridRows, { center: true, rowH: 340000 })
  f20.caption('✓ pass   ·   ~ review   ·   ✗ fail   ·   –  not evaluated')
```

- [ ] **Step 4: Run the tables suite** — other fillers still use `put`/`tileRow`, so only remove those helpers if this task's compile allows; if `renderTier`/`fillMaterialFlow`/etc. still reference them, keep the helpers until Tasks 6–8 and delete them in Task 8.

Run: `npx vitest run src/lib/pptx/__tests__/tables.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): S18–S20 onto the slide-grammar frame (eyebrows + gate-grid legend)"
```

---

### Task 6: `tables.ts` — Fleet Engine tiers (S21–23)

**Files:**
- Modify: `src/lib/pptx/tables.ts` (`renderTier`, `STAGE_META`, `CAP_H`/`PROG_H`)
- Modify: `src/lib/pptx/__tests__/tables.test.ts` (tier test)

- [ ] **Step 1: Extend the tier test.** In `'fills S21/22/23 with a tier caption…'`, add inside the `for` loop:

```ts
      expect(xml).toContain('03 — FLEET ENGINE · TIER')        // eyebrow
```

(the existing `TIER 1` / `Inputs —` / `Loaded speed` assertions still apply — the meaning + inputs move into the caption zone, they don't disappear).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t "S21/22/23"`
Expected: FAIL — eyebrow string absent.

- [ ] **Step 3: Rewrite `renderTier`.** Delete the `CAP_H` constant; change `PROG_H` to `1000000`. Replace `renderTier` with:

```ts
/** Render one tier slide: eyebrow → progression strip → worked example →
 *  meaning/inputs caption. */
function renderTier(zip: PizZip, stage: Stage, model: FleetModel, deriv: Derivation | null, example: string): void {
  const meta = STAGE_META[stage]
  const f = frame(zip, meta.slide)
  f.eyebrow(`03 — FLEET ENGINE · TIER ${meta.n} OF 3 — ${meta.name}`)
  f.tiles(progressionTiles(model, stage), { h: PROG_H })
  f.table(DERIV_COL,
    deriv ? derivationRows(deriv)
      : [[{ t: 'How it’s calculated' }], [{ t: 'Assign vehicles to flows (Step 3) to show the worked calculation.' }]],
    { rowH: 320000 })
  // Meaning + example + inputs live in the caption zone (the derivation table
  // shows how each input is used; a row per input wouldn't fit).
  const lines = [meta.meaning + (example ? `   ·   ${example}` : '')]
  const inputs = (deriv?.steps ?? []).filter(s => s.kind === 'input')
  if (inputs.length) lines.push(`Inputs — ${inputs.map(s => `${s.label} ${s.result}`).join('  ·  ')}`)
  f.caption(lines)
}
```

`STAGE_META` is unchanged. If `renderTier` was the last user of the `textBox` / `appendShapesToSlide` / `nextShapeId` / `GRAY` imports in `tables.ts`, remove them from the import list (S24/S27/S28 don't use them after Tasks 7–8; check with tsc).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pptx/__tests__/tables.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): fleet-engine tiers onto the frame — meaning/inputs as the caption zone"
```

---

### Task 7: S24 material flow + diagram title removal

**Files:**
- Modify: `src/lib/pptx/tables.ts` (`fillMaterialFlow`, `FLOW_IMG_H`)
- Modify: `src/lib/pptx/flowDiagram.ts` (title + `MARGIN_TOP`)
- Modify: `src/lib/pptx/__tests__/tables.test.ts` (S24 test)

- [ ] **Step 1: Extend the S24 test.** In `'S24 lists the flows with route and vehicle'` add:

```ts
    expect(s24).toContain('04 — MATERIAL FLOW')                // eyebrow
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t "S24 lists"`
Expected: FAIL.

- [ ] **Step 3: Rewrite `fillMaterialFlow` placement.** Change `FLOW_IMG_H` to `2100000`. Replace the body (keep the rows-building code) so placement reads:

```ts
  const f = frame(zip, ROM_SLIDE.materialFlow)
  f.eyebrow('04 — MATERIAL FLOW')
  if (diagramPng) f.image(diagramPng, FLOW_IMG_H)
  const MAX = diagramPng ? 3 : 9
  // …(existing rows building, using MAX)…
  f.table([560000, 4060400, 1300000, 1300000, 1300000, 1100000, 1200000], rows)
```

(the old `hasImg`/`tableY` logic and the direct `pngSize`/`containRect`/`addImage` calls disappear — `f.image` owns them; remove those imports from `tables.ts` if now unused).

- [ ] **Step 4: Remove the canvas-internal title in `flowDiagram.ts`.** Delete the three title lines:

```ts
  // Title.
  ctx.font = "800 54px 'Toyota Type',-apple-system,sans-serif"; ctx.fillStyle = INK
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('Material flow network', MARGIN_X, 86)
```

and change `MARGIN_TOP = 170` to `MARGIN_TOP = 110` (the space the title occupied). `INK` may become unused — if so remove it from the const line.

- [ ] **Step 5: Run the suite**

Run: `npx vitest run src/lib/pptx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptx/flowDiagram.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): S24 onto the frame; drop the diagram's internal title"
```

---

### Task 8: S27/S28 + appendices + exporter wiring

**Files:**
- Modify: `src/lib/pptx/tables.ts` (`fillInvestment`, `fillRoi`, `fillMethodology`, `fillFlowMath`, `ROI_IMG_H`, delete `put` if still present)
- Modify: `src/lib/pptxTemplateExport.ts` (`fillRoi` call, `FLOWS_PER_SLIDE`)
- Modify: `src/lib/pptx/__tests__/tables.test.ts` (S27/S28/appendix tests)

- [ ] **Step 1: Extend/adjust the tests.**

In `'S27 builds the per-line pricing table…'` add:

```ts
    expect(s27).toContain('06 — INVESTMENT')                   // eyebrow
    expect(s27).toContain('Total ROM investment:')             // takeaway sentence
```

In `'S28 ROI table fills alone…'`, change both `fillRoi(a, model)` → `fillRoi(a, model, 10)` and `fillRoi(b, model, png)` → `fillRoi(b, model, 10, png)`, and add after the `s28a` assertions:

```ts
    expect(s28a).toContain('06 — RETURN ON INVESTMENT')        // eyebrow
    expect(s28a).toContain('Breaks even in')                   // takeaway sentence
```

In the methodology test add `expect(xml).toContain('APPENDIX — METHODOLOGY')`; in the flow-math test add `expect(xml).toContain('APPENDIX — CYCLE MATH')`.

- [ ] **Step 2: Run to verify the changed tests fail**

Run: `npx vitest run src/lib/pptx/__tests__/tables.test.ts`
Expected: FAIL — `fillRoi` arity + missing eyebrows/takeaways.

- [ ] **Step 3: Rewrite the four fillers.** Add to the `tables.ts` imports:

```ts
import { investmentTakeaway, roiTakeaway } from './takeaways'
```

`fillInvestment` — keep the rows building; replace the final `put(...)` with:

```ts
  const f = frame(zip, ROM_SLIDE.investment)
  f.eyebrow('06 — INVESTMENT')
  f.takeaway(investmentTakeaway(model))
  f.table([4200000, 1200000, 2710200, 2710200], rows, { center: true })
```

`fillRoi` — new signature and placement (`ROI_IMG_H` → `1900000`):

```ts
/** S28 ROI — eyebrow → takeaway → payback-curve chart (when rendered) → metrics
 *  table; table-only when no chart (non-DOM context). */
export function fillRoi(
  zip: PizZip, model: FleetModel, serviceLifeYears: number, paybackPng?: Uint8Array | null,
): void {
  const { rom } = model
  const payback = rom.payback.paybackYears
  const f = frame(zip, ROM_SLIDE.roi)
  f.eyebrow('06 — RETURN ON INVESTMENT')
  f.takeaway(roiTakeaway(model, serviceLifeYears))
  if (paybackPng) f.image(paybackPng, ROI_IMG_H)
  f.table([5000000, 5820400], [
    [{ t: 'Metric' }, { t: 'Value', align: 'r' }],
    [{ t: 'Simple payback', bold: true }, { t: payback == null ? '—' : `${payback.toFixed(1)} years`, align: 'r' }],
    [{ t: 'Annual labor offset', bold: true }, { t: money(rom.payback.annualLaborOffset), align: 'r' }],
    [{ t: 'Annual operating cost', bold: true }, { t: money(rom.opex.annualOpex), align: 'r' }],
  ])
}
```

`fillMethodology` — replace the final `put(...)` with:

```ts
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — METHODOLOGY')
  f.table([1700000, 3300000, 3300000, 2520400], rows)
```

`fillFlowMath` — replace the final `put(...)` with:

```ts
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — CYCLE MATH')
  f.table([3000000, 4000000, 1000000, 2820400], rows, { rowH: 360000 })
```

Now delete the `put` helper (nothing references it) and prune unused `ooxml` imports (`tsc` confirms).

- [ ] **Step 4: Wire the exporter.** In `pptxTemplateExport.ts`, change `const FLOWS_PER_SLIDE = 11` → `const FLOWS_PER_SLIDE = 9`, and the ROI call:

```ts
  fillRoi(zip, model, serviceLifeYears, paybackPng)
```

- [ ] **Step 5: Run typecheck + full pptx suite**

Run: `npx tsc --noEmit && npx vitest run src/lib/pptx`
Expected: clean typecheck; ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptxTemplateExport.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): S27/S28 + appendices onto the frame with money takeaways; 9 flows/appendix slide"
```

---

### Task 9: `content.ts` — KPI slides (S25/26)

**Files:**
- Modify: `src/lib/pptx/content.ts`
- Modify: `src/lib/pptx/__tests__/content.test.ts`

- [ ] **Step 1: Extend the KPI test.** In `'fills S25/26 with native metric tiles…'` add after the eyebrow assertions:

```ts
    // Eyebrows carry the section number; takeaway sentences lead the slides.
    expect(s25).toContain('05 — FINANCIALS')
    expect(s26).toContain('05 — FLEET &amp; FLOW')
    expect(s25).toContain('investment')                        // financials takeaway
    expect(s26).toContain('moves/hr')                          // fleet & flow takeaway
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pptx/__tests__/content.test.ts`
Expected: FAIL — numbered eyebrows/takeaways absent.

- [ ] **Step 3: Refactor `content.ts`.** Replace the imports and delete the local `GRAY`, `BODY`, `EYEBROW_H`, `TILE_GAP`, `usd`, `usdRange`, `pct`, `Tile`, `eyebrow`, `tileGrid`, and `caption` definitions (all superseded):

```ts
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { chargingSeries } from '@/src/calc/romCharts'
import { resilience } from '@/src/calc/romSensitivity'
import { ROM_SLIDE } from './sections'
import { frame, usd, usdRange, pct, type TileSpec } from './layout'
import { financialsTakeaway, fleetFlowTakeaway } from './takeaways'

const MONEY_FIG = 1800     // figure size for long money / range values
```

Keep all the figure computation in `fillKpis` unchanged (financial figures, gauge aggregates). Replace the two placement blocks at the end:

```ts
  // ── S25 — Financials ──────────────────────────────────────────────────────
  const f25 = frame(zip, ROM_SLIDE.kpisHeadline)
  f25.eyebrow('05 — FINANCIALS')
  f25.takeaway(financialsTakeaway(model))
  const financials: TileSpec[] = [
    { value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), label: 'ROM CAPEX', accent: true, figSz: MONEY_FIG },
    { value: usd(offset - opex), label: 'NET BENEFIT / YR', accent: true, figSz: 2400 },
    { value: payback == null ? '—' : payback.toFixed(1), unit: 'yr', label: 'PAYBACK' },
    { value: usd(offset), label: 'LABOR OFFSET / YR', figSz: 2400 },
    { value: usd(opex), label: 'ANNUAL OPEX', figSz: 2400 },
    { value: usd(tcoAtLife), label: `TCO @ ${serviceLifeYears}YR`, figSz: 2400 },
    { value: costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}`, label: 'COST / MOVE', figSz: 2400 },
  ]
  f25.tiles(financials, { cols: 4, h: 1300000 })

  // ── S26 — Fleet & flow + status gauges ──────────────────────────────────────
  const f26 = frame(zip, ROM_SLIDE.kpisMix)
  f26.eyebrow('05 — FLEET & FLOW')
  f26.takeaway(fleetFlowTakeaway(model))
  const fleetFlow: TileSpec[] = [
    { value: String(fleet.totalFleetSold), label: 'TOTAL FLEET', accent: true },
    { value: String(fleet.groups.length), label: 'VEHICLE TYPES' },
    { value: String(flows.length), label: 'FLOWS' },
    { value: String(throughput), unit: '/ hr', label: 'THROUGHPUT' },
    { value: `${Math.round(energyPerDay)} · ${Math.round(energyPerWeek)}`, label: 'ENERGY KWH /D · /WK', figSz: 2200 },
    { value: avgUtil == null ? '—' : pct(avgUtil), label: 'UTILIZATION' },
    { value: pct(avgAvailability), label: 'AVAILABILITY' },
    { value: pct(avgCharging), label: 'CHARGING' },
    { value: res.throughputHeldWithOneDown ? '✓' : pct(res.retainedPct), label: 'REDUNDANCY' },
  ]
  f26.tiles(fleetFlow, { cols: 5, h: 1150000 })
  const mix = fleet.groups.map(g => `${nm(g.vehicleId)} ×${g.fleetSold}`).join('   ·   ')
  f26.caption(mix ? `Fleet mix — ${mix}` : 'No fleet sized yet (Step 3).')
```

- [ ] **Step 4: Run typecheck + content suite**

Run: `npx tsc --noEmit && npx vitest run src/lib/pptx/__tests__/content.test.ts`
Expected: clean; PASS (including the removed-slide no-op test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/content.ts src/lib/pptx/__tests__/content.test.ts
git commit -m "feat(pptx): KPI slides onto the frame with money takeaways"
```

---

### Task 10: Full verification + manual deck check

**Files:** none (verification only)

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit && npm run check:arch && npx vitest run`
Expected: all clean / all green. Watch the vitest output for any `pptx frame: slide N content runs past the safe body bottom` warnings — if one fires, trim that slide's zone heights (tile `h`, `FLOW_IMG_H`/`ROI_IMG_H`, or table `rowH`) until it doesn't.

- [ ] **Step 2: Manual export.** With the dev server running (port 3000/3001): open a project that has Step 1 data + flows with assigned vehicles, go to Step 4 → export **Branded PowerPoint** with all sections selected. Open the `.pptx` (Keynote or PowerPoint) and verify:
  - Every filled slide reads eyebrow → hero → evidence (→ caption), consistent spacing.
  - Tables: white headers with red underline, no zebra; S19 verdict fills, S27 red TOTAL row intact.
  - Takeaway sentences on S25/26/27/28 with red bold figures; grammar correct.
  - Nothing collides with the template title bar or footer; appendix pages ≤ 9 flows.
  - Tables still native-editable (click into a cell).

- [ ] **Step 3: Export an EMPTY project** (no flows/no Step 1 data) and verify: no takeaway sentences appear (zones skipped, no placeholder text), fallback rows show ("Assign vehicles to flows…").

- [ ] **Step 4: Fix anything found, then commit**

```bash
git add -A && git commit -m "fix(pptx): layout budget adjustments from manual deck verification"
```

(skip the commit if nothing changed).

---

### Task 11: Pre-push checklist + push

- [ ] **Step 1:** Run `/simplify` (quality pass on the diff), then `/review` (correctness pass) — per `docs/SKILLS.md`.
- [ ] **Step 2:** Push:

```bash
git push origin main
```

The pre-push hook re-runs tsc · check:arch · vitest.

---

## Self-review notes

- **Spec coverage:** grammar/frame → T3; table restyle → T2; slide-by-slide eyebrows/zones → T5–T9; takeaways + degradation → T4/T8/T9; S20 legend → T5; tier caption merge → T6; diagram title removal → T7; row caps (9/slide, S24 3/9) → T7/T8; vertical budget + overflow warn → T3/T10; docs → T1; tests → T2–T9; manual verify → T10. No gaps.
- **Type consistency:** `frame(zip, slide): Frame` with `eyebrow/takeaway/tiles/image/table/caption` used identically in T5–T9; `TileSpec` imported from `./layout` everywhere; `fillRoi(zip, model, serviceLifeYears, paybackPng?)` matches T8 test + exporter call.
- **Known judgment point:** exact EMU heights (tile `h`, `ROI_IMG_H`, caption heights) are starting values; T10 Step 1's overflow warning + manual check is the authority for nudging them.
