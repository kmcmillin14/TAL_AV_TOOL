# Step 4 Ledger Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five measured defects in the Step 4 investment ledger so the page has one numbering system, one type scale, a visible sense of proportion, and the complexity scoring sitting next to the numbers it multiplies.

**Architecture:** Presentation only. No change to `src/calc/`, `src/lib/romSellPriceLine.ts`, `src/lib/fleetModel.ts` or any pricing resolver — **no quoted figure moves in any task**. Work is confined to `src/components/rom/RomQuotation.tsx`, `src/components/rom/RomPriceDrivers.tsx`, `src/components/rom/RomFleetSellPrice.tsx` and the Step 4 block of `app/globals.css`.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict, plain CSS on existing variable tokens, Vitest. Toyota Type is the only font; TAL red `#EB0A1E` (`--accent`) is the only accent.

---

## Measured starting state (commit `98fb4bb`, light theme, 1280×900)

    page height            989px · 1.10 screens
    section 01 Project investment   647px
    section 02 Price drivers        148px   ← orphan, 23% the size of 01
    status line                      64px   ← first thing on the page, and it is a caveat
    distinct type styles              9     ← in one section body
    numbering systems on screen       2     ← see D1

| section | height | body |
|---|---|---|
| Hardware | 162px | 110px |
| Software | 106px | 55px |
| Professional services | 106px | 55px |
| Adders | 98px | 73px |

## The five defects

**D1 — Two numbering systems collide (introduced by `98fb4bb`).** Measured
positions on one screen:

    01.   x=45  y=246    ScrollSection — "Project investment"
    01    x=39  y=355    spine — Hardware
    02    x=39  y=484    spine — Software
    03    x=39  y=569    spine — Professional services
    04    x=39  y=654    spine — Adders
    02.   x=45  y=764    ScrollSection — "Price drivers"

Two different `01`s, **6px apart horizontally**, interleaved vertically, in the
same numeric face. The spine was meant to say "one document"; instead it
competes with the page's own section numbers and the reader cannot tell which
hierarchy they are in. This is the most serious of the five.

**D2 — Nine type styles in one section body.** `10.5/700 · 11/700 · 11.5/400 ·
12/400 · 12.5/400 · 13/400 · 13.5/400 · 17/700 · 30/800`. Four of those sit
within 1.5px of each other and carry no distinction a reader can perceive. That
is an accumulation, not a scale.

**D3 — No sense of proportion.** Hardware is 88% of this quote and Software is
4.5%, and nothing on the page says so. The reader has to do the arithmetic
against a 30px total that is 300px further up.

**D4 — `02 Price drivers` is an orphan, and it explains numbers it cannot see.**
148px against 647px. It holds the complexity scoring — the point tables behind
`2 of 3` / `3 of 3` — while those chips live in section 01. The explanation and
the figure are separated by the full height of the ledger.

**D5 — The withheld state is too quiet.** A gated category renders `$0` in
`--text-disabled`, which on the light theme is `#a1a1aa` — 2.3:1 on the surface.
"We are refusing to price this" currently reads as "this happens to be zero".

## Not in scope, deliberately

- **The status line leading the page (64px of caveat before any number).** It is
  there because the pricing gate is real and the figure below it is placeholder.
  Moving or shrinking it is an owner call about how loudly the app disclaims its
  own numbers, not a design defect. Raise it; do not fix it unilaterally.
- Any pricing, gating or resolver behaviour.

## File Structure

| file | responsibility after this plan |
|---|---|
| `src/components/rom/RomQuotation.tsx` | The ledger: headline figure, status line, four sections, proportion cue. Owns `Category`. |
| `src/components/rom/RomPriceDrivers.tsx` | Section 02 — per-vehicle tier overrides ONLY, once scoring moves into the sections it explains. |
| `src/components/rom/ComplexityAxis.tsx` | Unchanged. Rendered from `RomQuotation` instead of `RomPriceDrivers`. |
| `src/components/rom/RomFleetSellPrice.tsx` | Unchanged wiring, minus the `baseline` prop that `RomPriceDrivers` no longer needs for scoring. |
| `app/globals.css` | Step 4 block: the `.q-*` rules. One type scale declared as tokens at the top of the block. |

---

