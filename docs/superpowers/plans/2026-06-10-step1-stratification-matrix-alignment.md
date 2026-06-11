# Step 1 Stratification + Qualification Matrix Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Step 1 questionnaire into three labeled tiers (Qualification / Sizing / Proposal) with a qualification-readiness meter, and fix the vehicle-JSON ↔ Step 1 ↔ card vocabulary mismatches that silently break the Step 2 matrix.

**Architecture:** Pure reorganization of presentation + constants. The gate engine (`src/calc/gates.ts`, `trafficLight.ts`), Zod schemas, and storage are untouched. One vehicle JSON data token is normalized (ML2 cert). Spec: `docs/superpowers/specs/2026-06-10-step1-questionnaire-stratification-design.md`.

**Tech Stack:** Next.js 16 App Router, React 19, React Hook Form 7, Zod 4, Vitest. Toyota Type fonts only (`var(--tal-font-family)` / `var(--tal-font-numeric)`).

**Working dir:** `/Users/kylemcmillin/Desktop/TAL AV Eng Tool/tal-fleet-calculator`

---

## Audit findings driving Part A (verified 2026-06-10)

1. **Transfer-method vocabulary mismatch — matrix-breaking.** `TRANSFER_METHODS` in `src/lib/constants/enums.ts` is `['Fork', 'Tow / Tugger', 'Conveyor Interface', 'Lift Platform']`. The six vehicle JSONs use `Lift`, `Pin`, `Conveyor`, `Custom`, `Powered Conveyor Cart`. The `transfer_method` gate does case-insensitive **equality** (`gates.ts:215`), so *every* Step 1 transfer selection fails *every* vehicle → all RED. The calc tests never caught it because they use their own fixtures (`'Fork'`), not the real JSONs.
2. **ML2 certification token mismatch.** Form offers `'RIA R15.08'`; `ml2.json` lists `'ANSI/RIA R15.08-1'`. Exact-match soft gate falsely flags ML2 YELLOW with "Not listed: RIA R15.08".
3. **Card shows the wrong payload basis.** `VehicleCard.tsx:106` renders `display.typicalLoad` (one string) while the gate qualifies against the `payloadTypes` array — e.g. CB18 card says "Standard Pallet" but the gate also passes Rack and IBC.

Spec addendum (discovered during planning, approved direction "tied with their natural homes"):
- Section 8 today also holds `facilityLocation`, `bastianRep` (TAL Engineer), and the proposal-date control — these stay with **P3 Dealer & contact**.
- The old "Software Integration" section merges into **P2 Integration** (interlocks + WMS + other AGVs), keeping the total at 12 sections.

---

### Task 1: Docs first (CLAUDE.md rule: spec → changelog → code)

**Files:**
- Modify: `docs/SPECIFICATION.md` (add a Step 1 section — the spec currently has none)
- Modify: `docs/CHANGELOG.md` (new entry at top)
- Modify: `docs/superpowers/specs/2026-06-10-step1-questionnaire-stratification-design.md` (addendum)

- [ ] **Step 1: Add a "Step 1 — Application Questionnaire" section to `docs/SPECIFICATION.md`**, inserted before the "Fleet Engine (Step 3)" section:

