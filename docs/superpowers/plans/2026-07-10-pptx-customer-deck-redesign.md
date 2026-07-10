# PPTX Customer Deck Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the branded ROM PPTX export from dashboard-style slides to a customer-facing deck: one claim per slide (as the slide title), at most one proof element, all math/screening detail relocated to a labeled appendix.

**Architecture:** The takeaway zone is retired — auto-generated claims go into each slide's native title placeholder (`setSlideTitle`), so slides inherit the template's own title styling. The shared frame (`layout.ts`) keeps its y-cursor zone model with a new `rule()` zone and `skip()`; body slide count drops 11 → 7 (S20/S22/S23/S26 always removed); relocated content renders on cloned appendix slides via the existing `cloneSlide` machinery.

**Tech Stack:** TypeScript strict, PizZip OOXML string edits (no new deps), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-10-pptx-customer-deck-redesign-design.md`

**Project rules that bind every task:** pure `src/lib/pptx/*` (no React/fetch/localStorage — `pptxTemplateExport.ts` is the only fetch site), Toyota Type only (inherited from template — never emit `font-family`), imperial units, price always a range.

---

## File map

| File | Change |
|---|---|
| `docs/SPECIFICATION.md`, `docs/PPTX-TOKEN-CONTRACT.md`, `docs/CHANGELOG.md` | Docs first (Task 1) |
| `src/lib/pptx/ooxml.ts` | Add `rect()`; `metricTile` gains `desc` |
| `src/lib/pptx/layout.ts` | Frame: drop `takeaway`, add `rule()` + `skip()`; add `setTitle`; `TileSpec.desc` |
| `src/lib/pptx/takeaways.ts` | Rewrite: `TextRun[]` sentence builders → `string` title builders + `FALLBACK_TITLE` |
| `src/lib/pptx/sections.ts` | `RETIRED_SLIDES = [20,22,23,26]`; section map + `ROM_SLIDE` renames |
| `src/lib/pptx/content.ts` | `fillKpis` → `fillFinancials` (3 tiles) + `fillCostDetail` appendix |
| `src/lib/pptx/tables.ts` | `fillRequirements` trim; `fillMatrix` → `fillVehicleCards` + appendix fillers; `fillFleetEngine` → `fillFleetSizing` + `buildTierDerivations`/`fillDerivation`; `fillMaterialFlow` trim; title wiring in `fillInvestment`/`fillRoi` |
| `src/lib/pptxTemplateExport.ts` | Photo fetch, appendix clone order, drop S19 when nothing assigned |
| `src/lib/pptx/__tests__/*.test.ts` | Updated per task |

---

### Task 1: Docs first (SPECIFICATION · TOKEN-CONTRACT · CHANGELOG)

**Files:**
- Modify: `docs/PPTX-TOKEN-CONTRACT.md` (slide map + "Slide anatomy" + per-slide sections)
- Modify: `docs/SPECIFICATION.md` (PPTX export section — find it with `grep -n "PPTX\|PowerPoint" docs/SPECIFICATION.md`)
- Modify: `docs/CHANGELOG.md` (new entry at top)

- [ ] **Step 1: Update `docs/PPTX-TOKEN-CONTRACT.md`**

Rewrite the "Slide anatomy" paragraph and slide map to state:

- Zone order: **native title (auto-claim via `setSlideTitle`) → eyebrow → red rule → proof (≤ 1 of: tile strip / table ≤ 6–8 rows / image+table) → gray footnote caption**. Claims come from `takeaways.ts` title builders; `null` → per-slide descriptive fallback (`FALLBACK_TITLE`), never blank.
- Body data slides: S18 (requirements, ≤ 8 rows), S19 (fit cards — only engineer-assigned chassis; dropped when none assigned), S21 (fleet sizing waterfall — replaces S21–23), S24 (diagram + trimmed table: # · Route · Moves/hr · Vehicle), S25 (3 financial tiles), S27 (pricing table), S28 (chart + 3-row table).
- **Retired body slides (always removed):** S20, S22, S23, S26.
- Eyebrows: S18 `01 — APPLICATION` · S19 `02 — VEHICLE SELECTION` · S21 `03 — FLEET SIZING` · S24 `04 — MATERIAL FLOW` · S25 `05 — FINANCIALS` · S27 `06 — INVESTMENT` · S28 `06 — RETURN ON INVESTMENT`.
- Appendix order (all cloned after S35): verdict table → gate grid → sizing derivations (3 slides: Raw/Charging/Buffer) → methodology → per-flow cycle math → cost detail. Eyebrows `APPENDIX — VEHICLE SCREENING` / `APPENDIX — SIZING DERIVATION` / `APPENDIX — METHODOLOGY` / `APPENDIX — CYCLE MATH` / `APPENDIX — COST DETAIL`.

- [ ] **Step 2: Update `docs/SPECIFICATION.md`** — mirror the same behavior change in the branded-export subsection (body slide list, S19 assigned-only rule + drop-when-empty, appendix order, title-claim behavior).

- [ ] **Step 3: Add `docs/CHANGELOG.md` entry**

```markdown
## 2026-07-10 — PPTX export: customer-deck redesign (one idea per slide)

- Every data slide now leads with an auto-generated claim in the native title
  placeholder ("Your operation needs a fleet of 12"); descriptive fallback when
  not computable. The separate takeaway zone is retired.
- Body slides 11 → 7: S20 gate grid, S22/S23 tier math, and S26 KPI-tile grid
  moved out of the presented body. S19 shows fit cards for the engineer-assigned
  chassis only (slide dropped when nothing is assigned — the tool never picks).
- New appendix chain after contact: vehicle verdicts · gate grid · sizing
  derivations · methodology · per-flow cycle math · cost detail. Detail is
  relocated, never deleted.
- Spec: docs/superpowers/specs/2026-07-10-pptx-customer-deck-redesign-design.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/PPTX-TOKEN-CONTRACT.md docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: contract + spec + changelog for the customer-deck PPTX redesign"
```

---

### Task 2: ooxml.ts — `rect()` helper + `metricTile` description line

**Files:**
- Modify: `src/lib/pptx/ooxml.ts`
- Test: `src/lib/pptx/__tests__/ooxml.test.ts`

- [ ] **Step 1: Write failing tests** (append inside the existing top-level `describe` in `ooxml.test.ts`, following its existing load/reopen helpers):

```ts
import { rect, metricTile } from '../ooxml'   // extend the existing import

describe('rect + metricTile desc', () => {
  it('rect emits a solid-fill shape at the given EMU box', () => {
    const xml = rect({ id: 7, x: 1, y: 2, cx: 600000, cy: 45720, color: 'EB0A1E' })
    expect(xml).toContain('<a:off x="1" y="2"/>')
    expect(xml).toContain('<a:ext cx="600000" cy="45720"/>')
    expect(xml).toContain('<a:srgbClr val="EB0A1E"/>')
    expect(xml).toContain('name="ROM Rule 7"')
  })
  it('metricTile renders an optional desc paragraph under the label', () => {
    const base = { id: 1, x: 0, y: 0, cx: 100, cy: 100, value: '12', label: 'FLEET' }
    expect(metricTile(base)).not.toContain('sz="900"')
    const xml = metricTile({ ...base, desc: 'recommended fleet size' })
    expect(xml).toContain('recommended fleet size')
    expect(xml).toContain('sz="900"')
    // desc paragraph comes after the label paragraph
    expect(xml.indexOf('FLEET')).toBeLessThan(xml.indexOf('recommended fleet size'))
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/ooxml.test.ts` → FAIL (`rect` is not exported / desc not rendered).

- [ ] **Step 3: Implement.** In `ooxml.ts`:

Add after `textBox` (reuses the accent-bar pattern from `metricTile`):

```ts
/** A plain solid-fill rectangle shape (e.g. the short red title rule). EMU units. */
export function rect(opts: {
  id: number; x: number; y: number; cx: number; cy: number; color: string
}): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${opts.id}" name="ROM Rule ${opts.id}"/>`
    + `<p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.cx}" cy="${opts.cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
    + `<a:solidFill><a:srgbClr val="${opts.color}"/></a:solidFill></p:spPr>`
    + `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
}
```

In `metricTile`: add `desc?: string` to the options JSDoc/type (`/** One-line plain-English explanation under the label (sz 900, muted). */`), and inside the function build:

```ts
  const desc = opts.desc
    ? `<a:p><a:pPr algn="l"><a:spcBef><a:spcPts val="300"/></a:spcBef></a:pPr>`
      + `<a:r><a:rPr lang="en-US" sz="900" dirty="0"><a:solidFill><a:srgbClr val="${TILE_LABEL}"/></a:solidFill></a:rPr>`
      + `<a:t>${escapeXml(opts.desc)}</a:t></a:r></a:p>`
    : ''