### Task 1: Resolve the numbering collision (D1)

The spine keeps its job — one continuous rule tying four sections into one
document — and gives up the numerals that compete with the page's own `01.` /
`02.`. Nodes become dots: filled for a section carrying money, hollow for one
that is elective or withheld, so the node itself still differentiates.

**Files:**
- Modify: `src/components/rom/RomQuotation.tsx` (the `Category` component)
- Modify: `app/globals.css` (`.q-sec-num` → `.q-sec-node`)
- Test: `src/components/rom/__tests__/ledgerNumbering.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/rom/__tests__/ledgerNumbering.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 98fb4bb put a second numbering system on the page: the ledger's spine
 *  numbered its four sections 01–04 in the same numeric face, 6px from the
 *  ScrollSection numbers (01. Project investment / 02. Price drivers) that
 *  number the PAGE. Two different "01"s, interleaved, in one view. The spine
 *  keeps the rule and loses the numerals. */
const SRC = readFileSync(join(process.cwd(), 'src/components/rom/RomQuotation.tsx'), 'utf8')
const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

describe('the ledger has no numbering of its own', () => {
  it('Category takes no num prop', () => {
    expect(SRC).not.toMatch(/num=["']0[1-4]["']/)
    expect(SRC).not.toMatch(/\bnum:\s*string/)
  })

  it('the spine renders nodes, not numerals', () => {
    expect(SRC).toContain('q-sec-node')
    expect(SRC).not.toContain('q-sec-num')
    expect(CSS).toContain('.q-sec-node')
    expect(CSS).not.toContain('.q-sec-num')
  })

  it('the node differentiates committed money from elective/withheld', () => {
    expect(CSS).toMatch(/\.q-sec\.is-elective\s+\.q-sec-node/)
    expect(CSS).toMatch(/\.q-sec\.is-withheld\s+\.q-sec-node/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/rom/__tests__/ledgerNumbering.test.ts`
Expected: FAIL — `q-sec-num` is still present in both files.

- [ ] **Step 3: Drop the numerals from the component**

In `src/components/rom/RomQuotation.tsx`, change the `Category` signature and
its first rendered element:

```tsx
function Category(
  { name, amount, tier, withheld, elective, detail }:
  {
    name: string; amount: number; tier?: number
    withheld?: boolean; elective?: boolean; detail?: ReactNode
  },
) {
  const [open, setOpen] = useState(true)
  const head = (
    <>
      <span className="q-sec-node" aria-hidden="true" />
      <span className="q-sec-name">{name}</span>
```

Then remove the four `num="0N"` props:

```tsx
<Category name="Hardware" amount={fleetTotal.hardwareTotal} detail={
<Category name="Software" amount={fleetTotal.softwareTotal}
<Category name="Professional services" amount={fleetTotal.integrationTotal}
<Category name="Adders" elective amount={fleetTotal.addersTotal} detail={
```

- [ ] **Step 4: Replace the numeral styling with a node**

In `app/globals.css`, replace the `.q-sec-num` rule with:

```css
/* A node ON the spine. It was a numeral (01–04) until 2026-10-09, which put a
   second numbering system 6px from the page's own ScrollSection numbers — two
   different "01"s interleaved in one view. The dot keeps the spine's job
   (four sections, one document) and gives up the competition. Filled = money
   committed; hollow = elective or withheld. */
.q-sec-node {
  position: absolute; left: -31px; top: 4px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--bg-surface);
}
.q-sec.is-elective .q-sec-node,
.q-sec.is-withheld .q-sec-node {
  background: var(--bg-surface);
  box-shadow: 0 0 0 4px var(--bg-surface), inset 0 0 0 1.5px var(--border-strong);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/rom/__tests__/ledgerNumbering.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Verify in the browser that only one numbering system remains**

With the dev server running, on Step 4:

```js
[...document.querySelectorAll('#rom-investment .sec-num, #rom-investment .q-sec-num, #rom-drivers .sec-num')]
  .map(e => e.textContent.trim())