```markdown
## Step 1 — Application Questionnaire

Thirteen flat sections became **three labeled tiers** (2026-06-10) so an applications
engineer can see which answers move the Step 2 traffic lights:

1. **VEHICLE QUALIFICATION** — every field the gate engine reads:
   01 *What are you moving?* (weight, unit type, load L×W×H, pallet subtype/custom),
   02 *How is it transferred?* (transfer method, delivery pattern, conditional lift height),
   03 *Environment & site* (temp min/max, outdoor, freezer, ramp grade + ramp distance,
   aisle width — informational only), 04 *Certifications* (soft gate).
2. **FLEET SIZING & ECONOMICS** — 05 schedule, 06 throughput & distance, 07 labor.
3. **PROPOSAL DETAILS** (collapsed by default; consumers arrive in future revisions) —
   08 site details (floor condition, dust/moisture), 09 integration (interlocks, WMS,
   other AGVs), 10 dealer & contact (facility, TAL engineer, proposal date, OEM dealer,
   dealership, rep), 11 timeline (install date), 12 notes.

**Qualification readiness meter** (SectionNav): counts answered gate inputs —
`maxLoadWeightLbs, typicalUnitType, loadLengthIn, loadWidthIn, loadHeightIn,
transferMethod, deliveryPattern, tempMinF, tempMaxF, maxRampGrade, minAisleWidthFt`
(11), plus `maxLiftHeightFt` only while `deliveryPatternRequiresLift(deliveryPattern)`
(12). "Answered" = non-empty string / finite number (0 °F counts; cleared fields don't).
Checkboxes (outdoor/freezer) and certifications are excluded — unchecked is an answer.
The meter is informational; no field is required to advance (architecture rule).

**Canonical vocabularies** (`src/lib/constants/enums.ts` — single source of truth,
asserted against the vehicle JSONs by `src/lib/__tests__/enumAlignment.test.ts`):
- `TRANSFER_METHODS = ['Lift', 'Pin', 'Conveyor', 'Custom', 'Powered Conveyor Cart']`
  — identical to the union of vehicle `transferMethods[].method`.
- Every vehicle `payloadTypes` entry appears in `TYPICAL_UNIT_TYPES` (the form may
  offer extra types — Roll, Coil, Other — for which "no vehicle applies" is the
  correct matrix answer).
- Every vehicle certification token appears in `CERTIFICATIONS`.
```

- [ ] **Step 2: Add the changelog entry** at the top of `docs/CHANGELOG.md`:

```markdown
## 2026-06-10 — Step 1 stratified into 3 tiers + qualification-matrix vocabulary fixes

**Step 1 questionnaire** restructured from 13 flat sections into three labeled tiers —
VEHICLE QUALIFICATION (4 sections: load, transfer, environment & site, certifications),
FLEET SIZING & ECONOMICS (3: schedule, throughput, labor), PROPOSAL DETAILS (5,
collapsed: site details, integration incl. WMS, dealer & contact, timeline, notes).
No field deleted; every schema key, storage path, and PDF slot unchanged. SectionNav
gains tier headers and the progress meter is redefined as **qualification readiness**
("N of 11–12 qualification inputs"; lift height counts only when the delivery pattern
requires it; 0 °F counts as answered). Design doc:
`docs/superpowers/specs/2026-06-10-step1-questionnaire-stratification-design.md`.

**Matrix alignment fixes** (audit: Step 1 ↔ vehicle JSON ↔ Step 2 cards):
- `TRANSFER_METHODS` re-valued from `Fork / Tow-Tugger / Conveyor Interface / Lift
  Platform` (matched **zero** vehicles — any selection turned the whole matrix RED) to
  the actual vehicle vocabulary `Lift / Pin / Conveyor / Custom / Powered Conveyor
  Cart`. **Legacy projects holding an old value must re-select Transfer Method.**
- `ml2.json` cert `ANSI/RIA R15.08-1` → canonical `RIA R15.08` (form token); ML2 no
  longer falsely YELLOW when RIA R15.08 is required.
- `CERTIFICATIONS` list moved from `ApplicationForm.tsx` into `constants/enums.ts`.
- New `enumAlignment.test.ts` asserts the three vocabularies stay aligned with the JSONs.
- Step 2 card "Payload Type" row now shows the gate basis `payloadTypes.join(', ')`
  instead of the single `display.typicalLoad`.
```

- [ ] **Step 3: Append the addendum to the design spec** (`docs/superpowers/specs/2026-06-10-step1-questionnaire-stratification-design.md`):

```markdown
## Addendum (2026-06-10, planning)

- Section 8 also held `facilityLocation`, `bastianRep`, and the proposal-date control;
  they live in **P3 Dealer & contact** (section-10).
- "Software Integration" merges into **P2 Integration** (section-09): interlocks + WMS
  + other AGVs. Total stays 12 sections.
- User-added scope: vocabulary alignment fixes (TRANSFER_METHODS, ML2 cert token, card
  payload row) — see CHANGELOG 2026-06-10. The "no vehicle-JSON changes" rule is
  amended to permit the single ML2 certification-token normalization.
```

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: spec + changelog for Step 1 tiering and matrix vocabulary alignment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Enum ↔ vehicle-JSON alignment test + TRANSFER_METHODS fix