```

and append `${desc}` immediately after the label paragraph in `card` (before `</p:txBody>`):

```ts
    + `<a:p><a:pPr algn="l"><a:spcBef><a:spcPts val="500"/></a:spcBef></a:pPr>${label}</a:p>${desc}</p:txBody></p:sp>`
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/ooxml.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/ooxml.ts src/lib/pptx/__tests__/ooxml.test.ts
git commit -m "feat(pptx): rect shape helper + metric-tile description line"
```

---

### Task 3: layout.ts — Frame gets `rule()`/`skip()`, loses `takeaway`; `setTitle`

**Files:**
- Modify: `src/lib/pptx/layout.ts`
- Test: `src/lib/pptx/__tests__/layout.test.ts`

Note: `tables.ts`/`content.ts` still call `f.takeaway(...)` after this task — `tsc` will fail until Tasks 6–10 land. That's expected; vitest on this file alone still runs. Run scoped tests only until Task 10.

- [ ] **Step 1: Rewrite the first two tests in `layout.test.ts`** (keep the no-op and USD tests as-is):

```ts
import { frame, setTitle, usd, usdRange, pct } from '../layout'

  it('composes eyebrow → rule → tiles → table → caption in call order', () => {
    const zip = load()
    const f = frame(zip, 18)
    f.eyebrow('01 — TEST SECTION')
    f.rule()
    f.tiles([{ value: '1', label: 'A', desc: 'one of two' }, { value: '2', label: 'B' }])
    f.table([5000000, 5820400], [[{ t: 'K' }, { t: 'V' }], [{ t: 'a' }, { t: 'b' }]])
    f.caption('legend line')

    const xml = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    const order = ['01 — TEST SECTION', 'ROM Rule', 'KPI Tile', '<a:tbl>', 'legend line']
      .map(s => xml.indexOf(s))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(xml).toContain('one of two')                       // tile desc rendered
    expect(xml).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
  })

  it('skip() advances the cursor; setTitle falls back when the claim is null', () => {
    const zip = load()
    const f = frame(zip, 18)
    const y0 = f.y
    f.skip(500000)
    expect(f.y).toBe(y0 + 500000 + 200000)                    // h + GAP

    setTitle(zip, 18, null, 'Fleet sizing')
    expect(zip.file('ppt/slides/slide18.xml')!.asText()).toContain('Fleet sizing')
    setTitle(zip, 18, 'Your operation needs a fleet of 12', 'Fleet sizing')
    expect(zip.file('ppt/slides/slide18.xml')!.asText()).toContain('Your operation needs a fleet of 12')
  })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/layout.test.ts` → FAIL (`rule`/`skip`/`setTitle` missing).

- [ ] **Step 3: Implement in `layout.ts`:**

1. Import `rect` and `setSlideTitle` from `./ooxml` (extend the existing import).
2. Update the header comment: anatomy is now `title(claim) → eyebrow → rule → proof → caption`.
3. In `TileSpec`, add `desc?: string` and pass it through in `tiles()`'s `metricTile({ ... })` call (`desc: t.desc`).
4. In the `Frame` interface: delete `takeaway(runs: TextRun[] | null): void`; add:

```ts
  rule(): void
  skip(h: number): void
```

5. In `frame()`: delete the `takeaway` method; add (RULE_W/RULE_H as module consts):

```ts
const RULE_W = 600000     // short brand rule under the eyebrow (~0.63")
const RULE_H = 45720
```

```ts
    rule() {
      appendShapesToSlide(zip, slide, rect({
        id: nextShapeId(zip, slide), x: BODY.x, y, cx: RULE_W, cy: RULE_H, color: TAL_RED,
      }))
      advance(RULE_H)
    },
    skip(h) { advance(h) },