```

Expected: `['01.', '02.']` — the page's own two, and nothing else.

- [ ] **Step 7: Commit**

```bash
git add src/components/rom/RomQuotation.tsx app/globals.css src/components/rom/__tests__/ledgerNumbering.test.ts
git commit -m "design(step4): spine keeps the rule, drops the competing numerals"
```

---

### Task 2: One type scale (D2)

Nine styles become four, declared once as tokens so the next edit cannot
reintroduce a tenth.

**Files:**
- Modify: `app/globals.css` (Step 4 block)
- Test: `src/components/rom/__tests__/ledgerTypeScale.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Nine distinct type styles in one section body, four of them within 1.5px of
 *  each other — an accumulation, not a scale. The Step 4 block now declares
 *  four steps as tokens and every rule in the block uses one of them. */
const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
// Slice the WHOLE Step 4 block. `.q-headline` and `.q-status` sit above the
// ledger comment, so slicing from there would let 7 literal font-sizes survive
// a passing test — caught in self-review, 2026-10-09.
const BLOCK = CSS.slice(
  CSS.indexOf('/* ── Step 4 · ROM Configuration'),
  CSS.indexOf('/* Price drivers (section 02) */'),
)

describe('Step 4 type scale', () => {
  it('declares exactly four steps', () => {
    for (const t of ['--q-type-hero', '--q-type-figure', '--q-type-body', '--q-type-label']) {
      expect(BLOCK, t).toContain(t)
    }
  })

  it('every font-size in the block comes from a token', () => {
    const literals = BLOCK.match(/font-size:\s*(?!var\()[^;]+;/g) ?? []
    expect(literals).toEqual([])
  })

  it('the tokens are declared before the first rule that uses them', () => {
    expect(BLOCK.indexOf('--q-type-hero')).toBeLessThan(BLOCK.indexOf('.q-headline-amount'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/rom/__tests__/ledgerTypeScale.test.ts`
Expected: FAIL — the block has 15 literal `font-size` declarations.

- [ ] **Step 3: Declare the scale and convert the block**

At the top of the Step 4 block in `app/globals.css` — immediately after the
`/* ── Step 4 · ROM Configuration ── */` comment and **before** `.q-headline`,
so the tokens are declared ahead of every rule that uses them — add:

```css
/* FOUR steps. There were nine, four of them within 1.5px of each other, which
   is an accumulation rather than a scale. Declared here so the next edit picks
   a step instead of inventing a tenth size. */
.q-breakdown, .q-headline, .q-status {
  --q-type-hero:   30px;   /* the grand total, once per page */
  --q-type-figure: 17px;   /* a section's money */
  --q-type-body:   13px;   /* item rows, prose */
  --q-type-label:  11px;   /* tracked uppercase names, captions, chips */
}
```

Then replace every literal in the block. There are **15**, and they span
`.q-headline`, `.q-status` and the ledger rules — `.q-headline` and `.q-status`
are part of this block even though they sit above the ledger comment:

| was | becomes |
|---|---|
| `30px` (headline amount) | `var(--q-type-hero)` |
| `17px` (section amount) | `var(--q-type-figure)` |
| `13.5px` / `13px` (item rows, adder labels) | `var(--q-type-body)` |
| `12.5px` / `12px` (notes, chips, covers) | `var(--q-type-label)` |
| `11.5px` / `11px` / `10.5px` (names, tier, qty, captions, status, headline label) | `var(--q-type-label)` |

Weight stays as it is — the scale governs size only, so the uppercase label at
700 and a caption at 400 remain distinguishable at the same step.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/rom/__tests__/ledgerTypeScale.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify the rendered count dropped**

```js
[...new Set([...document.querySelectorAll('#rom-investment .form-section-body *')]
  .filter(e => e.children.length === 0 && e.textContent.trim())
  .map(e => getComputedStyle(e).fontSize))].sort()
```

Expected: four values, not nine.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css src/components/rom/__tests__/ledgerTypeScale.test.ts
git commit -m "design(step4): nine type styles become one four-step scale"
```

---

### Task 3: Make proportion visible (D3)

Hardware is 88% of the quote and nothing says so. A share figure on each
section's header answers it in the place the reader is already looking.

**Files:**
- Modify: `src/components/rom/RomQuotation.tsx`
- Modify: `app/globals.css`
- Test: `src/components/rom/__tests__/ledgerShare.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { shareOfTotal } from '../RomQuotation'

/** Hardware is ~88% of a typical quote and Software ~4.5%, and the page said
 *  neither — the reader had to do the arithmetic against a total 300px away.
 *  Rounded hard on purpose: these are placeholder dollars, so a decimal point
 *  would promise precision the inputs do not have. */
describe('shareOfTotal', () => {
  it('rounds to whole percent', () => {
    expect(shareOfTotal(2102500, 2376500)).toBe('88%')
    expect(shareOfTotal(107500, 2376500)).toBe('5%')
  })

  it('shows a floor rather than 0% for a real but tiny amount', () => {
    expect(shareOfTotal(1000, 2376500)).toBe('<1%')
  })

  it('is blank for nothing, and for an empty quote — never NaN', () => {
    expect(shareOfTotal(0, 2376500)).toBe('')
    expect(shareOfTotal(0, 0)).toBe('')
    expect(shareOfTotal(500, 0)).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/rom/__tests__/ledgerShare.test.ts`
Expected: FAIL — `shareOfTotal` is not exported from `../RomQuotation`.

- [ ] **Step 3: Implement and render it**

In `src/components/rom/RomQuotation.tsx`, above `Category`:

```tsx
/** A section's share of the quote, rounded hard. These are placeholder dollars,
 *  so a decimal would promise precision the inputs do not have. Empty string
 *  for zero or an empty quote — a section carrying nothing should say nothing,
 *  not "0%". */
export function shareOfTotal(amount: number, total: number): string {
  if (!(total > 0) || !(amount > 0)) return ''
  const pct = amount / total * 100
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`
}
```

Add `share` to the `Category` props and render it between the amount and the
chevron:

```tsx
function Category(
  { name, amount, tier, withheld, elective, share, detail }:
  {
    name: string; amount: number; tier?: number
    withheld?: boolean; elective?: boolean; share?: string; detail?: ReactNode
  },
) {
```

```tsx
      <span className="q-sec-amount mono">{fullUsd(withheld ? 0 : amount)}</span>
      <span className="q-sec-share mono">{share}</span>
      {detail && <Icon name="chevron" size={12} />}
```

In the component body, compute the denominator once and pass it per section:

```tsx
  const quoteTotal = blocked ? fleetTotal.hardwareTotal : fleetTotal.sellTotal
```

```tsx
<Category name="Hardware" amount={fleetTotal.hardwareTotal}
  share={shareOfTotal(fleetTotal.hardwareTotal, quoteTotal)} detail={
```

…and the same `share={shareOfTotal(<that section's amount>, quoteTotal)}` on
Software, Professional services and Adders, using `0` for a withheld section so
it renders blank rather than claiming a share of money that is not priced:

```tsx
share={shareOfTotal(gate.softwareReady ? fleetTotal.softwareTotal : 0, quoteTotal)}
share={shareOfTotal(gate.integrationReady ? fleetTotal.integrationTotal : 0, quoteTotal)}
share={shareOfTotal(fleetTotal.addersTotal, quoteTotal)}
```

- [ ] **Step 4: Style it**

```css
/* Share of the quote. A fixed width so the column aligns down the ledger even
   when a section renders blank. */
.q-sec-share {
  width: 38px; text-align: right;
  font-size: var(--q-type-label); font-weight: 600;
  color: var(--text-tertiary); font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/rom/__tests__/ledgerShare.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/rom/RomQuotation.tsx app/globals.css src/components/rom/__tests__/ledgerShare.test.ts
git commit -m "design(step4): each section states its share of the quote"
```

---

### Task 4: Put the scoring next to the numbers it multiplies (D4)

`02 Price drivers` is 148px against 647px and holds the point tables behind the
`2 of 3` / `3 of 3` chips that live in section 01 — the explanation is a full
ledger's height from the figure. Move each axis into the disclosure of the
section it multiplies. Section 02 keeps the per-vehicle overrides, which is a
different job (engineering authority, not scoring) and reads honestly at its
size.

**Files:**
- Modify: `src/components/rom/RomQuotation.tsx`
- Modify: `src/components/rom/RomPriceDrivers.tsx`
- Modify: `src/components/rom/RomFleetSellPrice.tsx`
- Test: `src/components/rom/__tests__/scoringPlacement.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The complexity point tables explain the tier chips rendered in section 01,
 *  but lived in section 02 — a full ledger's height away from the figure they
 *  justify. Each axis now sits inside the disclosure of the section it
 *  multiplies; section 02 keeps the per-vehicle overrides, which are a
 *  different job. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const QUOTE = read('src/components/rom/RomQuotation.tsx')
const DRIVERS = read('src/components/rom/RomPriceDrivers.tsx')

describe('complexity scoring sits with its figure', () => {
  it('the ledger renders both axes', () => {
    expect(QUOTE).toContain('ComplexityAxis')
    expect(QUOTE).toMatch(/axis="software"/)
    expect(QUOTE).toMatch(/axis="integration"/)
  })

  it('section 02 no longer renders scoring', () => {
    expect(DRIVERS).not.toContain('ComplexityAxis')
    expect(DRIVERS).not.toContain('PRICING_ASSUMPTIONS')
  })

  it('section 02 still owns the overrides', () => {
    expect(DRIVERS).toContain('integrationTierOverride')
    expect(DRIVERS).toContain('softwareTierOverride')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/rom/__tests__/scoringPlacement.test.ts`
Expected: FAIL — `RomQuotation.tsx` does not mention `ComplexityAxis`.

- [ ] **Step 3: Render each axis inside its own section**

In `src/components/rom/RomQuotation.tsx`, add the imports:

```tsx
import { PRICING_ASSUMPTIONS } from '@/src/lib/pricingContent'
import ComplexityAxis from './ComplexityAxis'
```

In the component body, resolve the multipliers:

```tsx
  const intMultiplier = PRICING_ASSUMPTIONS.integrationMultipliers[String(baseline.integration.tier) as '1' | '2' | '3']
  const swMultiplier = PRICING_ASSUMPTIONS.softwareMultipliers[String(baseline.software.tier) as '1' | '2' | '3']
```

Give Software a disclosure it did not have, carrying its platforms AND its
scoring:

```tsx
<Category name="Software" amount={fleetTotal.softwareTotal}
  tier={baseline.software.tier} withheld={!gate.softwareReady}
  share={shareOfTotal(gate.softwareReady ? fleetTotal.softwareTotal : 0, quoteTotal)} detail={
    <>
      <p className="q-detail-note">Fleet-management software licensed with the project:</p>
      <ul className="q-chips">
        {softwareIncludes(lines).map(i => <li key={i}>{i}</li>)}
      </ul>
      {gate.softwareReady && (
        <ComplexityAxis axis="software" label="Software" result={baseline.software} multiplier={swMultiplier} />
      )}
    </>
  } />
```

And append the integration axis to the Professional services disclosure, after
the existing `q-chips` list:

```tsx
      {gate.integrationReady && (
        <ComplexityAxis axis="integration" label="Professional services" result={baseline.integration} multiplier={intMultiplier} />
      )}
```

- [ ] **Step 4: Strip scoring from section 02 and retitle it**

In `src/components/rom/RomPriceDrivers.tsx`, delete the `PRICING_ASSUMPTIONS`
and `ComplexityAxis` imports, the two multiplier constants, and the `q-axes`
block together with the `blocked` branch that replaced it. Retitle the section:

```tsx
    <ScrollSection
      id="rom-drivers"
      num="02"
      title="Adjustments"
      sub="Override a vehicle's tier when the score does not reflect the job"
    >
```

The `blocked` prop becomes unused — remove it from `Props`, from the function
signature, and from the call site in `RomFleetSellPrice.tsx`.

- [ ] **Step 5: Run the test and the full suite**

Run: `npx vitest run src/components/rom/__tests__/scoringPlacement.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests), clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/components/rom/ docs/
git commit -m "design(step4): complexity scoring moves beside the figure it multiplies"
```

---

### Task 5: Make the withheld state unmissable (D5)

A gated category renders `$0` in `--text-disabled` — `#a1a1aa` on the light
surface, 2.3:1. "We are refusing to price this" currently reads as "this
happens to be zero".

**Files:**
- Modify: `src/components/rom/RomQuotation.tsx`
- Modify: `app/globals.css`
- Test: `src/components/rom/__tests__/withheldState.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A withheld category rendered $0 in --text-disabled (#a1a1aa, 2.3:1 on the
 *  light surface), so a refusal to price read as an amount that happened to be
 *  zero. It now says the word, and the row carries a visible mark. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const SRC = read('src/components/rom/RomQuotation.tsx')
const CSS = read('app/globals.css')

describe('a withheld section says so', () => {
  it('renders the words, not just a dimmed zero', () => {
    expect(SRC).toContain('Not priced')
    expect(SRC).toContain('q-sec-withheld-tag')
  })

  it('the tag is styled on the bad token, not the disabled one', () => {
    const rule = CSS.slice(CSS.indexOf('.q-sec-withheld-tag'))
    expect(rule.slice(0, 260)).toContain('var(--bad)')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/rom/__tests__/withheldState.test.ts`
Expected: FAIL — neither string is present.

- [ ] **Step 3: Render the words**

In `Category`, replace the amount span with:

```tsx
      {withheld
        ? <span className="q-sec-withheld-tag">Not priced</span>
        : <span className="q-sec-amount mono">{fullUsd(amount)}</span>}
```

- [ ] **Step 4: Style it**

```css
/* A refusal to price, said in words. It was $0 in --text-disabled (2.3:1 on
   the light surface), which read as an amount that happened to be zero. */
.q-sec-withheld-tag {
  font-family: var(--tal-font-family);
  font-size: var(--q-type-label); font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--bad); background: var(--bad-soft);
  border-radius: 5px; padding: 3px 9px; white-space: nowrap;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/rom/__tests__/withheldState.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Verify both gate states in the browser**

Blank a gating input on the sample project, reload, and confirm Software and
Professional services both read **NOT PRICED** rather than `$0`. **Record the
field's prior value in the same JS call that clears it** — a page reload
destroys anything held in a page variable, and that is how the sample project's
`storageTrackingRequired` and `sharedTrafficTypes` were lost on 9 Oct. Restore
it in the same call that finishes the check.

- [ ] **Step 7: Commit**

```bash
git add src/components/rom/RomQuotation.tsx app/globals.css src/components/rom/__tests__/withheldState.test.ts
git commit -m "design(step4): a withheld section says Not priced, not \$0"
```

---

### Task 6: Documentation and gates

**Files:**
- Modify: `docs/SPECIFICATION.md` (Step 4 section)
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Update the specification**

Describe the ledger as it ends up: one numbering system (the page's), a spine of
nodes, a four-step type scale, per-section share, complexity scoring inside the
section it multiplies, section 02 as Adjustments.

- [ ] **Step 2: Write the changelog entry**

Lead with the measured before/after — nine type styles → four, two numbering
systems → one, and the explicit statement that **no quoted figure moves in any
task of this plan**.

- [ ] **Step 3: Run every gate**

```bash
npx tsc --noEmit && npm run check:arch && npx vitest run && npm run build
```

Expected: clean typecheck, architecture pass, all tests green, clean build.

- [ ] **Step 4: Restart the dev server clean and check both themes**

CSS changed, so the served chunk must be rebuilt:

```bash
pkill -9 -f next-server; sleep 2; rm -rf .next; sleep 1; npm run dev
```

Verify the ledger in light AND dark, and in both gate states. Confirm the served
chunk is current before trusting the browser:

```bash
curl -s http://localhost:3000/projects/<id>/step4 | grep -o '/_next/static/[^"]*\.css' | head -1
```

- [ ] **Step 5: Commit, then STOP**

```bash
git add docs/
git commit -m "docs: Step 4 ledger refinement"
```

**Do not push.** The owner approves every push (CLAUDE.md Pre-Push Checklist
step 8), and explicitly said so when commissioning this plan.

---

## Open question for the owner

**The status line leads the page with 64px of caveat.** Before any number, the
reader gets "Placeholder pricing — all dollar values and multipliers are pending
real pricing input…". That is honest and it is there for a reason, but it means
the first thing on an investment summary is a disclaimer about the investment
summary. Options, none of which this plan takes:

1. Leave it. The numbers are placeholders; say so first.
2. Move it below the headline figure, so the total leads and the caveat
   qualifies it.
3. Shrink it to one line with the detail behind a disclosure.

This is a question about how loudly the app disclaims its own numbers, which is
an owner call, not a design defect.