**Files:**
- Test: `src/lib/__tests__/enumAlignment.test.ts` (create)
- Modify: `src/lib/constants/enums.ts`
- Modify: `src/components/step1/ApplicationForm.tsx:30` (delete local `CERTIFICATIONS`, import instead)

- [ ] **Step 1: Write the failing test** — create `src/lib/__tests__/enumAlignment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TRANSFER_METHODS, TYPICAL_UNIT_TYPES, CERTIFICATIONS } from '../constants/enums'
import cb18 from '../../content/vehicles/cb18.json'
import ml2 from '../../content/vehicles/ml2.json'
import m10 from '../../content/vehicles/m10.json'
import ebase7 from '../../content/vehicles/ebase7.json'
import tb50a from '../../content/vehicles/8tb50a.json'
import hbc40a from '../../content/vehicles/8hbc40a.json'

const VEHICLES = [cb18, ml2, m10, ebase7, tb50a, hbc40a]

// The Step 2 gates do exact (case-insensitive) string matching between Step 1
// answers and vehicle JSON values. If these vocabularies drift, the matrix
// silently turns RED for every vehicle — so they are asserted here.
describe('Step 1 enums ↔ vehicle JSON vocabulary', () => {
  it('every vehicle transfer method is offered by the Step 1 dropdown', () => {
    for (const v of VEHICLES) {
      for (const tm of v.transferMethods) {
        expect(TRANSFER_METHODS, `${v.id}: ${tm.method}`).toContain(tm.method)
      }
    }
  })

  it('every Step 1 transfer method is supported by at least one vehicle', () => {
    const offered = new Set(VEHICLES.flatMap(v => v.transferMethods.map(tm => tm.method)))
    for (const m of TRANSFER_METHODS) {
      expect(offered.has(m), `'${m}' matches no vehicle — guaranteed all-RED option`).toBe(true)
    }
  })

  it('every vehicle payload type is offered by the Step 1 dropdown', () => {
    for (const v of VEHICLES) {
      for (const p of v.payloadTypes) {
        expect(TYPICAL_UNIT_TYPES, `${v.id}: ${p}`).toContain(p)
      }
    }
  })

  it('every vehicle certification uses a canonical Step 1 token', () => {
    for (const v of VEHICLES) {
      for (const c of v.specs.certifications) {
        expect(CERTIFICATIONS, `${v.id}: ${c}`).toContain(c)
      }
    }
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/lib/__tests__/enumAlignment.test.ts`
Expected: FAIL — `CERTIFICATIONS` is not exported from enums (TS error), and once exported, `'Lift'` not in TRANSFER_METHODS, `'ANSI/RIA R15.08-1'` not in CERTIFICATIONS.

- [ ] **Step 3: Fix `src/lib/constants/enums.ts`** — replace `TRANSFER_METHODS` and add `CERTIFICATIONS`:

```ts
export const TRANSFER_METHODS = [
  'Lift',
  'Pin',
  'Conveyor',
  'Custom',
  'Powered Conveyor Cart',
] as const

export const CERTIFICATIONS = [
  'ISO 3691-4',
  'ANSI B56.5',
  'RIA R15.08',
  'Cleanroom',
  'Food Grade',
  'ATEX',
  'IECEx',
  'VDA 5050',
] as const
```