```

6. Remove the now-unused `TAKEAWAY_H` const and the `TextRun` import if unused; add at module level:

```ts
/** Claim → native title placeholder; descriptive fallback when not computable. */
export function setTitle(zip: PizZip, slide: number, claim: string | null, fallback: string): void {
  setSlideTitle(zip, slide, claim ?? fallback)
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/layout.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/layout.ts src/lib/pptx/__tests__/layout.test.ts
git commit -m "feat(pptx): frame rule/skip zones + setTitle; retire the takeaway zone"
```

---

### Task 4: takeaways.ts — sentence builders → title builders

**Files:**
- Rewrite: `src/lib/pptx/takeaways.ts`
- Rewrite: `src/lib/pptx/__tests__/takeaways.test.ts`

- [ ] **Step 1: Rewrite the test file** (keeps the existing FULL/NO_LABOR/EMPTY fixtures — copy them verbatim from the current file):

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { loadVehicleLibrary, type Vehicle } from '../../vehicleLibrary'
import { computeFleetModel } from '../../fleetModel'
import type { StoredProject } from '../../storage'
import {
  requirementsTitle, vehiclesTitle, fleetTitle, flowTitle,
  financialsTitle, investmentTitle, roiTitle, FALLBACK_TITLE,
} from '../takeaways'

// … FULL / NO_LABOR / EMPTY fixtures copied unchanged from the current file …

describe('slide title claims', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('full model → short second-person claims (≤ 60 chars, no trailing period)', () => {
    const m = computeFleetModel(FULL, vehicles)
    const titles = [
      fleetTitle(m), flowTitle(m), financialsTitle(m), investmentTitle(m), roiTitle(m, 10),
    ]
    for (const t of titles) {
      expect(t).toBeTruthy()
      expect(t!.length).toBeLessThanOrEqual(60)
      expect(t!.endsWith('.')).toBe(false)
    }
    expect(fleetTitle(m)).toMatch(/^Your operation needs a fleet of \d+$/)
    expect(flowTitle(m)).toBe('2 flows move 35 loads every hour')
    expect(financialsTitle(m)).toMatch(/^Payback in about \d+\.\d years$/)
    expect(investmentTitle(m)).toMatch(/^\$.+ for \d+ vehicles$/)
    expect(roiTitle(m, 10)).toMatch(/^\$.+ back over 10 years$/)
    expect(vehiclesTitle(2)).toBe('2 vehicles fit your application')
    expect(vehiclesTitle(1)).toBe('One vehicle fits your application')
  })

  it('requirements claim from load + schedule', () => {
    const p = { projectName: 'R', maxLoadWeightLbs: 2500, typicalUnitType: 'Pallet',
      shiftsPerDay: 2, hoursPerShift: 8 } as unknown as StoredProject
    expect(requirementsTitle(p)).toBe('Moving 2,500-lb pallets, 16 hours a day')
    expect(requirementsTitle({ ...p, shiftsPerDay: undefined } as unknown as StoredProject))
      .toBe('Moving 2,500-lb pallets')
    expect(requirementsTitle({ projectName: 'R' } as unknown as StoredProject)).toBeNull()
  })

  it('degrades: no payback → investment-range financials claim; nulls when empty', () => {
    const m = computeFleetModel(NO_LABOR, vehicles)
    expect(financialsTitle(m)).toMatch(/^A \$.+ ROM investment$/)
    expect(roiTitle(m, 10)).toBeNull()

    const e = computeFleetModel(EMPTY, vehicles)
    expect(fleetTitle(e)).toBeNull()
    expect(flowTitle(e)).toBeNull()
    expect(financialsTitle(e)).toBeNull()
    expect(investmentTitle(e)).toBeNull()
    expect(vehiclesTitle(0)).toBeNull()
  })

  it('every slide has a descriptive fallback', () => {
    expect(Object.values(FALLBACK_TITLE).every(t => t.length > 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/takeaways.test.ts` → FAIL.

- [ ] **Step 3: Rewrite `src/lib/pptx/takeaways.ts`:**

```ts
// Auto-generated title claims for the data slides — the slide's headline IS the
// takeaway ("Your operation needs a fleet of 12"). Pure model → string builders:
// short (≤ ~60 chars), second person, no trailing period. A claim that isn't
// computable returns null and the caller falls back to the descriptive
// FALLBACK_TITLE — a customer deck never shows a blank or a formula.
import type { FleetModel } from '@/src/lib/fleetModel'
import type { StoredProject } from '@/src/lib/storage'
import { paybackSeries } from '@/src/calc/romCharts'
import { usd, usdRange } from './layout'

export const FALLBACK_TITLE = {
  requirements: 'Application requirements',
  vehicles: 'Vehicle selection',
  fleet: 'Fleet sizing',
  flow: 'Material flow',
  financials: 'Financials',
  investment: 'Investment summary',
  roi: 'Return on investment',
} as const

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** S18 — "Moving 2,500-lb pallets, 16 hours a day" (schedule clause optional). */
export function requirementsTitle(project: StoredProject): string | null {
  const lbs = project.maxLoadWeightLbs
  const unit = project.typicalUnitType?.trim().toLowerCase()
  if (!lbs || lbs <= 0 || !unit) return null
  const claim = `Moving ${lbs.toLocaleString()}-lb ${unit}s`
  const hrPerDay = Math.min(24, (project.shiftsPerDay ?? 0) * (project.hoursPerShift ?? 0))
  return hrPerDay > 0 ? `${claim}, ${hrPerDay} hours a day` : claim
}

/** S19 — "2 vehicles fit your application" (n = distinct assigned chassis). */
export function vehiclesTitle(n: number): string | null {
  if (n <= 0) return null
  return n === 1 ? 'One vehicle fits your application' : `${n} vehicles fit your application`
}

/** S21 — "Your operation needs a fleet of 12". */
export function fleetTitle(model: FleetModel): string | null {
  const sold = model.fleet.totalFleetSold
  return sold > 0 ? `Your operation needs a fleet of ${sold}` : null
}

/** S24 — "4 flows move 210 loads every hour". */
export function flowTitle(model: FleetModel): string | null {
  const n = model.flows.length
  if (n === 0) return null
  const thru = Math.round(model.flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  return thru > 0 ? `${plural(n, 'flow')} move ${thru} loads every hour`
    : `${plural(n, 'flow')} across your facility`
}

/** S25 — "Payback in about 2.3 years", else the investment range. */
export function financialsTitle(model: FleetModel): string | null {
  const { rom } = model
  if (rom.payback.paybackYears != null) {
    return `Payback in about ${rom.payback.paybackYears.toFixed(1)} years`
  }
  return rom.pricing.totalMid > 0
    ? `A ${usdRange(rom.pricing.totalMin, rom.pricing.totalMax)} ROM investment` : null
}

/** S27 — "$980K – $1.2M for 13 vehicles". */
export function investmentTitle(model: FleetModel): string | null {
  const { rom, fleet } = model
  if (rom.pricing.lines.length === 0 || rom.pricing.totalMid <= 0) return null
  return `${usdRange(rom.pricing.totalMin, rom.pricing.totalMax)} for ${plural(fleet.totalFleetSold, 'vehicle')}`
}

/** S28 — "$3.4M back over 10 years", else the payback claim. */
export function roiTitle(model: FleetModel, serviceLifeYears: number): string | null {
  const payback = model.rom.payback.paybackYears
  if (payback == null) return null
  const { points } = paybackSeries(model.rom, serviceLifeYears)
  const last = points[points.length - 1]?.cumulative
  if (last != null && last > 0) return `${usd(last)} back over ${serviceLifeYears} years`
  return `Simple payback in ${payback.toFixed(1)} years`
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/takeaways.test.ts` → PASS. (If `flowTitle`'s expected string mismatches the fixture throughput, fix the expectation to the actual computed sum — FULL's flows are 20 + 15 = 35.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/takeaways.ts src/lib/pptx/__tests__/takeaways.test.ts
git commit -m "feat(pptx): takeaway sentences become slide-title claims with fallbacks"
```

---

### Task 5: sections.ts — retired slides + renamed map

**Files:**
- Modify: `src/lib/pptx/sections.ts`
- Create: `src/lib/pptx/__tests__/sections.test.ts`

- [ ] **Step 1: Write failing test** (`src/lib/pptx/__tests__/sections.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { PPTX_SECTIONS, ROM_SLIDE, RETIRED_SLIDES, slidesToRemove, type PptxSelection } from '../sections'

const allOn = (): PptxSelection => ({
  sections: Object.fromEntries(PPTX_SECTIONS.filter(s => !s.always).map(s => [s.key, true])),
  vehicles: { cb18: true, ml2: true, m10: true, ebase7: true, '8tb50a': true, '8hbc40a': true },
})

describe('sections (customer-deck body)', () => {
  it('retired body slides are removed even with everything selected', () => {
    const removed = slidesToRemove(allOn())
    for (const n of RETIRED_SLIDES) expect(removed).toContain(n)
    expect(RETIRED_SLIDES).toEqual([20, 22, 23, 26])
    expect(removed).toContain(17)                       // Cleanfix still always dropped
    for (const n of [18, 19, 21, 24, 25, 27, 28]) expect(removed).not.toContain(n)
  })
  it('no section owns a retired slide; ROM_SLIDE names the 7 body slides', () => {
    const owned = PPTX_SECTIONS.flatMap(s => s.slides)
    for (const n of RETIRED_SLIDES) expect(owned).not.toContain(n)
    expect(ROM_SLIDE).toEqual({
      requirements: 18, vehicles: 19, fleetSizing: 21,
      materialFlow: 24, financials: 25, investment: 27, roi: 28,
    })
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/sections.test.ts` → FAIL.

- [ ] **Step 3: Implement in `sections.ts`:**

1. Section map rows change to:

```ts
  { key: 'matrix',       label: 'Vehicle Selection',        slides: [19] },
  { key: 'fleetEngine',  label: 'Fleet Sizing',             slides: [21] },
  { key: 'kpis',         label: 'Financials',               slides: [25] },
```

2. Add below the section map:

```ts
/** Body slides retired by the customer-deck redesign (2026-07-10): gate grid,
 *  charging/buffer tier math, and the KPI-tile grid. Their content now renders
 *  on appendix slides; the template slides are always removed. */
export const RETIRED_SLIDES: readonly number[] = [20, 22, 23, 26]
```

3. Replace `ROM_SLIDE` with:

```ts
export const ROM_SLIDE = {
  requirements: 18,    // 01 — Application Requirements (trimmed table)
  vehicles: 19,        // 02 — Vehicle Selection (fit cards, assigned chassis only)
  fleetSizing: 21,     // 03 — Fleet Sizing (waterfall; replaces the 3 tier slides)
  materialFlow: 24,    // 04 — Material Flow (diagram + trimmed table)
  financials: 25,      // 05 — Financials (3 tiles)
  investment: 27,      // 06 — Investment (pricing table)
  roi: 28,             // 06 — ROI (chart + 3-row table)
} as const
```

4. In `slidesToRemove`, seed the retired slides (they're no longer owned by any section, so the default-keep rule would otherwise keep them):

```ts
  const remove: number[] = [...RETIRED_SLIDES]
  for (let n = 1; n <= TOTAL_SLIDES; n++) {
    if (owned.has(n) && !keep.has(n)) remove.push(n)
  }
  return remove
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/sections.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/sections.ts src/lib/pptx/__tests__/sections.test.ts
git commit -m "feat(pptx): retire S20/S22/S23/S26 from the presented body"
```

---

### Task 6: content.ts — `fillFinancials` (3 tiles) + `fillCostDetail` appendix

**Files:**
- Rewrite: `src/lib/pptx/content.ts`
- Rewrite: `src/lib/pptx/__tests__/content.test.ts`

- [ ] **Step 1: Rewrite the test file** (keep TEMPLATE/load/reopen helpers and the PROJECT fixture verbatim):

```ts
import { fillFinancials, fillCostDetail } from '../content'
import { cloneSlide } from '../ooxml'

describe('fillFinancials (S25) + fillCostDetail (appendix)', () => {
  let vehicles: Vehicle[]
  beforeAll(async () => { vehicles = await loadVehicleLibrary() })

  it('S25 = title claim + exactly 3 tiles + honesty footnote', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillFinancials(zip, model)
    const s25 = reopen(zip).file('ppt/slides/slide25.xml')!.asText()
    expect(s25).toContain('05 — FINANCIALS')
    expect(s25).toMatch(/Payback in about \d+\.\d years/)     // claim in the title placeholder
    for (const l of ['ROM INVESTMENT', 'LABOR OFFSET / YR', 'SIMPLE PAYBACK']) expect(s25).toContain(l)
    expect((s25.match(/name="KPI Tile \d+"/g) ?? []).length).toBe(3)
    expect(s25).toContain('cost detail in appendix')
    expect(s25).not.toMatch(/<p:ph\b[^>]*\bidx="1"/)
  })

  it('cost-detail appendix carries the relocated financial figures', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const slide = cloneSlide(zip, 18)!
    fillCostDetail(zip, slide, model, 10)
    const xml = reopen(zip).file(`ppt/slides/slide${slide}.xml`)!.asText()
    expect(xml).toContain('APPENDIX — COST DETAIL')
    for (const l of ['Net benefit / yr', 'Annual operating cost', 'TCO @ 10 yr', 'Cost per move', 'Energy']) {
      expect(xml).toContain(l)
    }
  })

  it('no-ops on a removed slide', () => {
    const zip = load()
    zip.remove('ppt/slides/slide25.xml')
    const model = computeFleetModel(PROJECT, vehicles)
    expect(() => fillFinancials(zip, model)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/content.test.ts` → FAIL.

- [ ] **Step 3: Rewrite `src/lib/pptx/content.ts`:**

```ts
// S25 Financials — the money claim as the slide title, three headline tiles
// (investment · labor offset · payback), and an honesty footnote. Everything
// else the old KPI grid carried moves to the cost-detail appendix slide
// (fillCostDetail). One idea per slide; the deck is not a dashboard.
import type PizZip from 'pizzip'
import type { FleetModel } from '@/src/lib/fleetModel'
import { ROM_SLIDE } from './sections'
import { frame, setTitle, usd, usdRange, type TileSpec } from './layout'
import { financialsTitle, FALLBACK_TITLE } from './takeaways'
import type { TableCell } from './ooxml'

/** S25 — ROM investment · labor offset/yr · simple payback, nothing else. */
export function fillFinancials(zip: PizZip, model: FleetModel): void {
  const { rom } = model
  setTitle(zip, ROM_SLIDE.financials, financialsTitle(model), FALLBACK_TITLE.financials)
  const f = frame(zip, ROM_SLIDE.financials)
  f.eyebrow('05 — FINANCIALS')
  f.rule()
  const payback = rom.payback.paybackYears
  const tiles: TileSpec[] = [
    { value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), label: 'ROM INVESTMENT', accent: true, figSz: 2400 },
    { value: usd(rom.payback.annualLaborOffset), label: 'LABOR OFFSET / YR', figSz: 2400 },
    { value: payback == null ? '—' : payback.toFixed(1), unit: 'yr', label: 'SIMPLE PAYBACK' },
  ]
  f.tiles(tiles, { h: 1500000 })
  f.caption('ROM estimate pending final configuration · cost detail in appendix')
}

/** Appendix — the financial figures relocated off S25/S26: net benefit, OPEX,
 *  TCO at service life, cost per move, energy. */
export function fillCostDetail(
  zip: PizZip, slide: number, model: FleetModel, serviceLifeYears: number,
): void {
  const { rom, flows, settings, costs } = model
  const throughput = Math.round(flows.reduce((s, fl) => s + (fl.thruPerHr || 0), 0))
  const opex = rom.opex.annualOpex
  const tcoAtLife = rom.pricing.totalMid + opex * serviceLifeYears
  const opDays = Math.max(1, costs.operatingDaysPerYear)
  const lifetimeMoves = throughput * settings.dailyOpHr * costs.operatingDaysPerYear * serviceLifeYears
  const costPerMove = lifetimeMoves > 0 ? tcoAtLife / lifetimeMoves : null
  const energyPerDay = rom.opex.annualEnergyKwh / opDays

  const rows: TableCell[][] = [[{ t: 'Metric' }, { t: 'Value', align: 'r' }]]
  const add = (k: string, v: string) => rows.push([{ t: k, bold: true }, { t: v, align: 'r' }])
  add('Net benefit / yr', usd(rom.payback.annualLaborOffset - opex))
  add('Annual operating cost', usd(opex))
  add(`TCO @ ${serviceLifeYears} yr`, usd(tcoAtLife))
  add('Cost per move', costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}`)
  add('Energy', `${Math.round(energyPerDay)} kWh/day`)

  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — COST DETAIL')
  f.table([5000000, 5820400], rows, { rowH: 360000 })
  f.caption('Labor offset is gross of operating cost; ROM pricing is a range pending final configuration')
}
```

Delete `fillKpis`, the gauge math, and the now-unused `chargingSeries`/`resilience`/`pct`/`Vehicle` imports.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/content.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/content.ts src/lib/pptx/__tests__/content.test.ts
git commit -m "feat(pptx): S25 = three-number financials; KPI grid relocates to cost-detail appendix"
```

---

### Task 7: tables.ts — trimmed S18 requirements

**Files:**
- Modify: `src/lib/pptx/tables.ts` (`fillRequirements`)
- Modify: `src/lib/pptx/__tests__/tables.test.ts` (its `fillRequirements` block)

- [ ] **Step 1: Update the `fillRequirements` tests** in `tables.test.ts` — replace assertions about the four headline tiles with:

```ts
  it('S18 = claim title + ≤8-row design-driver table + footnote (no tiles)', () => {
    const zip = load()
    fillRequirements(zip, PROJECT)      // reuse the file's existing PROJECT fixture
    const xml = reopen(zip).file('ppt/slides/slide18.xml')!.asText()
    expect(xml).toContain('01 — APPLICATION')
    expect(xml).toMatch(/Moving 2,500-lb pallets/)            // claim in the title
    expect(xml).not.toContain('KPI Tile')                     // tiles retired here
    for (const l of ['Max load', 'Payload / unit type', 'Transfer method']) expect(xml).toContain(l)
    // ≤ 8 data rows + header
    expect((xml.match(/<a:tr h=/g) ?? []).length).toBeLessThanOrEqual(9)
    expect(xml).toContain('project file holds the full input set')
  })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t 'S18'` → FAIL.

- [ ] **Step 3: Rewrite `fillRequirements`** (imports: add `setTitle` from `./layout`, `requirementsTitle, FALLBACK_TITLE` from `./takeaways`):

```ts
const MAX_REQ_ROWS = 8

/** S18 — the ~8 requirements that drive the design, as one table. The claim is
 *  the title; the full captured input set stays in the app's project file. */
export function fillRequirements(zip: PizZip, project: StoredProject): void {
  setTitle(zip, ROM_SLIDE.requirements, requirementsTitle(project), FALLBACK_TITLE.requirements)
  const rows: TableCell[][] = [[{ t: 'Requirement' }, { t: 'Value' }]]
  const add = (k: string, v?: string | null) => {
    if (v && rows.length <= MAX_REQ_ROWS) rows.push([{ t: k, bold: true }, { t: v }])
  }

  if ((project.maxLoadWeightLbs ?? 0) > 0) add('Max load', `${project.maxLoadWeightLbs!.toLocaleString()} lbs`)
  add('Payload / unit type', project.typicalUnitType?.trim())
  add('Transfer method', project.transferMethod?.trim())

  const pick = project.pickHeightFt, drop = project.dropHeightFt
  if (pick != null || drop != null) add('Lift / transfer', `${ft(pick ?? 0)} → ${ft(drop ?? 0)}`)
  else if ((project.maxLiftHeightFt ?? 0) > 0) add('Lift / transfer', `to ${ft(project.maxLiftHeightFt!)}`)

  const hrPerDay = Math.min(24, (project.shiftsPerDay ?? 0) * (project.hoursPerShift ?? 0))
  if (hrPerDay > 0) add('Schedule', `${hrPerDay} hr/day (${project.shiftsPerDay} × ${project.hoursPerShift})`)

  const env = project.temperatureEnvironment ?? (project.freezerCapable ? 'freezer' : undefined)
  if (env) add('Temperature', TEMP_LABEL[env] ?? env)
  if (project.outdoorRequired != null) add('Operating environment', project.outdoorRequired ? 'Outdoor' : 'Indoor')
  if (project.rampRequired != null || (project.maxRampGrade ?? 0) > 0) {
    const yes = project.rampRequired === true || (project.maxRampGrade ?? 0) > 0
    add('Ramp on site', yes ? ((project.maxRampGrade ?? 0) > 0 ? `Yes — ${project.maxRampGrade}% grade` : 'Yes') : 'No')
  }
  if (rows.length === 1) rows.push([{ t: '—' }, { t: 'No requirements captured yet (Step 1).' }])

  const f = frame(zip, ROM_SLIDE.requirements)
  f.eyebrow('01 — APPLICATION')
  f.rule()
  f.table([3600000, 7220400], rows, { rowH: 360000 })
  f.caption('Captured in discovery · the project file holds the full input set')
}
```

Delete the old tile-building block (maxLoad/lift/footprint/schedule tiles) and, if now unused, the `TileSpec` import.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t 'S18'` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): S18 trims to the eight design-driving requirements"
```

---

### Task 8: tables.ts — S19 fit cards + screening appendix fillers

**Files:**
- Modify: `src/lib/pptx/tables.ts` (replace `fillMatrix` with `fillVehicleCards` + `fillVerdictAppendix` + `fillGateGrid`)
- Modify: `src/lib/pptx/__tests__/tables.test.ts`

- [ ] **Step 1: Replace the `fillMatrix` tests** with:

```ts
import { fillVehicleCards, fillVerdictAppendix, fillGateGrid } from '../tables'
import { cloneSlide } from '../ooxml'

  it('S19 = one card per assigned chassis with verdict + why-line', () => {
    const zip = load()
    fillVehicleCards(zip, PROJECT, vehicles, {})       // PROJECT assigns cb18 + ml2
    const xml = reopen(zip).file('ppt/slides/slide19.xml')!.asText()
    expect(xml).toContain('02 — VEHICLE SELECTION')
    expect(xml).toContain('2 vehicles fit your application')  // claim in the title
    expect(xml).toContain('screening matrix in appendix')
    // names of the two assigned chassis appear; unassigned chassis don't
    const cb18 = vehicles.find(v => v.id === 'cb18')!, m10 = vehicles.find(v => v.id === 'm10')!
    expect(xml).toContain(cb18.name)
    expect(xml).not.toContain(m10.name)
  })

  it('S19 no-ops when no vehicle is assigned', () => {
    const zip = load()
    const before = zip.file('ppt/slides/slide19.xml')!.asText()
    fillVehicleCards(zip, { projectName: 'E' } as unknown as StoredProject, vehicles, {})
    expect(zip.file('ppt/slides/slide19.xml')!.asText()).toBe(before)
  })

  it('screening appendix = verdict table + gate grid on cloned slides', () => {
    const zip = load()
    const verdict = cloneSlide(zip, 18)!, grid = cloneSlide(zip, 18)!
    fillVerdictAppendix(zip, verdict, PROJECT, vehicles)
    fillGateGrid(zip, grid, PROJECT, vehicles)
    const out = reopen(zip)
    const vx = out.file(`ppt/slides/slide${verdict}.xml`)!.asText()
    const gx = out.file(`ppt/slides/slide${grid}.xml`)!.asText()
    expect(vx).toContain('APPENDIX — VEHICLE SCREENING')
    for (const v of vehicles) expect(vx).toContain(v.name)     // all chassis, not just assigned
    expect(gx).toContain('APPENDIX — VEHICLE SCREENING')
    expect(gx).toContain('✓ pass')
  })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t 'S19|screening'` → FAIL.

- [ ] **Step 3: Implement in `tables.ts`.** Imports to add: `setTitle, GRAY` from `./layout`; `vehiclesTitle, FALLBACK_TITLE` from `./takeaways`; `textBox, addImage, containRect, pngSize, nextShapeId, appendShapesToSlide, type TextRun` from `./ooxml` (extend existing imports).

```ts
const CARD_IMG_H = 1500000    // vehicle photo zone per fit card
const CARD_TXT_H = 1900000    // name + verdict + why text zone

/** Distinct chassis the engineer assigned to flows, in first-assignment order. */
function assignedVehicleIds(project: StoredProject): string[] {
  const ids: string[] = []
  for (const fl of project.flows ?? []) {
    if (fl.vehicleId && !ids.includes(fl.vehicleId)) ids.push(fl.vehicleId)
  }
  return ids
}

/** S19 — one fit card per ASSIGNED chassis (photo · name · verdict · why-line).
 *  The tool never picks a vehicle: no assignments → the slide is left untouched
 *  (the exporter drops it). Photos are optional (text-only cards in non-DOM). */
export function fillVehicleCards(
  zip: PizZip, project: StoredProject, vehicles: Vehicle[],
  photos: Record<string, Uint8Array | null>,
): void {
  const assigned = assignedVehicleIds(project)
  if (assigned.length === 0) return
  const vById = new Map(vehicles.map(v => [v.id, v]))
  const app = appRequirementsFromProject(project)
  const flowsTotal = (project.flows ?? []).length

  setTitle(zip, ROM_SLIDE.vehicles, vehiclesTitle(assigned.length), FALLBACK_TITLE.vehicles)
  const f = frame(zip, ROM_SLIDE.vehicles)
  f.eyebrow('02 — VEHICLE SELECTION')
  f.rule()

  const ids = assigned.slice(0, 4)                      // 4 cards max across the body
  const w = Math.round((BODY.cx - (ids.length - 1) * GAP) / ids.length)
  const yTop = f.y
  ids.forEach((id, i) => {
    const v = vById.get(id)
    if (!v) return
    const x = BODY.x + i * (w + GAP)
    const png = photos[id]
    if (png) {
      const { w: nw, h: nh } = pngSize(png)
      addImage(zip, ROM_SLIDE.vehicles, png, containRect(nw, nh, { x, y: yTop, cx: w, cy: CARD_IMG_H }))
    }
    const q = qualifyVehicle(v, app)
    const verdict = q.status === 'GREEN' ? 'QUALIFIED'
      : q.status === 'YELLOW' ? 'QUALIFIED — REVIEW' : 'REVIEW REQUIRED'
    const hardFails = dedupe(q.hardGates.filter(g => !g.skipped && !g.passed).map(g => g.name))
    const softFails = dedupe(q.softPreferences.filter(g => !g.skipped && !g.passed).map(g => g.name))
    const why = q.status === 'GREEN' ? 'Meets every requirement screened'
      : q.status === 'YELLOW' ? `Review on site: ${softFails.join(', ')}`
      : `Screening flags: ${hardFails.join(', ')}`
    const served = (project.flows ?? []).filter(fl => fl.vehicleId === id).length
    const paras: TextRun[][] = [
      [{ t: v.name, bold: true, sz: 1400 }],
      [{ t: verdict, bold: true, sz: 1000, color: STATUS_COLOR[q.status] }],
      [],
      [{ t: why, sz: 1000 }],
      [{ t: `Serves ${served} of ${flowsTotal} flow${flowsTotal === 1 ? '' : 's'}`, sz: 950, color: GRAY }],
    ]
    appendShapesToSlide(zip, ROM_SLIDE.vehicles, textBox({
      id: nextShapeId(zip, ROM_SLIDE.vehicles),
      x, y: yTop + CARD_IMG_H + GAP, cx: w, cy: CARD_TXT_H, paras,
    }))
  })
  f.skip(CARD_IMG_H + GAP + CARD_TXT_H)

  const screenedOut = vehicles.length - assigned.length
  f.caption(`Selected from ${vehicles.length} chassis screened`
    + (screenedOut > 0 ? ` (${screenedOut} not selected)` : '')
    + ' · screening matrix in appendix')
}

/** Appendix — the full per-chassis verdict table (was body S19). */
export function fillVerdictAppendix(
  zip: PizZip, slide: number, project: StoredProject, vehicles: Vehicle[],
): void {
  const results = qualifyAll(project, vehicles)
  const rows: TableCell[][] = [[{ t: 'Vehicle' }, { t: 'Verdict', align: 'ctr' }, { t: 'Notes' }]]
  for (const { vehicle, q } of results) {
    const hardFails = q.hardGates.filter(g => !g.skipped && !g.passed).map(g => g.name)
    const softFails = q.softPreferences.filter(g => !g.skipped && !g.passed).map(g => g.name)
    const notes = q.status === 'RED' ? `Fails: ${dedupe(hardFails).join(', ')}`
      : q.status === 'YELLOW' ? `Review: ${dedupe([...softFails, ...partialLoadNote(q)]).join(', ')}`
      : 'All gates pass'
    rows.push([
      { t: vehicle.name, bold: true },
      { t: q.status, align: 'ctr', fill: STATUS_COLOR[q.status], color: 'FFFFFF', bold: true },
      { t: notes },
    ])
  }
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — VEHICLE SCREENING')
  f.table([3000000, 2000000, 5820400], rows)
  f.caption('Every chassis in the library, screened against the captured requirements')
}

/** Appendix — the gate × vehicle grid (was body S20). */
export function fillGateGrid(
  zip: PizZip, slide: number, project: StoredProject, vehicles: Vehicle[],
): void {
  // …body identical to the old S20 half of fillMatrix (byVeh/activeGates/gridRows
  // construction unchanged), but rendered at `slide` with:
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — VEHICLE SCREENING')
  f.table([3000000, ...byVeh.map(() => vehColW)], gridRows, { center: true, rowH: 340000 })
  f.caption('✓ pass   ·   ~ review   ·   ✗ fail   ·   –  not evaluated')
}
```

Delete `fillMatrix` (the verdict-count tile band is retired — do not port it). Keep `qualifyAll`, `dedupe`, `partialLoadNote`, `glyphCell`, `shortName` as-is.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t 'S19|screening'` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): S19 fit cards for assigned chassis; screening matrix to appendix"
```

---

### Task 9: tables.ts — S21 fleet-sizing waterfall + derivation appendix

**Files:**
- Modify: `src/lib/pptx/tables.ts` (replace `fillFleetEngine`/`renderTier`/`progressionTiles` with `fillFleetSizing` + `buildTierDerivations` + `fillDerivation`)
- Modify: `src/lib/pptx/__tests__/tables.test.ts`

- [ ] **Step 1: Replace the fleet-engine tests** with:

```ts
import { fillFleetSizing, buildTierDerivations, fillDerivation } from '../tables'

  it('S21 = fleet claim + 4-tile waterfall with plain-English descs + mix caption', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillFleetSizing(zip, model, names)
    const xml = reopen(zip).file('ppt/slides/slide21.xml')!.asText()
    expect(xml).toContain('03 — FLEET SIZING')
    expect(xml).toMatch(/Your operation needs a fleet of \d+/)
    for (const l of ['WORKLOAD', '+ CHARGING', '× BUFFER', '= FLEET']) expect(xml).toContain(l)
    expect((xml.match(/name="KPI Tile \d+"/g) ?? []).length).toBe(4)
    expect(xml).toContain('batteries recover')                 // human desc, not formula
    expect(xml).toContain('Fleet mix —')
    expect(xml).toContain('full derivation in appendix')
    expect(xml).not.toContain('What it means')                 // derivation table gone from body
  })

  it('tier derivations render on appendix slides', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    const tiers = buildTierDerivations(model, vehicles, names)
    expect(tiers.map(t => t.name)).toEqual(['RAW FLEET', 'CHARGING', 'BUFFER'])
    const slide = cloneSlide(zip, 18)!
    fillDerivation(zip, slide, tiers[0])
    const xml = reopen(zip).file(`ppt/slides/slide${slide}.xml`)!.asText()
    expect(xml).toContain('APPENDIX — SIZING DERIVATION')
    expect(xml).toContain('What it means')
  })
```

(`names` = the existing fixture map in the test file; add it if that block lacks one: `const names = Object.fromEntries(vehicles.map(v => [v.id, v.name]))`.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t 'S21|derivation'` → FAIL.

- [ ] **Step 3: Implement.** Add `fleetTitle` to the `./takeaways` import and `pct` to the `./layout` import. Replace the whole Fleet-Engine block (`Stage`, `STAGE_META`, `PROG_H`, `progressionTiles`, `renderTier`, `fillFleetEngine`) with:

```ts
const WATERFALL_H = 1600000
// Worked-derivation table: Step · What it means · Calculation · Result.
const DERIV_COL = [2600000, 3400000, 3220400, 1600000]

export interface TierDerivation {
  name: 'RAW FLEET' | 'CHARGING' | 'BUFFER'
  meaning: string
  deriv: Derivation | null
  example: string
}

/** S21 — the whole sizing story on one slide: claim title, the
 *  Workload + Charging × Buffer = Fleet waterfall as explained tiles, and the
 *  fleet mix. The math lives in the sizing-derivation appendix. */
export function fillFleetSizing(zip: PizZip, model: FleetModel, names: Record<string, string>): void {
  const { fleet, flows, settings } = model
  setTitle(zip, ROM_SLIDE.fleetSizing, fleetTitle(model), FALLBACK_TITLE.fleet)
  const f = frame(zip, ROM_SLIDE.fleetSizing)
  f.eyebrow('03 — FLEET SIZING')
  f.rule()
  const thru = Math.round(flows.reduce((s, fl) => s + (fl.thruPerHr || 0), 0))
  const chg = fleet.totalChargingDelta
  f.tiles([
    { value: String(fleet.totalBaseFleet), label: 'WORKLOAD', compact: true,
      desc: `vehicles to carry ${thru} moves/hr across ${flows.length} flow${flows.length === 1 ? '' : 's'}` },
    { value: chg > 0 ? `+${chg}` : '+0', label: '+ CHARGING', compact: true,
      desc: 'keeps the fleet moving while batteries recover' },
    { value: `×${(1 + settings.bufferPct).toFixed(2)}`, label: '× BUFFER', compact: true,
      desc: 'absorbs peaks and maintenance windows' },
    { value: String(fleet.totalFleetSold), label: '= FLEET', accent: true, compact: true,
      desc: 'recommended fleet size' },
  ], { h: WATERFALL_H })
  const mix = fleet.groups.map(g => `${names[g.vehicleId] ?? g.vehicleId} ×${g.fleetSold}`).join('   ·   ')
  f.caption([
    mix ? `Fleet mix — ${mix}` : 'Assign vehicles to flows (Step 3) to size the fleet.',
    'Sized from your throughput, distances, and shift pattern · full derivation in appendix',
  ])
}

/** The three worked tier derivations (representative examples), for the appendix. */
export function buildTierDerivations(
  model: FleetModel, vehicles: Vehicle[], names: Record<string, string>,
): TierDerivation[] {
  const { flows, derivedByFlowId, fleet, settings } = model
  const vById = new Map(vehicles.map(v => [v.id, v]))
  const rawFlow = flows.find(fl => fl.vehicleId && derivedByFlowId.get(fl.id)?.breakdown)
  const rawVeh = rawFlow?.vehicleId ? vById.get(rawFlow.vehicleId) : undefined
  const rawBreak = rawFlow ? derivedByFlowId.get(rawFlow.id)?.breakdown : null
  const rawDeriv = rawFlow && rawVeh && rawBreak
    ? cycleDerivation(rawBreak, {
        distanceFt: rawFlow.distanceFt, thruPerHr: rawFlow.thruPerHr,
        speedLoadedFps: rawVeh.calc.speedLoadedFps,
        speedUnloadedFps: rawVeh.calc.speedUnloadedFps ?? rawVeh.calc.speedLoadedFps,
        liftSpeedFps: rawVeh.calc.liftSpeedFps ?? null,
        rawVehicles: derivedByFlowId.get(rawFlow.id)?.rawVehicles ?? null,
      })
    : null
  const grp = fleet.groups[0]
  const grpVeh = grp ? vById.get(grp.vehicleId) : undefined
  const grpExample = grp ? `Example: ${names[grp.vehicleId] ?? grp.vehicleId}` : ''
  return [
    { name: 'RAW FLEET', deriv: rawDeriv,
      meaning: 'Each flow’s cycle time → vehicles needed (throughput × cycle ÷ 3600), summed per chassis and rounded up = raw base fleet.',
      example: rawFlow ? `Example: ${rawVeh?.name ?? rawFlow.vehicleId} · ${rawFlow.origin || '—'} → ${rawFlow.destination || '—'}` : '' },
    { name: 'CHARGING', deriv: grp && grpVeh ? chargingDerivation(grp, grpVeh, settings) : null,
      meaning: 'Battery runtime vs recharge sets availability; dividing demand by availability adds the vehicles needed to cover charging downtime.',
      example: grpExample },
    { name: 'BUFFER', deriv: grp ? bufferDerivation(grp, settings.bufferPct) : null,
      meaning: '(base + charging) × (1 + buffer), rounded up — spare capacity for maintenance, training, and demand spikes = fleet sold.',
      example: grpExample },
  ]
}

/** One tier's worked derivation on an appendix slide (was a body tier slide). */
export function fillDerivation(zip: PizZip, slide: number, tier: TierDerivation): void {
  const f = frame(zip, slide)
  f.eyebrow('APPENDIX — SIZING DERIVATION')
  f.table(DERIV_COL,
    tier.deriv ? derivationRows(tier.deriv)
      : [[{ t: 'How it’s calculated' }], [{ t: 'Assign vehicles to flows (Step 3) to show the worked calculation.' }]],
    { rowH: 260000 })
  const lines = [tier.meaning + (tier.example ? `   ·   ${tier.example}` : '')]
  const inputs = (tier.deriv?.steps ?? []).filter(s => s.kind === 'input')
  if (inputs.length) lines.push(`Inputs — ${inputs.map(s => `${s.label} ${s.result}`).join('  ·  ')}`)
  f.caption(lines)
}
```

`derivationRows` stays unchanged.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t 'S21|derivation'` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): one fleet-sizing slide; tier math relocates to the appendix"
```

---

### Task 10: tables.ts — S24 trim + title wiring on S27/S28; typecheck gate

**Files:**
- Modify: `src/lib/pptx/tables.ts` (`fillMaterialFlow`, `fillInvestment`, `fillRoi`)
- Modify: `src/lib/pptx/__tests__/tables.test.ts`

- [ ] **Step 1: Update tests** for the three fillers:

```ts
  it('S24 flow table trims to # · Route · Moves/hr · Vehicle', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillMaterialFlow(zip, model, names, null)
    const xml = reopen(zip).file('ppt/slides/slide24.xml')!.asText()
    expect(xml).toContain('04 — MATERIAL FLOW')
    expect(xml).toMatch(/2 flows move 35 loads every hour/)
    for (const l of ['Route', 'Moves/hr', 'Vehicle']) expect(xml).toContain(l)
    for (const l of ['Distance', 'Layout', 'Lift']) expect(xml).not.toContain(`<a:t>${l}</a:t>`)
    expect(xml).toContain('cycle-math appendix')
  })

  it('S27/S28 lead with claims in the title placeholder (takeaway zone gone)', () => {
    const zip = load()
    const model = computeFleetModel(PROJECT, vehicles)
    fillInvestment(zip, model, names)
    fillRoi(zip, model, 10, null)
    const s27 = reopen(zip).file('ppt/slides/slide27.xml')!.asText()
    const s28 = reopen(zip).file('ppt/slides/slide28.xml')!.asText()
    expect(s27).toMatch(/\$.+ for \d+ vehicles/)
    expect(s27).toContain('TOTAL')
    expect(s27).toContain('ROM pricing range pending final configuration')
    expect(s28).toMatch(/back over 10 years|Simple payback in/)
    expect(s28).toContain('Annual operating cost')
    expect(s28).toContain('gross of operating cost')
  })
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/pptx/__tests__/tables.test.ts -t 'S24|S27'` → FAIL.

- [ ] **Step 3: Implement:**

`fillMaterialFlow` — add title + rule, trim columns (import `flowTitle` from `./takeaways`):

```ts
export function fillMaterialFlow(
  zip: PizZip, model: FleetModel, names: Record<string, string>, diagramPng?: Uint8Array | null,
): void {
  const { flows } = model
  setTitle(zip, ROM_SLIDE.materialFlow, flowTitle(model), FALLBACK_TITLE.flow)
  const f = frame(zip, ROM_SLIDE.materialFlow)
  f.eyebrow('04 — MATERIAL FLOW')
  f.rule()
  if (diagramPng) f.image(diagramPng, FLOW_IMG_H)
  const MAX = diagramPng ? 4 : 9

  const rows: TableCell[][] = [[
    { t: '#', align: 'ctr' }, { t: 'Route' }, { t: 'Moves/hr', align: 'r' }, { t: 'Vehicle' },
  ]]
  flows.slice(0, MAX).forEach((flow, i) => rows.push([
    { t: String(i + 1), align: 'ctr' },
    { t: `${flow.origin || '—'} → ${flow.destination || '—'}` },
    { t: String(flow.thruPerHr ?? 0), align: 'r' },
    { t: flow.vehicleId ? (names[flow.vehicleId] ?? flow.vehicleId) : 'Unassigned' },
  ]))
  if (flows.length === 0) rows.push([{ t: '—', align: 'ctr' }, { t: 'No flows defined yet (Step 3).' }, { t: '' }, { t: '' }])
  if (flows.length > MAX) rows.push([{ t: '' }, { t: `+ ${flows.length - MAX} more flow${flows.length - MAX === 1 ? '' : 's'}…` }, { t: '' }, { t: '' }])

  f.table([560000, 5800400, 1580000, 2880000], rows, { rowH: 320000 })
  f.caption('Per-flow distances, layouts, and lift heights are in the cycle-math appendix')
}
```

`fillInvestment` — replace `f.takeaway(investmentTakeaway(model))` with title + rule + footnote:

```ts
  setTitle(zip, ROM_SLIDE.investment, investmentTitle(model), FALLBACK_TITLE.investment)
  const f = frame(zip, ROM_SLIDE.investment)
  f.eyebrow('06 — INVESTMENT')
  f.rule()
  f.table([4200000, 1200000, 2710200, 2710200], rows, { center: true })
  f.caption('ROM pricing range pending final configuration — not a quote')
```

`fillRoi` — same pattern (import `roiTitle` already exists as import; swap sentence for title):

```ts
  setTitle(zip, ROM_SLIDE.roi, roiTitle(model, serviceLifeYears), FALLBACK_TITLE.roi)
  const f = frame(zip, ROM_SLIDE.roi)
  f.eyebrow('06 — RETURN ON INVESTMENT')
  f.rule()
  if (paybackPng) f.image(paybackPng, ROI_IMG_H)
  f.table(/* …3-row metrics table unchanged… */)
  f.caption('Labor offset is gross of operating cost · simple payback, undiscounted')
```

Update the `./takeaways` import in `tables.ts` to the final set: `{ vehiclesTitle, fleetTitle, flowTitle, investmentTitle, roiTitle, requirementsTitle, FALLBACK_TITLE }`. Also update `ROT_SLIDE` → `ROM_SLIDE` key uses across the file (`ROM_SLIDE.vehicles`, `.fleetSizing`, `.financials` — Task 5 renames).

- [ ] **Step 4: Run tests AND the typecheck gate** — after this task nothing references the removed APIs:

```bash
npx vitest run src/lib/pptx && npx tsc --noEmit
```

Expected: pptx tests PASS; `tsc` reports errors ONLY in `src/lib/pptxTemplateExport.ts` (fixed next task). If other files reference `fillKpis`/`fillMatrix`/`fillFleetEngine`/`takeaway(`, fix them now — `grep -rn "fillKpis\|fillMatrix\|fillFleetEngine\|\.takeaway(" src app`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/tables.ts src/lib/pptx/__tests__/tables.test.ts
git commit -m "feat(pptx): trimmed flow table; claims into S27/S28 titles"
```

---

### Task 11: pptxTemplateExport.ts — wiring (photos · appendix chain · S19 drop)

**Files:**
- Modify: `src/lib/pptxTemplateExport.ts`

This is the only DOM/fetch-context file; it has no unit test (browser-only) — the gate is `tsc` + the whole suite + the sample-deck check in Task 12.

- [ ] **Step 1: Update imports:**

```ts
import { fillFinancials, fillCostDetail } from '@/src/lib/pptx/content'
import {
  fillRequirements, fillVehicleCards, fillVerdictAppendix, fillGateGrid,
  fillFleetSizing, buildTierDerivations, fillDerivation,
  fillMaterialFlow, fillInvestment, fillRoi, fillMethodology, fillFlowMath,
} from '@/src/lib/pptx/tables'
```

- [ ] **Step 2: Rework the body of `exportBrandedRomPptx`** (between template load and `zip.generate`):

```ts
  // ── Appendix shells cloned BEFORE removal/fill (S18 must still be clean).
  // Deck order after contact: verdicts · gate grid · derivations · methodology ·
  // cycle math · cost detail.
  const verdictSlide = cloneSlide(zip, ROM_SLIDE.requirements)
  const gridSlide = cloneSlide(zip, ROM_SLIDE.requirements)
  const tiers = buildTierDerivations(model, vehicles, names)
  const tierSlides = tiers.map(t => (t.deriv ? cloneSlide(zip, ROM_SLIDE.requirements) : null))
  const methodSlide = cloneSlide(zip, ROM_SLIDE.requirements)
  const mathFlows = model.flows.filter(f => f.vehicleId && model.derivedByFlowId.get(f.id)?.breakdown)
  const FLOWS_PER_SLIDE = 9
  const mathPages: Array<{ slide: number; flows: typeof mathFlows }> = []
  for (let i = 0; i < mathFlows.length; i += FLOWS_PER_SLIDE) {
    const slide = cloneSlide(zip, ROM_SLIDE.requirements)
    if (slide != null) mathPages.push({ slide, flows: mathFlows.slice(i, i + FLOWS_PER_SLIDE) })
  }
  const costSlide = model.rom.pricing.totalMid > 0 ? cloneSlide(zip, ROM_SLIDE.requirements) : null

  // ── Remove unselected slides. S19 shows only assigned chassis — nothing
  // assigned means the tool would have to pick, and it never picks: drop it.
  const removed = new Set(slidesToRemove(selection))
  const assignedIds = fleetVehicleIds(project)
  if (assignedIds.length === 0) removed.add(ROM_SLIDE.vehicles)
  removeSlides(zip, [...removed])
  replaceInSlides(zip, buildCoverTokens(project))

  // ── Vehicle photos for the fit cards (only when S19 survives; card renders
  // text-only for any photo that fails to load).
  const photos: Record<string, Uint8Array | null> = {}
  if (!removed.has(ROM_SLIDE.vehicles)) {
    await Promise.all(assignedIds.map(async id => {
      const hero = vehicleById.get(id)?.display.heroImage
      try {
        const r = hero ? await fetch(hero) : null
        photos[id] = r?.ok ? new Uint8Array(await r.arrayBuffer()) : null
      } catch { photos[id] = null }
    }))
  }

  // ── Body slides (each filler no-ops on a removed slide).
  fillRequirements(zip, project)                       // S18
  fillVehicleCards(zip, project, vehicles, photos)     // S19
  fillFleetSizing(zip, model, names)                   // S21
  fillFinancials(zip, model)                           // S25
  fillInvestment(zip, model, names)                    // S27
  const flowPng = removed.has(ROM_SLIDE.materialFlow) ? null : renderFlowDiagramPng(model.flows, names)
  fillMaterialFlow(zip, model, names, flowPng)         // S24
  const paybackPng = removed.has(ROM_SLIDE.roi) ? null : renderPaybackChartPng(model.rom)
  fillRoi(zip, model, serviceLifeYears, paybackPng)    // S28

  // ── Appendix.
  if (verdictSlide != null) {
    setSlideTitle(zip, verdictSlide, 'Vehicle screening — verdicts')
    fillVerdictAppendix(zip, verdictSlide, project, vehicles)
  }
  if (gridSlide != null) {
    setSlideTitle(zip, gridSlide, 'Vehicle screening — gate results')
    fillGateGrid(zip, gridSlide, project, vehicles)
  }
  tiers.forEach((tier, i) => {
    const slide = tierSlides[i]
    if (slide == null) return
    setSlideTitle(zip, slide, `Fleet sizing — ${tier.name.toLowerCase()}`)
    fillDerivation(zip, slide, tier)
  })
  if (methodSlide != null) {
    setSlideTitle(zip, methodSlide, 'Methodology — how the fleet is calculated')
    fillMethodology(zip, methodSlide)
  }
  mathPages.forEach((page, i) => {
    const suffix = mathPages.length > 1 ? ` (${i + 1}/${mathPages.length})` : ''
    setSlideTitle(zip, page.slide, `Cycle math — per flow${suffix}`)
    fillFlowMath(zip, page.slide, model, vehicles, names, page.flows)
  })
  if (costSlide != null) {
    setSlideTitle(zip, costSlide, 'Cost model detail')
    fillCostDetail(zip, costSlide, model, serviceLifeYears)
  }
```

Note `removed` is a `Set` now — the two PNG guards use `.has(...)` (they were `Array.includes`).

- [ ] **Step 3: Typecheck + full pptx tests**

```bash
npx tsc --noEmit && npx vitest run src/lib/pptx
```

Expected: clean / all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pptxTemplateExport.ts
git commit -m "feat(pptx): export wiring — fit-card photos, appendix chain, S19 drop when unassigned"
```

---

### Task 12: Verification — full suite, sample deck, pre-push checklist, push

- [ ] **Step 1: Full gates**

```bash
npx tsc --noEmit && npx vitest run && npm run check:arch
```

Expected: all clean/green (256+ tests; some pptx counts changed).

- [ ] **Step 2: Voice sweep** — `grep -rn "caption(\|setTitle(\|setSlideTitle(" src/lib/pptx src/lib/pptxTemplateExport.ts` and read every user-visible string against the spec's voice rules (second person, honest footnotes, no formula phrasing in body strings). Fix any stragglers.

- [ ] **Step 3: Build the sample deck** (visual acceptance). Run the app (`npm run dev` if not running), open the seeded sample project (or create one: Acme Distribution — 2,500-lb pallets, Lift, 2×8h, 2 flows assigned cb18/ml2, operators + burdened rate set), export the branded deck from the ROM dashboard, and confirm: 7 body data slides, claims as titles, no tile grids beyond S25's three + S21's four, appendix in spec order after contact, cards show photos, no console overflow warnings during export. Report results honestly; a human look at the file is the final check.

- [ ] **Step 4: `/simplify` then `/review`** per the project's Pre-Push Checklist (judgment steps the hook can't run).

- [ ] **Step 5: Push**

```bash
git push origin main
```

The pre-push hook re-runs typecheck · check:arch · vitest.

---

## Self-review notes (already applied)

- Spec coverage: S18 (T7) · S19 + screening appendix (T8) · S21 + derivations (T9) · S24/S27/S28 (T10) · S25 + cost detail (T6) · retired slides (T5) · chrome/title/claims (T2–T4) · export wiring + photo + S19-drop (T11) · docs (T1) · voice sweep + acceptance (T12).
- Type consistency: `Frame.rule/skip` (T3) used by all fillers; `TierDerivation` defined T9, consumed T11; `setTitle(zip, slide, claim, fallback)` signature uniform; `removed` becomes a `Set` in T11 and both PNG guards updated.
- Known checkpoint: after T3–T5 land, `tsc` fails on not-yet-migrated fillers until T10/T11 — run scoped vitest per task, full `tsc` at T10 step 4 and T11 step 3.