(Keep `TYPICAL_UNIT_TYPES` and the two type exports as they are; add `export type Certification = typeof CERTIFICATIONS[number]` only if a consumer needs it — none does today, so don't.)

- [ ] **Step 4: Point `ApplicationForm.tsx` at the shared list** — delete line 30 (`const CERTIFICATIONS = [...]`) and extend the import on line 13:

```ts
import { TRANSFER_METHODS, TYPICAL_UNIT_TYPES, CERTIFICATIONS } from '@/src/lib/constants/enums'
```

- [ ] **Step 5: Run — the cert assertion still fails on ml2 (fixed next task); the three others pass**

Run: `npx vitest run src/lib/__tests__/enumAlignment.test.ts`
Expected: 3 pass, 1 fail (`ml2: ANSI/RIA R15.08-1`).

- [ ] **Step 6: Commit the red-to-mostly-green vocabulary fix**

```bash
git add src/lib/constants/enums.ts src/lib/__tests__/enumAlignment.test.ts src/components/step1/ApplicationForm.tsx
git commit -m "fix: TRANSFER_METHODS now matches vehicle JSON vocabulary; share CERTIFICATIONS via enums

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Normalize ML2 cert token + regenerate snapshot

**Files:**
- Modify: `src/content/vehicles/ml2.json:50`
- Regenerated: `src/calc/__tests__/__snapshots__/trafficLight.snapshot.test.ts.snap`

- [ ] **Step 1: Edit `ml2.json`** — change `"certifications": ["ISO 3691-4", "ANSI/RIA R15.08-1"]` to:

```json
    "certifications": ["ISO 3691-4", "RIA R15.08"]
```

- [ ] **Step 2: Alignment test passes**

Run: `npx vitest run src/lib/__tests__/enumAlignment.test.ts`
Expected: 4 pass.

- [ ] **Step 3: Regenerate the traffic-light snapshot** (it embeds the old token):

Run: `npx vitest run -u src/calc/__tests__/trafficLight.snapshot.test.ts`
Expected: PASS with snapshot updated. Inspect the diff: only `ANSI/RIA R15.08-1` → `RIA R15.08` strings change.

- [ ] **Step 4: Full suite green**

Run: `npx vitest run`
Expected: all tests pass (129+ before this work; now +4).

- [ ] **Step 5: Commit**

```bash
git add src/content/vehicles/ml2.json src/calc/__tests__/__snapshots__/
git commit -m "fix: ml2 cert token normalized to canonical 'RIA R15.08' (was falsely YELLOW)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Card payload row shows the gate basis

**Files:**
- Modify: `src/components/step2/VehicleCard.tsx:104-107`

- [ ] **Step 1: Replace the Payload Type row value** — `display.typicalLoad` → the qualification basis:

```tsx
              <div className="veh-spec-row">
                <span className="spec-k">Payload Type</span>
                <span className="spec-v">{vehicle.payloadTypes.join(', ')}</span>
              </div>
```

- [ ] **Step 2: Verify nothing else consumed `display.typicalLoad`**

Run: `grep -rn "typicalLoad" src/ app/ --include='*.ts*' | grep -v vehicleLibrary | grep -v __tests__`
Expected: no output (the field stays in the JSON/type as display metadata; no orphaned code).

- [ ] **Step 3: Commit**

```bash
git add src/components/step2/VehicleCard.tsx
git commit -m "fix: Step 2 card Payload Type row shows payloadTypes array (the gate basis)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `sections.ts` — tiers + qualification-readiness helpers (TDD)

**Files:**
- Test: `src/lib/__tests__/sections.test.ts` (create)
- Modify: `src/lib/constants/sections.ts` (rewrite the registry + add helpers; keep `sectionStatus`, `totalRequired`, `filledRequired`, `isFilled` semantics)

- [ ] **Step 1: Write the failing test** — create `src/lib/__tests__/sections.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  FORM_SECTIONS,
  qualificationInputsTotal,
  qualificationInputsFilled,
} from '../constants/sections'

describe('FORM_SECTIONS tiers', () => {
  it('renders tiers contiguously in order qualification → sizing → proposal', () => {
    const tiers = FORM_SECTIONS.map(s => s.tier)
    const firstSizing = tiers.indexOf('sizing')
    const firstProposal = tiers.indexOf('proposal')
    expect(tiers.slice(0, firstSizing).every(t => t === 'qualification')).toBe(true)
    expect(tiers.slice(firstSizing, firstProposal).every(t => t === 'sizing')).toBe(true)
    expect(tiers.slice(firstProposal).every(t => t === 'proposal')).toBe(true)
  })

  it('has 12 sections: 4 qualification, 3 sizing, 5 proposal', () => {
    expect(FORM_SECTIONS).toHaveLength(12)
    expect(FORM_SECTIONS.filter(s => s.tier === 'qualification')).toHaveLength(4)
    expect(FORM_SECTIONS.filter(s => s.tier === 'sizing')).toHaveLength(3)
    expect(FORM_SECTIONS.filter(s => s.tier === 'proposal')).toHaveLength(5)
  })
})

describe('qualification readiness meter', () => {
  it('counts 11 inputs when the delivery pattern needs no lift', () => {
    expect(qualificationInputsTotal({ deliveryPattern: 'Floor-Floor' })).toBe(11)
    expect(qualificationInputsTotal({})).toBe(11)
  })

  it('counts 12 inputs when the delivery pattern requires lift', () => {
    expect(qualificationInputsTotal({ deliveryPattern: 'Floor-Height' })).toBe(12)
    expect(qualificationInputsTotal({ deliveryPattern: 'Conveyor-Conveyor' })).toBe(12)
  })

  it('counts answered strings and numbers, including 0 °F', () => {
    expect(qualificationInputsFilled({})).toBe(0)
    expect(qualificationInputsFilled({ maxLoadWeightLbs: 2000 })).toBe(1)
    expect(qualificationInputsFilled({ tempMinF: 0 })).toBe(1)        // 0 °F is a real answer
    expect(qualificationInputsFilled({ typicalUnitType: '  ' })).toBe(0) // blank string is not
    expect(qualificationInputsFilled({ maxLoadWeightLbs: NaN })).toBe(0) // cleared field is not
  })

  it('counts lift height only while the pattern requires it', () => {
    expect(qualificationInputsFilled({ maxLiftHeightFt: 14 })).toBe(0)
    expect(
      qualificationInputsFilled({ deliveryPattern: 'Floor-Height', maxLiftHeightFt: 14 }),
    ).toBe(2) // deliveryPattern + maxLiftHeightFt
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`tier` and the helpers don't exist)

Run: `npx vitest run src/lib/__tests__/sections.test.ts`
Expected: FAIL with missing exports.

- [ ] **Step 3: Rewrite `src/lib/constants/sections.ts`.** Keep the file's existing imports, `SectionStatus`, `isFilled`, `sectionStatus`, `totalRequired`, `filledRequired` exactly as they are. Replace `SectionMeta` and `FORM_SECTIONS`, and append the meter helpers:

```ts
import { deliveryPatternRequiresLift } from '@/src/calc/trafficLight'

export type SectionTier = 'qualification' | 'sizing' | 'proposal'

export const TIER_LABELS: Record<SectionTier, string> = {
  qualification: 'Vehicle Qualification',
  sizing: 'Fleet Sizing & Economics',
  proposal: 'Proposal Details',
}

export interface SectionMeta {
  id: string
  num: string
  label: string
  short: string
  tier: SectionTier
  requiredFields: Array<keyof ProjectFormData>
  collapsible?: boolean
}

export const FORM_SECTIONS: ReadonlyArray<SectionMeta> = [
  // ── Tier 1 — VEHICLE QUALIFICATION ──────────────────────────────────────
  { id: 'section-01', num: '01', label: 'What are you moving?', short: 'Load',
    tier: 'qualification', requiredFields: ['maxLoadWeightLbs', 'typicalUnitType'] },
  { id: 'section-02', num: '02', label: 'How is it transferred?', short: 'Transfer',
    tier: 'qualification', requiredFields: ['transferMethod', 'deliveryPattern'] },
  { id: 'section-03', num: '03', label: 'Environment & site', short: 'Environment',
    tier: 'qualification', requiredFields: ['minAisleWidthFt'] },
  { id: 'section-04', num: '04', label: 'Certifications', short: 'Certs',
    tier: 'qualification', requiredFields: [] },
  // ── Tier 2 — FLEET SIZING & ECONOMICS ───────────────────────────────────
  { id: 'section-05', num: '05', label: 'Operating schedule', short: 'Schedule',
    tier: 'sizing', requiredFields: ['shiftsPerDay', 'hoursPerShift', 'operatingDaysPattern'] },
  { id: 'section-06', num: '06', label: 'Throughput & distance', short: 'Throughput',
    tier: 'sizing', requiredFields: ['requiredThroughputPerHour', 'avgDistanceFt', 'distanceType'] },
  { id: 'section-07', num: '07', label: 'Labor', short: 'Labor',
    tier: 'sizing', requiredFields: [] },
  // ── Tier 3 — PROPOSAL DETAILS (collapsed; consumers arrive in future revisions) ──
  { id: 'section-08', num: '08', label: 'Site details', short: 'Site',
    tier: 'proposal', requiredFields: [], collapsible: true },
  { id: 'section-09', num: '09', label: 'Integration', short: 'Integration',
    tier: 'proposal', requiredFields: [], collapsible: true },
  { id: 'section-10', num: '10', label: 'Dealer & contact', short: 'Dealer',
    tier: 'proposal', requiredFields: [], collapsible: true },
  { id: 'section-11', num: '11', label: 'Timeline', short: 'Timeline',
    tier: 'proposal', requiredFields: [], collapsible: true },
  { id: 'section-12', num: '12', label: 'Project notes', short: 'Notes',
    tier: 'proposal', requiredFields: [], collapsible: true },
] as const

// ── Qualification readiness meter ────────────────────────────────────────────
// Counts the gate-engine inputs (src/calc/gates.ts) that have an answer.
// Excluded by design: outdoorRequired/freezerCapable (unchecked is an answer,
// not a gap) and certifications (optional soft gate). maxLiftHeightFt counts
// only while the delivery pattern implies a lift.

const QUALIFICATION_INPUTS: ReadonlyArray<keyof ProjectFormData> = [
  'maxLoadWeightLbs', 'typicalUnitType',
  'loadLengthIn', 'loadWidthIn', 'loadHeightIn',
  'transferMethod', 'deliveryPattern',
  'tempMinF', 'tempMaxF', 'maxRampGrade', 'minAisleWidthFt',
]

// Unlike isFilled (badge semantics, number > 0), 0 is a real answer here —
// 0 °F is a legitimate freezer temperature.
function isAnswered(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  return false
}

function qualificationInputs(values: Partial<ProjectFormData>): ReadonlyArray<keyof ProjectFormData> {
  return deliveryPatternRequiresLift(values.deliveryPattern)
    ? [...QUALIFICATION_INPUTS, 'maxLiftHeightFt']
    : QUALIFICATION_INPUTS
}

export function qualificationInputsTotal(values: Partial<ProjectFormData>): number {
  return qualificationInputs(values).length
}

export function qualificationInputsFilled(values: Partial<ProjectFormData>): number {
  return qualificationInputs(values).filter(f => isAnswered(values[f])).length
}
```

Note: importing `deliveryPatternRequiresLift` from `@/src/calc/trafficLight` is the sanctioned direction (UI/lib → calc); Step 1's form already does it.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/__tests__/sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants/sections.ts src/lib/__tests__/sections.test.ts
git commit -m "feat: 3-tier FORM_SECTIONS registry + qualification readiness helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(The build is broken between this commit and Task 7 — `ApplicationForm.tsx` still references 13 positional sections. That's fine inside the branch of work; Task 8 gates the push on a green build.)

---

### Task 6: SectionNav — tier headers + readiness meter

**Files:**
- Modify: `src/components/step1/SectionNav.tsx`

- [ ] **Step 1: Update imports and the meter block.** Replace the import line and the `total/filled/pct` block + progress JSX:

```ts
import { FORM_SECTIONS, TIER_LABELS, sectionStatus, qualificationInputsTotal, qualificationInputsFilled, type SectionStatus } from '@/src/lib/constants/sections'
```

```tsx
  const total = qualificationInputsTotal(values)
  const filled = qualificationInputsFilled(values)
  const pct = total === 0 ? 100 : Math.round((filled / total) * 100)

  return (
    <nav className="section-nav" aria-label="Section navigation">
      <div className="section-nav-progress">
        <div className="section-nav-progress-pct">{pct}%</div>
        <div className="section-nav-progress-stat">{filled} of {total} qualification inputs</div>
        <div className="section-nav-progress-bar">
          <div className="section-nav-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="section-nav-list">
        {FORM_SECTIONS.map((s, i) => {
          const status = sectionStatus(s, values)
          const isActive = activeId === s.id
          const tierStart = i === 0 || FORM_SECTIONS[i - 1].tier !== s.tier
          return (
            <li key={s.id}>
              {tierStart && <div className="section-nav-tier">{TIER_LABELS[s.tier]}</div>}
              <button
                type="button"
                className={`section-nav-item${isActive ? ' active' : ''}`}
                onClick={() => handleClick(s.id)}
              >
                <span className={dotClass(status)} aria-hidden />
                <span className="section-nav-num">{s.num}</span>
                <span className="section-nav-label">{s.short}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
```

(The standalone `"Sections"` title div is replaced by the per-tier headers; delete it. `totalRequired`/`filledRequired` imports drop from this file.)

- [ ] **Step 2: Commit** (visual check happens in Task 8 with the form rebuilt)

```bash
git add src/components/step1/SectionNav.tsx
git commit -m "feat: SectionNav tier headers + qualification readiness meter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: ApplicationForm reorder + tier bands + CSS

**Files:**
- Modify: `src/components/step1/ApplicationForm.tsx`
- Modify: `app/globals.css` (tier band + nav tier styles, near the `.section-nav` / `.form-section` blocks ~line 424-588)

This is a mechanical regroup — **every `<input>/<select>/<Controller>` block moves verbatim**; only the `FormSection` wrappers, their grouping, and tier bands change.

- [ ] **Step 1: Add the `secProps` helper and `TierBand` component.** Inside the component (after `const requiresLift = ...`), add:

```tsx
  const secProps = (id: string) => {
    const m = FORM_SECTIONS.find(s => s.id === id)!
    return { sectionNum: m.num, title: m.label, id: m.id, status: sectionStatus(m, formValues) }
  }
```

Above the component (module scope), add:

```tsx
function TierBand({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="form-tier-band">
      <span className="form-tier-label">{label}</span>
      {hint && <span className="form-tier-hint">{hint}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Rebuild the `form-stack` contents in the new order.** Every `<FormSection ...>` opening tag becomes `<FormSection {...secProps('section-NN')} ...>` (drop the now-redundant `sectionNum/title/id/status` props). New layout inside `<div className="form-stack">`:

```
<TierBand label="Vehicle Qualification" />
section-01  ← old §1 body unchanged, PLUS the pallet-subtype + custom-pallet-description
             fld blocks (they're already in §1 — no move needed; they were never leaving, per addendum)
section-02  ← old §2 body unchanged
section-03  ← NEW "Environment & site": aisle-width fld (from old §3) + temp min/max +
             dust?— NO: dust goes to section-08. Compose: aisle width, temp min, temp max
             in a fld-row-3; then outdoor + freezer + ramp grade + ramp distance in a
             fld-grid-4 (ramp pair from old §7, outdoor/freezer from old §11)
section-04  ← old §9 body unchanged (certifications grid)

<TierBand label="Fleet Sizing & Economics" />
section-05  ← old §4 body unchanged
section-06  ← old §5 body unchanged
section-07  ← old §6 body unchanged (operators per shift)

<TierBand label="Proposal Details" hint="Feeds the proposal PDF — future revisions add pricing consumers" />
section-08  ← NEW "Site details": floorCondition (from old §3) + dustMoisture (from old §11), fld-grid-3
section-09  ← old §10 body (interlocks + otherAGVs + vendor) PLUS the WMS pair from old §12 appended in the same fld-grid-4
section-10  ← old §8 body MINUS the desired-install-date fld
section-11  ← NEW "Timeline": the desired-install-date fld from old §8, in a fld-grid-4
section-12  ← old §13 body unchanged (notes)
```

All tier-3 sections get `defaultOpen={false}`; tier-1/2 sections get no `defaultOpen` prop (default true — note old §3/§6/§7 had `defaultOpen={false}`, which is removed now that they're qualification/sizing tier).

Complete JSX for the two recomposed sections (field blocks verbatim from the current file — shown here in full so the engineer doesn't reassemble from memory):

**section-03 — Environment & site** (aisle from old §3 lines 439-463; temps from old §11 lines 940-973; outdoor/freezer from old §11 lines 985-1012; ramps from old §7 lines 688-724):

```tsx
        <FormSection {...secProps('section-03')}>
          <div className="fld-row-3">
            {/* aisle-width fld — verbatim lines 439-463 */}
            {/* temp-min fld — verbatim lines 940-956 */}
            {/* temp-max fld — verbatim lines 957-973 */}
          </div>
          <div className="fld-grid-4" style={{ marginTop: 14 }}>
            {/* outdoor-required fld — verbatim lines 986-998 */}
            {/* freezer-capable fld — verbatim lines 999-1011 */}
            {/* ramp-grade fld — verbatim lines 708-723 */}
            {/* ramp-distance fld — verbatim lines 689-707 */}
          </div>
        </FormSection>
```

**section-08 — Site details**:

```tsx
        <FormSection {...secProps('section-08')} defaultOpen={false}>
          <div className="fld-grid-3">
            {/* floor-condition fld — verbatim lines 465-474 */}
            {/* dust-moisture fld — verbatim lines 974-983 */}
          </div>
        </FormSection>
```

**section-09 — Integration**: old §10 block with the WMS `fld` pair (old §12 lines 1025-1047) appended inside the existing `fld-grid-4`, after the `otherAGVVendor` conditional. **section-10 — Dealer & contact**: old §8 with the desired-install-date `fld` (lines 767-776) cut out. **section-11 — Timeline**:

```tsx
        <FormSection {...secProps('section-11')} defaultOpen={false}>
          <div className="fld-grid-4">
            {/* desired-install-date fld — verbatim lines 767-776 */}
          </div>
        </FormSection>
```

- [ ] **Step 3: Update the page-header description copy** (lines 217-220) to the tier language:

```tsx
          <div className="desc">
            The first tier is what qualifies vehicles — load, transfer, and environment.
            Sizing &amp; economics feed Steps 3–4; proposal details are optional.
          </div>
```

- [ ] **Step 4: Add the CSS** (in `app/globals.css`, after the `.section-nav-label` rule ~line 502 for the nav tier, and after the `.form-section-body` rule ~line 588 for the bands):

```css
.section-nav-tier {
  font-family: var(--tal-font-numeric); font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-tertiary);
  margin: 14px 0 4px; padding: 0 10px;
}
.section-nav-list li:first-child .section-nav-tier { margin-top: 0; }

.form-tier-band { display: flex; align-items: baseline; gap: 10px; margin: 10px 2px -6px; }
.form-tier-label {
  font-family: var(--tal-font-numeric); font-size: 11px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent);
}
.form-tier-hint { font-size: 12px; color: var(--text-tertiary); }
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/step1/ApplicationForm.tsx app/globals.css
git commit -m "feat: Step 1 form restructured into 3 tiers (qualification / sizing / proposal)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Build, visual verification, push

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: tsc strict + next build pass.

- [ ] **Step 2: Architecture audit greps** (ARCHITECTURE.md §6)

Run: `grep -rn "from 'react'\|localStorage\|from 'fs'" src/calc/`
Expected: nothing.
Run: `grep -rn "font-family" app/globals.css | grep -v "tal-font"`
Expected: only the CSS-variable definition lines (pre-existing fallback chains).

- [ ] **Step 3: Visual check in the running dev server** (port 3000/3001; if CSS looks stale, see the zombie-server memory: `pkill -9` and confirm the port is FREE before restarting). Open a project's Step 1 and verify: three tier bands; 12 sections in order; tier-3 collapsed; nav shows tier headers + "N of 11 qualification inputs" flipping to 12 when Delivery Pattern = Floor-Height; Step 2 still renders the matrix and a transfer selection of `Lift` keeps CB18 GREEN-able.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Out of scope (explicit)

- No gate-engine logic changes; no schema changes; no storage changes; no migration for legacy `transferMethod` values (user re-selects; documented in changelog).
- Floor condition / dust-moisture as gates — next revision, per user decision.
- `display.typicalLoad` stays in the vehicle JSONs (display metadata).
