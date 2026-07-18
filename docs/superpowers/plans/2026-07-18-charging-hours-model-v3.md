# Charging Model v3 (Hours-Based) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the amp-based charging model with the approved hours-based v3 model (cutsheet `runTimeHr` + `chargeTimeMin`, no derates) and the overlap-aware max-of-constraints buffer composition, per `docs/superpowers/specs/2026-07-18-charging-hours-model-v3-design.md`.

**Architecture:** Pure calc change in `src/calc/fleet.ts` + type/constant updates in `src/calc/types.ts`; vehicle JSONs swap invented amp fields for one cutsheet `runTimeHr`; display/export layers (`derivation.ts`, `FleetMath.tsx`, `BufferPipeline.tsx`, `xlsxExport.ts`, PPTX strings, `vehicleDisplay.ts`, `rom.ts`) re-narrate the same numbers. No storage migration (localStorage holds user input only).

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Vitest, pure functions in `src/calc/` (no React/IO — enforced by `npm run check:arch`).

**Project conventions that bind every task:**
- Docs first (SPECIFICATION + CHANGELOG) — Task 1 must land before code tasks; the pre-commit hook blocks `src/calc/` changes without a CHANGELOG entry.
- All commits from repo root `/Users/kylemcmillin/Desktop/TAL AV Eng Tool/tal-fleet-calculator/`.
- Commit format: end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The pre-push hook runs `tsc --noEmit`, `check:arch`, `vitest run` — push only at the final task.

**Worked reference numbers (used throughout the tests):**
A vehicle with `runTimeHr: 8`, `chargeTimeMin: 480` (chargeHr 8):
- Single shift H=8, C=5 → A_energy = (24+8/5)/(8·(1+8/8)) = 25.6/16 = 1.6→1; A_cap = 1 (8≥8) → A=1
- Two shifts H=16, C=5 → A_energy = 25.6/32 = 0.8; A_cap = 8/(8+8) = 0.5 → A=0.5
- 24/7 H=24, C=∞ → A_energy = 24/48 = 0.5; A_cap = 0.5 → A=0.5

---

### Task 1: Docs first — SPECIFICATION.md + CHANGELOG.md

**Files:**
- Modify: `docs/SPECIFICATION.md` (Fleet Engine §Waterfall, §Section 02, §Section 03, Pipeline overview, Constants, XLSX formula line)
- Modify: `docs/CHANGELOG.md` (new entry at top)

- [ ] **Step 1: Rewrite the waterfall line** (currently the line beginning `` `baseFleet → + chargingDelta` `` around line 219). Replace it with:

```markdown
**Waterfall (per vehicle group `g`, one per `vehicleId`):**
`baseFleet → + chargingDelta` (reported stages) · `fleetSold = max(baseFleet, ⌈max(groupRaw ÷ A_energy, groupRaw × (1 + bufferPct) ÷ A_cap)⌉)` — the fleet pays the LARGER of the two constraints, rounded up exactly ONCE (2026-07-18 v3; energy scales with average work so the buffer does not multiply it; rotation is instantaneous so it does). The binding constraint (Energy / Rotation / Utilization) is surfaced next to the total. Project **TOTAL** = `Σ fleetSold`.
```

- [ ] **Step 2: Replace the whole `### Section 02 — Charging (Ah/A battery model)` section** (heading through the sentence ending `See docs/superpowers/specs/2026-06-25-charging-model-v2-design.md.`) with:

```markdown
### Section 02 — Charging (hours-based model, v3)
Pure calc in `src/calc/fleet.ts`. Battery facts are the two cutsheet hours per vehicle —
`calc.runTimeHr` (hours of operation per full charge) and `calc.chargeTimeMin` — taken at
face value: no DOD or charge-efficiency derates (a measured runtime and charge time already
contain them). One uniform assumption for all vehicles: *a vehicle charges whenever it is
not working* (charge method is display-only).

Charging availability per vehicle type is `A = min(A_energy, A_cap)`:
`A_cap = runHrEff/(runHrEff + chargeHr)` (or 1 when the battery covers the production
window `H = shifts×hours − breaks`; `runHrEff` credits breaks as top-up time) — the
run:charge **rotation ratio**; `A_energy = min(1, (24 + chargeHr/C) / (H·(1 + chargeHr/runTimeHr)))`
credits the nightly off-shift (the 24-vs-H gap) and the day-off reset (`chargeHr/C` — one
free full battery amortized over `C` consecutive operating days; ∞ for 24/7 drops it to 0).
Then `fleetWithCharging = ⌈groupRaw/A⌉` (reported stage). Like vehicles pool (per type).
A day off recharges to 100% (a reset, not banking), so the binding case is surviving the
consecutive operating days. See `docs/superpowers/specs/2026-07-18-charging-hours-model-v3-design.md`.
```

- [ ] **Step 3: In `### Section 03 — Target Utilization`,** replace the sentence `The calc is unchanged: `fleetSold = ⌈(groupRaw ÷ availability) × (1 + bufferPct)⌉`.` with:

```markdown
The calc composes overlap-aware (2026-07-18 v3): `fleetSold = max(baseFleet,
⌈max(groupRaw ÷ A_energy, groupRaw × (1 + bufferPct) ÷ A_cap)⌉)` — utilization headroom
and energy recovery overlap (idle robots charge), so the buffer multiplies only the
instantaneous rotation constraint. The section names the **binding constraint**
(Energy / Rotation / Utilization) next to the total.
```

- [ ] **Step 4: Replace the `### Pipeline overview` code block + following sentence** (the ```` ``` ````-fenced Step 3/4/5 block and the "Each stage models a distinct cause…" line) with:

```markdown
```
Step 3:  per-flow cycle → per-flow rawVehicles → per-group baseFleet (ceil of sum)
Step 4:  baseFleet → chargingDelta (additive, from cutsheet battery hours)
Step 5:  fleetSold = max(base, ⌈max(raw ÷ A_energy, raw × (1+buffer) ÷ A_cap)⌉)
```

Each stage models a distinct cause: Step 3 is engineering, Step 4 is physics, Step 5 is policy. There is no productivity factor η and no congestion multiplier, and the buffer never multiplies the energy constraint — each cause is paid exactly once.
```

- [ ] **Step 5: Fix the stale constants line** `- `DEFAULT_BUFFER_PCT = 0.10` — used in Step 5, …` to:

```markdown
- `DEFAULT_BUFFER_PCT = 0.25` (= 80% target utilization) — used in Step 5, declared in `src/calc/types.ts` for cross-step visibility.
```

- [ ] **Step 6: Update the XLSX formula description** (the line near line 522 containing `Fleet sold = MAX(base, ROUNDUP((raw/avail)·(1+buffer)))`) to:

```markdown
  `Fleet sold = MAX(base, ROUNDUP(MAX(raw/availEnergy, raw·(1+buffer)/availRotation)))` with both availability cells editable
```

- [ ] **Step 7: Add the CHANGELOG entry** at the top of `docs/CHANGELOG.md` (match the existing entry format/date style used in the file):

```markdown
## 2026-07-18 — Charging model v3: hours-based availability + overlap-aware buffer

- `src/calc/fleet.ts` re-parameterized on cutsheet hours (`calc.runTimeHr` + `calc.chargeTimeMin`);
  the amp fields (`dischargeA`, `chargeA`) and the `DEFAULT_DOD`/`CHARGE_EFFICIENCY` derates are
  removed from the charging calc (measured hours already contain them — taper was double-counted).
- Buffer composition is now max-of-constraints: `fleetSold = max(base, ⌈max(raw/A_energy,
  raw·(1+buffer)/A_cap)⌉)` — the buffer no longer multiplies the energy constraint (buffer
  vehicles don't add work). `FleetGroup.binding` names the binding constraint; Step 3 §03,
  Fleet Math, PPTX, and XLSX narrate it.
- Vehicle JSONs: added `calc.runTimeHr` (CB18 8.0 · 8TB50A 8.0 · 8HBC40A 6.0 · E7 6.0 ·
  ML2 10.0 · M10 11.8); deleted invented `dischargeA`/`chargeA`. ROM energy now derives kW
  from usable battery energy ÷ runtime. Spec: `docs/superpowers/specs/2026-07-18-charging-hours-model-v3-design.md`.
```

- [ ] **Step 8: Commit**

```bash
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: spec + changelog for charging model v3 (docs-first)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: types.ts — binding tag, delete CHARGE_EFFICIENCY, repurpose DEFAULT_DOD

**Files:**
- Modify: `src/calc/types.ts`

- [ ] **Step 1: Add the binding type and field.** Above `export interface FleetGroup`, add:

```ts
/** Which constraint set `fleetSold` (v3 max-of-constraints composition). */
export type FleetBinding = 'energy' | 'rotation' | 'utilization'
```

Replace the `FleetGroup` interface with:

```ts
export interface FleetGroup {
  vehicleId: string
  groupRaw: number
  baseFleet: number
  charging: ChargingResult
  fleetWithCharging: number   // baseFleet + chargingDelta (reported stage)
  fleetSold: number           // max(baseFleet, ⌈max(raw/A_energy, raw·(1+buffer)/A_cap)⌉)
  binding: FleetBinding       // which constraint bound fleetSold
}
```

- [ ] **Step 2: Delete the `CHARGE_EFFICIENCY` constant** (the whole JSDoc + `export const CHARGE_EFFICIENCY = 0.85` at the bottom of the file).

- [ ] **Step 3: Repurpose the `DEFAULT_DOD` comment** (the constant stays — ROM energy + SoC chart still use it):

```ts
/** Usable depth-of-discharge fraction — display/ROM only (SoC chart floor, energy
 *  OPEX kW, battery-energy figures). The v3 charging calc uses cutsheet hours
 *  (`runTimeHr`/`chargeTimeMin`) directly and needs no DOD. */
export const DEFAULT_DOD = 0.80
```

- [ ] **Step 4: Typecheck (expected to FAIL — fleet.ts doesn't set `binding` yet):**

Run: `npx tsc --noEmit`
Expected: errors in `src/calc/fleet.ts` (missing `binding`) and `src/calc/fleet.ts` importing `CHARGE_EFFICIENCY`. That's the red state Task 3 fixes. Do NOT commit yet — Tasks 2–3 commit together (calc stays compilable per commit).

---

### Task 3: fleet.ts — rewrite chargingForGroup + fleetSummary (TDD)

**Files:**
- Test: `src/calc/__tests__/fleet.test.ts` (full rewrite)
- Modify: `src/calc/fleet.ts` (full rewrite)

- [ ] **Step 1: Replace `src/calc/__tests__/fleet.test.ts` entirely with:**

```ts
import { describe, it, expect } from 'vitest'
import { chargingForGroup, defaultChargeMethod, defaultChargeRegime, fleetSummary } from '../fleet'
import type { GroupSummary, FleetSettings } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

describe('defaultChargeMethod', () => {
  it('maps opportunity → opportunity, everything else → plugged', () => {
    expect(defaultChargeMethod('opportunity')).toBe('opportunity')
    expect(defaultChargeMethod('shift_swap')).toBe('plugged')
    expect(defaultChargeMethod('manual')).toBe('plugged')
    expect(defaultChargeMethod(undefined)).toBe('plugged')
  })
})

describe('chargingForGroup (v3 hours-based availability)', () => {
  // runTimeHr 8, chargeTimeMin 480 → chargeHr 8 (run:charge 1:1 for easy math).
  const base = {
    groupRaw: 4, baseFleet: 4,
    runTimeHr: 8, chargeTimeMin: 480 as number | undefined,
    method: 'plugged' as const, breakHrs: 0,
  }

  it('1 shift Mon–Fri, battery lasts the shift → A=1, no extra vehicles', () => {
    const r = chargingForGroup({ ...base, hProd: 8, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBe(1)               // (24 + 8/5)/(8·2) = 1.6 → capped 1
    expect(r.aCap).toBe(1)                  // runHr 8 ≥ 8
    expect(r.availability).toBe(1)
    expect(r.chargingDelta).toBe(0)
  })

  it('2 shifts Mon–Fri, small battery → rotation binds', () => {
    const r = chargingForGroup({ ...base, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBeCloseTo(0.8, 6)      // (24 + 1.6)/(16·2)
    expect(r.aCap).toBeCloseTo(0.5, 6)         // 8/(8+8)
    expect(r.availability).toBeCloseTo(0.5, 6)
    expect(r.chargingDelta).toBe(4)            // ⌈4/0.5⌉ − 4
  })

  it('24/7 (no rest day) → no off-shift or weekend credit → run:charge ratio', () => {
    const r = chargingForGroup({ ...base, hProd: 24, consecutiveOpDays: Infinity })
    expect(r.aEnergy).toBeCloseTo(0.5, 6)      // 24/(24·2)
    expect(r.availability).toBeCloseTo(0.5, 6)
  })

  it('weekend reset lowers fleet vs running 7 days (big battery, slow charger, A_cap=1)', () => {
    // runTimeHr 18 covers the 16 h window; chargeHr 24 makes energy bind.
    const friday = chargingForGroup({ ...base, runTimeHr: 18, chargeTimeMin: 1440, hProd: 16, consecutiveOpDays: 5 })
    const everyday = chargingForGroup({ ...base, runTimeHr: 18, chargeTimeMin: 1440, hProd: 16, consecutiveOpDays: Infinity })
    expect(friday.aCap).toBe(1)                            // 18 ≥ 16
    expect(friday.availability).toBeCloseTo(0.7714, 4)     // (24 + 24/5)/(16·(1+24/18))
    expect(everyday.availability).toBeCloseTo(0.6429, 4)   // 24/(16·(1+24/18))
    expect(friday.availability!).toBeGreaterThan(everyday.availability!)
  })

  it('faster charger raises availability', () => {
    const r = chargingForGroup({ ...base, chargeTimeMin: 120, hProd: 16, consecutiveOpDays: 5 })
    expect(r.chargeHr).toBeCloseTo(2, 6)
    expect(r.aCap).toBeCloseTo(0.8, 6)         // 8/(8+2)
    expect(r.availability).toBeCloseTo(0.8, 6)
  })

  it('credits breaks as top-up time (raises runHrEff to cover the window)', () => {
    // runHrEff = 8 + 1·(8/2) = 12 ≥ 7 → A_cap = 1.
    const r = chargingForGroup({ ...base, chargeTimeMin: 120, hProd: 7, breakHrs: 1, consecutiveOpDays: 5 })
    expect(r.aCap).toBe(1)
    expect(r.availability).toBe(1)
  })

  it('missing / invalid data → not sustainable, no NaN, delta 0', () => {
    expect(chargingForGroup({ ...base, runTimeHr: 0, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, chargeTimeMin: undefined, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, chargeTimeMin: 0, hProd: 8, consecutiveOpDays: 5 }).chargingDelta).toBe(0)
    expect(chargingForGroup({ ...base, hProd: 0, consecutiveOpDays: 5 }).sustainable).toBe(false)
  })
})

describe('fleetSummary (v3 max-of-constraints composition)', () => {
  const grp = (vehicleId: string, groupRaw: number, baseFleet: number): GroupSummary => ({
    vehicleId, flowsCount: 1, baseThru: 0, avgCycleSec: null, groupRaw, baseFleet, headroom: null,
  })
  const veh = (id: string, runTimeHr: number, chargeTimeMin: number, chargerType = 'opportunity'): Vehicle =>
    ({ id, calc: { runTimeHr, chargeTimeMin, chargerType } } as unknown as Vehicle)

  const settings = (over: Partial<FleetSettings> = {}): FleetSettings => ({
    regime: 'continuous', bufferPct: 0.25, dailyOpHr: 24, breakHrs: 0,
    consecutiveOpDays: Infinity, chargeMethods: {}, ...over,
  })

  it('rotation binds on 24/7: buffer stacks on the rotation constraint', () => {
    const byId = new Map([['a', veh('a', 8, 480)]])
    const s = fleetSummary([grp('a', 4, 4)], byId, settings({ bufferPct: 0.10 }))
    const g = s.groups[0]
    expect(g.charging.availability).toBeCloseTo(0.5, 6)
    expect(g.charging.chargingDelta).toBe(4)   // ⌈4/0.5⌉ − 4 (reported stage)
    expect(g.fleetWithCharging).toBe(8)
    expect(g.fleetSold).toBe(9)                // max(8/0.5=8, 4·1.10/0.5=8.8) → ⌈8.8⌉
    expect(g.binding).toBe('rotation')
    expect(s.totalChargingDelta).toBe(4)
    expect(s.totalFleetSold).toBe(9)
  })

  it('energy binds: buffer does NOT multiply the energy constraint (the overlap fix)', () => {
    // runTimeHr 18 covers H=16 → A_cap=1; chargeHr 24, C=∞ → A_energy=0.6429.
    const byId = new Map([['a', veh('a', 18, 1440)]])
    const s = fleetSummary([grp('a', 8, 8)], byId, settings({ dailyOpHr: 16 }))
    const g = s.groups[0]
    expect(g.charging.aCap).toBe(1)
    expect(g.charging.aEnergy).toBeCloseTo(0.6429, 4)
    // max(8/0.6429 = 12.44, 8·1.25/1 = 10) → ⌈12.44⌉ = 13. Old product formula sold 16.
    expect(g.fleetSold).toBe(13)
    expect(g.binding).toBe('energy')
  })

  it('utilization binds when charging is free (single shift, fast charger)', () => {
    const byId = new Map([['a', veh('a', 8, 120)]])
    const s = fleetSummary([grp('a', 8, 8)], byId, settings({ dailyOpHr: 8, consecutiveOpDays: 5 }))
    const g = s.groups[0]
    expect(g.charging.availability).toBe(1)
    expect(g.charging.chargingDelta).toBe(0)
    expect(g.fleetSold).toBe(10)               // max(8, 8·1.25) = 10
    expect(g.binding).toBe('utilization')
  })

  it('rounds ONCE at the end and baseFleet stays the physical floor', () => {
    const byId = new Map([['a', veh('a', 8, 120)]])
    const groups = [grp('a', 4.05, 5)]
    const s = fleetSummary(groups, byId, settings({ bufferPct: 0.15, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s.groups[0].fleetSold).toBe(5)      // ⌈4.05 × 1.15⌉ = ⌈4.66⌉ = 5
    const s0 = fleetSummary(groups, byId, settings({ bufferPct: 0, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s0.groups[0].fleetSold).toBe(5)     // max(baseFleet 5, ⌈4.05⌉)
  })

  it('vehicle not found → unsustainable → utilization-only sizing', () => {
    const s = fleetSummary([grp('a', 4, 4)], new Map(), settings())
    const g = s.groups[0]
    expect(g.charging.sustainable).toBe(false)
    expect(g.fleetSold).toBe(5)                // max(4, ⌈4 × 1.25⌉)
    expect(g.binding).toBe('utilization')
  })

  it('skips groups with no base fleet', () => {
    const s = fleetSummary([grp('a', 0, 0)], new Map(), settings())
    expect(s.groups).toHaveLength(0)
    expect(s.totalFleetSold).toBe(0)
  })
})

describe('defaultChargeRegime', () => {
  it('derives continuous for full-day coverage, overnight otherwise', () => {
    expect(defaultChargeRegime(24)).toBe('continuous')
    expect(defaultChargeRegime(16)).toBe('overnight')
    expect(defaultChargeRegime(8)).toBe('overnight')
  })
})
```

- [ ] **Step 2: Run to verify it fails:**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts`
Expected: FAIL — `runTimeHr` not in `ChargingInput`, `binding` missing, numeric mismatches.

- [ ] **Step 3: Replace `src/calc/fleet.ts` entirely with:**

```ts
// Fleet Engine — charging availability + buffer composition → fleet sold. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only imports of Vehicle, as
// in flowMetrics.ts, carry no runtime dependency.)

import type {
  ChargeMethod,
  ChargeRegime,
  ChargingResult,
  FleetBinding,
  FleetGroup,
  FleetSettings,
  FleetSummary,
  GroupSummary,
} from './types'
import type { ChargerType, Vehicle } from '@/src/lib/vehicleLibrary'

/** Map a vehicle's spec'd charger type to the two-value engine model.
 *  Display-only: the v3 math treats every vehicle identically ("charges
 *  whenever it is not working"). */
export function defaultChargeMethod(chargerType?: ChargerType): ChargeMethod {
  return chargerType === 'opportunity' ? 'opportunity' : 'plugged'
}

/** Default charge regime when the project never chose one: a schedule covering
 *  the full day has no overnight charge window, so 24 h/day → 'continuous'.
 *  A derived DEFAULT, never a lock — an explicit project chargeRegime wins. */
export function defaultChargeRegime(dailyOpHr: number): ChargeRegime {
  return dailyOpHr >= 24 ? 'continuous' : 'overnight'
}

export interface ChargingInput {
  groupRaw: number
  baseFleet: number
  runTimeHr: number           // hours of operation per full charge (cutsheet)
  chargeTimeMin?: number      // minutes to a full recharge (cutsheet)
  method: ChargeMethod        // display only (carried onto ChargingResult)
  hProd: number               // productive hrs/day = min(24, shifts×hours) − breakHrs
  breakHrs: number            // total break hours/day
  consecutiveOpDays: number   // C — Infinity when all 7 days operate
}

/**
 * Charging availability for one vehicle type, in cutsheet hours (see the
 * 2026-07-18 charging-model-v3 spec — the v2 amp form cancels to this):
 *
 *   chargeHr  = chargeTimeMin/60
 *   runHrEff  = runTimeHr + breaks·(runTimeHr/chargeHr)          breaks credit
 *   A_cap     = runHrEff ≥ H ? 1 : runHrEff/(runHrEff+chargeHr)  rotation ratio
 *   A_energy  = min(1, (24 + chargeHr/C) / (H·(1 + chargeHr/runTimeHr)))
 *               — off-shift (24 vs H) + day-off reset (chargeHr/C) credits
 *
 * No DOD or charge-efficiency derates: measured cutsheet hours already contain
 * them. A vehicle charges whenever it is not working (uniform for opportunity
 * and plugged — method is display-only).
 */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason,
  })
  if (!(i.runTimeHr > 0)) return invalid('Missing battery runtime data')
  const chargeHr = i.chargeTimeMin != null && i.chargeTimeMin > 0 ? i.chargeTimeMin / 60 : 0
  if (!(chargeHr > 0)) return invalid('Missing charge time data')
  const H = i.hProd
  if (!(H > 0)) return invalid('No production hours')

  const runHr = i.runTimeHr
  const runHrEff = runHr + Math.max(0, i.breakHrs) * (runHr / chargeHr)
  const weekendTerm = Number.isFinite(i.consecutiveOpDays) && i.consecutiveOpDays > 0
    ? chargeHr / i.consecutiveOpDays
    : 0
  const aEnergy = Math.min(1, (24 + weekendTerm) / (H * (1 + chargeHr / runHr)))
  const aCap = runHrEff >= H ? 1 : runHrEff / (runHrEff + chargeHr)

  const A = Math.min(aEnergy, aCap)
  if (!(A > 0)) return invalid('Cannot determine availability')

  const fleetWithCharging = Math.ceil(i.groupRaw / A)
  const chargingDelta = Math.max(0, fleetWithCharging - i.baseFleet)
  const pct = `${Math.round(A * 100)}%`
  return {
    method: i.method, runHr, chargeHr, availability: A, aEnergy, aCap, chargingDelta, sustainable: true,
    reason: chargingDelta > 0
      ? `+${chargingDelta} for charging (availability ${pct})`
      : `Charging fits within the fleet (availability ${pct})`,
  }
}

/**
 * Compose the waterfall per vehicle group. Base and charging remain the
 * reported stages; the SOLD count pays the LARGER of the two constraints,
 * with one ceil at the end (2026-07-18 v3 — energy scales with average work,
 * so the buffer must not multiply it; rotation is instantaneous, so it must):
 *
 *   fleetSold = max(baseFleet, ⌈max(groupRaw/A_energy, groupRaw·(1+buffer)/A_cap)⌉)
 *
 * Groups with no base fleet are skipped. `dailyOpHr` is provided by the caller
 * (Step 1 schedule) so this stays pure.
 */
export function fleetSummary(
  groups: GroupSummary[],
  vehiclesById: Map<string, Vehicle>,
  settings: FleetSettings,
): FleetSummary {
  const out: FleetGroup[] = []
  for (const g of groups) {
    if (g.baseFleet <= 0) continue
    const veh = vehiclesById.get(g.vehicleId)
    const method = settings.chargeMethods[g.vehicleId] ?? defaultChargeMethod(veh?.calc.chargerType)
    const charging: ChargingResult = veh
      ? chargingForGroup({
          groupRaw: g.groupRaw,
          baseFleet: g.baseFleet,
          runTimeHr: veh.calc.runTimeHr,
          chargeTimeMin: veh.calc.chargeTimeMin,
          method,
          hProd: Math.max(0, settings.dailyOpHr - settings.breakHrs),
          breakHrs: settings.breakHrs,
          consecutiveOpDays: settings.consecutiveOpDays,
        })
      : { method, runHr: null, chargeHr: null, availability: null, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason: 'Vehicle not found' }

    const fleetWithCharging = g.baseFleet + charging.chargingDelta
    let fleetSold: number
    let binding: FleetBinding
    if (charging.aEnergy != null && charging.aCap != null) {
      const demandEnergy = g.groupRaw / charging.aEnergy
      const demandRotation = (g.groupRaw * (1 + settings.bufferPct)) / charging.aCap
      fleetSold = Math.max(g.baseFleet, Math.ceil(Math.max(demandEnergy, demandRotation)))
      binding = demandRotation >= demandEnergy
        ? (charging.aCap < 1 ? 'rotation' : 'utilization')
        : 'energy'
    } else {
      // No battery data — utilization headroom is the only sizing constraint.
      fleetSold = Math.max(g.baseFleet, Math.ceil(g.groupRaw * (1 + settings.bufferPct)))
      binding = 'utilization'
    }
    out.push({ vehicleId: g.vehicleId, groupRaw: g.groupRaw, baseFleet: g.baseFleet, charging, fleetWithCharging, fleetSold, binding })
  }
  return {
    groups: out,
    totalBaseFleet: out.reduce((s, x) => s + x.baseFleet, 0),
    totalChargingDelta: out.reduce((s, x) => s + x.charging.chargingDelta, 0),
    totalFleetSold: out.reduce((s, x) => s + x.fleetSold, 0),
    bufferPct: settings.bufferPct,
  }
}
```

Note: `veh.calc.runTimeHr` won't typecheck until Task 4 adds the field — that's expected; Tasks 2–5 form one committed unit sequence, with the calc tests green after this step via the `as unknown as Vehicle` fixtures.

- [ ] **Step 4: Run the calc tests:**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts src/calc/__tests__/utilization.test.ts`
Expected: PASS (utilization.test.ts is untouched and must stay green).

---

### Task 4: Vehicle type + JSONs — add `runTimeHr`, delete amp fields

**Files:**
- Modify: `src/lib/vehicleLibrary.ts:60-66`
- Modify: `src/content/vehicles/cb18.json`, `ml2.json`, `m10.json`, `ebase7.json`, `8tb50a.json`, `8hbc40a.json`
- Modify: `src/calc/__tests__/trafficLight.test.ts` (fixture)

- [ ] **Step 1: In `VehicleCalc`** (src/lib/vehicleLibrary.ts), replace the `dischargeA` + `chargeA` fields (both JSDoc lines and declarations) with:

```ts
  /** Hours of operation per full charge (cutsheet). The v3 charging calc and
   *  ROM energy both derive from this — no amp fields. */
  runTimeHr: number
```

Keep `ratedAh`, `voltageV`, `chargeTimeMin`, `chargerType` unchanged.

- [ ] **Step 2: Edit each vehicle JSON** — in the `calc` block, delete the `"dischargeA"` and `"chargeA"` lines and add `"runTimeHr"` directly after `"voltageV"`:

| File | add | delete |
|---|---|---|
| `cb18.json` | `"runTimeHr": 8.0,` | `"dischargeA": 53.3,` `"chargeA": 284,` |
| `8tb50a.json` | `"runTimeHr": 8.0,` | `"dischargeA": 75,` `"chargeA": 400,` |
| `8hbc40a.json` | `"runTimeHr": 6.0,` | `"dischargeA": 100,` `"chargeA": 400,` |
| `ebase7.json` | `"runTimeHr": 6.0,` | `"dischargeA": 13.3,` `"chargeA": 32,` |
| `ml2.json` | `"runTimeHr": 10.0,` | `"dischargeA": 5.0,` `"chargeA": 101,` |
| `m10.json` | `"runTimeHr": 11.8,` | `"dischargeA": 1.9,` `"chargeA": 17.9,` |

(Values back-derive the same runtimes the amps encoded: `ratedAh × 0.8 ÷ dischargeA`.)

- [ ] **Step 3: Fix the trafficLight test fixture** — in `src/calc/__tests__/trafficLight.test.ts` (~line 32), replace:

```ts
    ratedAh: 200,
    voltageV: 48,
    dischargeA: 30,
    chargeA: 60,
```

with:

```ts
    ratedAh: 200,
    voltageV: 48,
    runTimeHr: 5.3,
```

(trafficLight never computes charging — the fixture just has to satisfy the type; 200 × 0.8 ÷ 30 ≈ 5.3.)

- [ ] **Step 4: Typecheck to find every remaining amp consumer:**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/calc/rom.ts`, `src/calc/__tests__/rom.test.ts`, `src/lib/vehicleDisplay.ts`, `src/lib/derivation.ts`, `src/lib/__tests__/derivation.test.ts`, `src/components/rom/FleetMath.tsx` — all fixed in Tasks 5–7. If anything else errors, fix it in the same spirit (hours in, amps out) and note it in the commit.

---

### Task 5: rom.ts energy from runtime (+ fixtures)

**Files:**
- Modify: `src/calc/rom.ts:60-75`
- Modify: `src/calc/__tests__/rom.test.ts:8-12`

- [ ] **Step 1: Update the kW derivation.** In `romOpex`, add `DEFAULT_DOD` to the existing import from `./types`, replace the JSDoc line `Operating power per vehicle = dischargeA × voltageV / 1000 (kW).` with `Operating power per vehicle = usable battery energy ÷ runtime: kW = voltageV × ratedAh × DOD / 1000 / runTimeHr.`, and replace the loop body line:

```ts
    const kw = (veh.calc.dischargeA * veh.calc.voltageV) / 1000
```

with:

```ts
    const rt = veh.calc.runTimeHr
    if (!rt || rt <= 0) continue
    const kw = (veh.calc.voltageV * veh.calc.ratedAh * DEFAULT_DOD) / 1000 / rt
```

- [ ] **Step 2: Update the rom.test fixture** so every expected energy number is unchanged (old kW at defaults = 100 A × 48 V = 4.8; new kW = 48 × 500 × 0.8/1000/4 = 4.8 with `runTimeHr = 4`). Replace the helper:

```ts
// Minimal Vehicle stub — only the fields rom.ts reads.
function veh(id: string, minUsd: number, maxUsd: number, runTimeHr = 4, voltageV = 48): Vehicle {
  return {
    id,
    calc: { runTimeHr, voltageV, ratedAh: 500, priceRange: { minUsd, maxUsd } },
  } as unknown as Vehicle
}
```

If any test in the file passes a custom 4th argument (old `dischargeA`), convert it: `runTimeHr = 500 × 0.8 ÷ dischargeA` (e.g. `dischargeA 50` → `runTimeHr 8`).

Also: `FleetGroup.binding` is now required, so any test fixture that hand-builds a `FleetGroup` needs it. In the `fleet()` helper in `rom.test.ts` (and in `romCharts.test.ts` if it builds groups the same way), add `binding: 'utilization' as const,` alongside `fleetWithCharging`/`fleetSold`.

- [ ] **Step 3: Run:** `npx vitest run src/calc/__tests__/rom.test.ts src/calc/__tests__/romCharts.test.ts`
Expected: PASS (romCharts reads only `ChargingResult.runHr/chargeHr` + `DEFAULT_DOD`, both still present).

- [ ] **Step 4: Commit Tasks 2–5 together (calc unit):**

```bash
git add src/calc src/lib/vehicleLibrary.ts src/content/vehicles
git commit -m "feat(calc): charging model v3 — hours-based availability + max-of-constraints buffer

runTimeHr/chargeTimeMin replace the amp fields; DOD/CHARGE_EFFICIENCY derates
removed from charging; fleetSold = max(base, ceil(max(raw/aEnergy,
raw*(1+buffer)/aCap))) with FleetGroup.binding. ROM kW now usable energy/runtime.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(The pre-commit hook requires the Task 1 CHANGELOG entry to be already committed — it is.)

---

### Task 6: vehicleDisplay.ts — cutsheet hours on the spec sheet

**Files:**
- Modify: `src/lib/vehicleDisplay.ts` (batteryLifeDisplay ~lines 44-56; spec rows ~lines 150-156)

- [ ] **Step 1: Replace `batteryLifeDisplay`** (the JSDoc + function using `ratedAh × DOD / dischargeA`) with:

```ts
/** Battery life per charge — the cutsheet runtime, verbatim. */
export function batteryLifeDisplay(v: Vehicle): string {
  const rt = v.calc.runTimeHr
  return rt && rt > 0 ? `${rt.toFixed(1)} h` : '—'
}
```

Remove the now-unused `DEFAULT_DOD` import if nothing else in the file uses it.

- [ ] **Step 2: Update the Power & Charging rows** — replace:

```ts
        { label: 'Battery life', value: batteryLifeDisplay(v), compare: cmp(calc.dischargeA > 0 ? calc.ratedAh / calc.dischargeA : null, 'higher') },
        { label: 'Discharge (operating)', value: `${calc.dischargeA} A` },
        { label: 'Charge current', value: `${calc.chargeA} A` },
```

with:

```ts
        { label: 'Battery life', value: batteryLifeDisplay(v), compare: cmp(calc.runTimeHr ?? null, 'higher') },
```

(`Charge time` and `Charging strategy` rows already exist below — keep them.)

- [ ] **Step 3: Run:** `npx vitest run src/lib` — Expected: derivation.test still FAILS (fixed next task); any vehicleDisplay-specific tests PASS. Then `npx tsc --noEmit` — expected remaining errors only in `derivation.ts`/`FleetMath.tsx`/their tests.

---

### Task 7: derivation.ts + derivation.test.ts — hours story + binding (TDD)

**Files:**
- Test: `src/lib/__tests__/derivation.test.ts` (charging + buffer describes)
- Modify: `src/lib/derivation.ts` (chargingDerivation, bufferDerivation, imports)

- [ ] **Step 1: Rewrite the test fixtures and the charging/buffer describes.** Keep the `cycleDerivation` describe untouched. Replace the `vehicle` + `group` fixtures and the two lower describes with:

```ts
const vehicle = { calc: { runTimeHr: 4, chargeTimeMin: 192 } } as unknown as Vehicle

const group = (over: Partial<FleetGroup> = {}): FleetGroup => ({
  vehicleId: 'x', groupRaw: 2.4, baseFleet: 3,
  charging: { method: 'plugged', runHr: 4, chargeHr: 3.2, availability: 0.625, aEnergy: 0.8, aCap: 0.625, chargingDelta: 2, sustainable: true, reason: '' },
  fleetWithCharging: 5, fleetSold: 6, binding: 'rotation', ...over,
})

describe('chargingDerivation', () => {
  it('explains rotation / weekly energy / availability and +N extra', () => {
    const d = chargingDerivation(group(), vehicle, { dailyOpHr: 16, breakHrs: 0, consecutiveOpDays: 5 })
    const byLabel = Object.fromEntries(d.steps.filter(s => s.result != null).map(s => [s.label, s.result]))
    expect(byLabel['Runtime per charge']).toBe('4.0 h')
    expect(byLabel['Recharge time']).toBe('3.2 h')
    expect(byLabel['Rotation (run : charge)']).toBe('63%')
    expect(byLabel['Weekly energy (off-shift + day-off reset)']).toBe('80%')
    const avail = d.steps.find(s => s.expr === 'min of the two')!
    expect(avail.result).toBe('63%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+2')
  })

  it('charging fits the fleet: +0, no fleet-with-charging row', () => {
    const d = chargingDerivation(
      group({ charging: { method: 'plugged', runHr: 18, chargeHr: 3, availability: 1, aEnergy: 1, aCap: 1, chargingDelta: 0, sustainable: true, reason: '' }, fleetWithCharging: 3, binding: 'utilization' }),
      vehicle, { dailyOpHr: 16, breakHrs: 0, consecutiveOpDays: 5 },
    )
    expect(d.steps.find(s => s.expr === 'min of the two')!.result).toBe('100%')
    expect(d.steps.find(s => s.label === 'Extra vehicles')!.result).toBe('+0')
    expect(d.steps.find(s => s.label === 'Fleet with charging')).toBeUndefined()
  })
})

describe('bufferDerivation', () => {
  it('takes the larger constraint and names the binding one', () => {
    // rotation: 2.4 × 1.10 ÷ 0.625 = 4.224 ; energy: 2.4 ÷ 0.8 = 3.0 → rotation binds
    const d = bufferDerivation(group(), 0.1)
    const rot = d.steps.find(s => s.label === 'Peak need with headroom')!
    expect(rot.result).toBe('4.22')
    const en = d.steps.find(s => s.label === 'Weekly energy sustain')!
    expect(en.result).toBe('3.00')
    const fleet = d.steps.find(s => s.label === 'Fleet (sold)')!
    expect(fleet.sub).toBe('⌈ 4.22 ⌉')
    expect(fleet.result).toBe('6')            // fixture's fleetSold (reported, not recomputed)
    expect(fleet.emphasis).toBe(true)
    expect(d.steps.find(s => s.label === 'Binding constraint')!.result).toBe('Charging rotation')
    expect(d.note).toContain('exactly once')
  })

  it('falls back to utilization-only sizing when availability is unknown', () => {
    const g = group({ charging: { ...group().charging, availability: null, aEnergy: null, aCap: null }, binding: 'utilization' })
    const d = bufferDerivation(g, 0.1)
    const rot = d.steps.find(s => s.label === 'Peak need with headroom')!
    expect(rot.result).toBe('2.64')           // 2.4 × 1.10 (no availability divisor)
    expect(d.steps.find(s => s.label === 'Weekly energy sustain')!.result).toBe('—')
  })
})
```

- [ ] **Step 2: Run to verify failure:** `npx vitest run src/lib/__tests__/derivation.test.ts` — Expected: FAIL (old labels).

- [ ] **Step 3: Rewrite the two derivations in `src/lib/derivation.ts`.** Change the import line `import { DEFAULT_DOD } from '@/src/calc/types'` to `import { utilizationFromBuffer } from '@/src/calc/types'`. Replace `chargingDerivation` with:

```ts
/** Charging tier: cutsheet runtime & recharge hours → rotation + weekly-energy
 *  availability → ⌈demand ÷ availability⌉ → extra vehicles. Mirrors `chargingForGroup`. */
export function chargingDerivation(
  group: FleetGroup, vehicle: Vehicle,
  settings: Pick<FleetSettings, 'dailyOpHr' | 'breakHrs' | 'consecutiveOpDays'>,
): Derivation {
  const c = group.charging
  const H = Math.max(0, settings.dailyOpHr - settings.breakHrs)
  const cDays = settings.consecutiveOpDays
  const tag = `${c.method === 'opportunity' ? 'Opportunity' : 'Plugged'} · ${Number.isFinite(cDays) ? `${cDays} days on` : '24/7'}`

  const steps: DerivStep[] = [
    sec('Battery (cutsheet hours — no derates)'),
    { label: 'Runtime per charge', expr: 'hours of work per full charge', result: c.runHr == null ? '—' : `${n1(c.runHr)} h` },
    { label: 'Recharge time', expr: 'time to a full charge', sub: vehicle.calc.chargeTimeMin ? `${vehicle.calc.chargeTimeMin} min` : undefined, result: c.chargeHr == null ? '—' : `${n1(c.chargeHr)} h` },
    sec('Availability'),
    { label: 'Rotation (run : charge)', expr: 'runtime ÷ (runtime + recharge), or 100% if the battery covers the window', result: c.aCap == null ? '—' : `${Math.round(c.aCap * 100)}%` },
    { label: 'Weekly energy (off-shift + day-off reset)', expr: `charges 24 h/day vs works ${n1(H)} h/day; a day off is a free full battery`, result: c.aEnergy == null ? '—' : `${Math.round(c.aEnergy * 100)}%` },
    { label: 'Availability', expr: 'min of the two', result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%`, emphasis: true },
  ]

  if (c.chargingDelta === 0) {
    steps.push({ label: 'Extra vehicles', expr: 'charging fits the fleet', result: '+0', emphasis: true })
    return { title: 'Charging — battery hours → availability', tag, steps, note: 'Off-shift and days-off charging keep the battery up, so charging steals no operating time.' }
  }
  steps.push(
    { label: 'Fleet with charging', expr: 'demand ÷ availability, rounded up', sub: c.availability == null ? undefined : `⌈ ${n2(group.groupRaw)} ÷ ${n2(c.availability)} ⌉`, result: String(group.baseFleet + c.chargingDelta) },
    { label: 'Extra vehicles', expr: 'fleet with charging − base', sub: `${group.baseFleet + c.chargingDelta} − ${group.baseFleet}`, result: `+${c.chargingDelta}`, emphasis: true },
  )
  return { title: 'Charging — battery hours → availability → +N', tag, steps, note: 'Availability is the share of the day a vehicle can work; the rest is charging. Dividing demand by it covers the downtime.' }
}
```

Replace `bufferDerivation` with:

```ts
const BINDING_LABEL: Record<FleetGroup['binding'], string> = {
  energy: 'Weekly energy', rotation: 'Charging rotation', utilization: 'Target utilization',
}

/** Utilization tier: the fleet pays the LARGER of the rotation and energy
 *  constraints (v3 overlap-aware composition), rounded up ONCE = fleet. */
export function bufferDerivation(group: FleetGroup, bufferPct: number): Derivation {
  const mult = (1 + bufferPct).toFixed(2)
  const { aEnergy, aCap } = group.charging
  const demandRotation = (group.groupRaw * (1 + bufferPct)) / (aCap ?? 1)
  const demandEnergy = aEnergy != null ? group.groupRaw / aEnergy : null
  return {
    title: 'Utilization — headroom → fleet',
    tag: `Utilization ${Math.round(utilizationFromBuffer(bufferPct) * 100)}%`,
    steps: [
      sec('Constraints — the fleet pays the larger'),
      { label: 'Peak need with headroom', expr: aCap != null && aCap < 1 ? 'raw × (1 + buffer) ÷ rotation availability' : 'raw × (1 + buffer)', sub: `${n2(group.groupRaw)} × ${mult}${aCap != null && aCap < 1 ? ` ÷ ${n2(aCap)}` : ''}`, result: n2(demandRotation) },
      demandEnergy != null
        ? { label: 'Weekly energy sustain', expr: 'raw ÷ energy availability — no buffer here: idle robots charge', sub: `${n2(group.groupRaw)} ÷ ${n2(aEnergy!)}`, result: n2(demandEnergy) }
        : { label: 'Weekly energy sustain', expr: 'battery data unavailable', result: '—', muted: true },
      { label: 'Fleet (sold)', expr: 'larger constraint, rounded up once', sub: `⌈ ${n2(Math.max(demandRotation, demandEnergy ?? 0))} ⌉`, result: String(group.fleetSold), emphasis: true },
      { label: 'Binding constraint', result: BINDING_LABEL[group.binding] },
    ],
    note: 'Headroom covers demand spikes, maintenance, and queueing; energy is average-work-driven, so buffer vehicles never multiply it. Each chassis rounds up exactly once — at the end.',
  }
}
```

- [ ] **Step 4: Run:** `npx vitest run src/lib/__tests__/derivation.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit:**

```bash
git add src/lib/vehicleDisplay.ts src/lib/derivation.ts src/lib/__tests__/derivation.test.ts
git commit -m "feat(display): hours-based charging narration + binding constraint in derivations

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: FleetMath.tsx — formulas + binding

**Files:**
- Modify: `src/components/rom/FleetMath.tsx`

- [ ] **Step 1:** Change the types import to drop `DEFAULT_DOD`: `import { DEFAULT_BUFFER_PCT } from '@/src/calc/types'`.

- [ ] **Step 2: Replace `chargingLine`'s equation div** with:

```tsx
    return (
      <div className="fm-eq mono">
        runtime <strong>{f1(c.runHr)} h</strong> per charge (cutsheet) ·
        recharge {f1(c.chargeHr ?? 0)} h → availability <strong>{pct(c.availability)}</strong> →
        <strong> +{c.chargingDelta}</strong> vehicle{c.chargingDelta === 1 ? '' : 's'}
      </div>
    )
```

- [ ] **Step 3: Replace `bufferLine`** with:

```tsx
  function bufferLine(vehicleId: string) {
    const g = groupFor(vehicleId)
    if (!g) return null
    const { aEnergy, aCap } = g.charging
    const rot = (g.groupRaw * (1 + buffer)) / (aCap ?? 1)
    const en = aEnergy != null ? g.groupRaw / aEnergy : null
    return (
      <div className="fm-eq mono">
        max({f2(rot)} rotation{en != null ? `, ${f2(en)} energy` : ''}) → ⌈⌉ = <strong>{g.fleetSold} sold</strong> · binding: {g.binding}
      </div>
    )
  }
```

- [ ] **Step 4: Update the three formula strings** (both system Step 2/3 and flow Step 3/4):
  - Charging steps: `formula="availability = min(run ÷ (run + charge), weekly energy)  ·  +vehicles to cover the gap"`
  - Buffer steps: `formula="sold = max(base, ⌈max(raw ÷ A_energy, raw × (1+buffer) ÷ A_cap)⌉)"` and buffer `why` text: `"The fleet pays the larger of two constraints: peak need with utilization headroom (÷ rotation availability) or weekly energy sustain. Energy never gets buffered — idle robots charge — and each chassis rounds up exactly once."`

- [ ] **Step 5:** `npx tsc --noEmit` — Expected: clean (this was the last amp consumer). `npx vitest run` — Expected: all green. Commit:

```bash
git add src/components/rom/FleetMath.tsx
git commit -m "feat(rom): FleetMath narrates v3 hours model + binding constraint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Step 3 UI — BufferPipeline binding + copy, ChargingPipeline note, CSS

**Files:**
- Modify: `src/components/engine/BufferPipeline.tsx`
- Modify: `src/components/engine/ChargingPipeline.tsx:150-154` (note copy)
- Modify: `app/globals.css` (one small class)

- [ ] **Step 1: BufferPipeline waterfall cell + binding.** Replace the `wf-mid` cell and the `wf-sold` cell in the row map with:

```tsx
                  <td className="num mono wf-mid" data-label="Sized demand">{g ? (() => {
                    const rot = (g.groupRaw * (1 + bufferPct)) / (g.charging.aCap ?? 1)
                    const en = g.charging.aEnergy != null ? g.groupRaw / g.charging.aEnergy : 0
                    return Math.max(rot, en).toFixed(2)
                  })() : '—'}</td>
                  <td className="num mono wf-sold" data-label="Fleet">
                    {g?.fleetSold ?? '—'}
                    {g && <span className="wf-binding mono">{g.binding}</span>}
                  </td>
```

Change that column's header `<th className="num">× {(1 + bufferPct).toFixed(2)}</th>` to `<th className="num">Sized demand</th>`.

- [ ] **Step 2: BufferPipeline note copy** — replace the `engine-note` div content with:

```tsx
        Sizing to a target utilization leaves headroom for demand variability, maintenance, and
        ramp-up — 80% is the AMR industry standard (past ~85% queueing and blocking wait climbs
        non-linearly). The fleet pays the <strong>larger</strong> of two constraints: peak need with
        headroom ÷ rotation availability, or weekly energy sustain (never buffered — idle robots
        charge). The tag on each Fleet figure names the binding constraint.
```

- [ ] **Step 3: ChargingPipeline note copy** — replace the `engine-note` div content with:

```tsx
        Availability is computed per vehicle type from its cutsheet runtime and charge time plus
        the schedule — breaks, off-shift hours, and days off all charge (a day off recharges to
        100%), and any vehicle charges whenever it is not working. The <strong>+N</strong> extra
        vehicles for charging pool per vehicle type at the project level.
```

- [ ] **Step 4: Add the binding-tag style** in `app/globals.css`, next to the other `.wf-*` rules (search `wf-sold`):

```css
.wf-binding {
  display: block;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tal-text-tertiary, #8a8f98);
}
```

Use the muted color token neighboring `.wf-*` rules actually use (check siblings; fall back shown). **CSS changed → after this task, restart the dev server clean (`rm -rf .next && npm run dev`) before any visual check.**

- [ ] **Step 5:** `npx tsc --noEmit` clean, `npx vitest run` green. Commit:

```bash
git add src/components/engine app/globals.css
git commit -m "feat(step3): binding-constraint tag + v3 copy in Charging/Utilization sections

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: xlsxExport — two editable availability columns

**Files:**
- Modify: `src/lib/xlsxExport.ts:77-114`

- [ ] **Step 1: Replace the FLEET block** (from `const fleetNoteR` through the `!cols` assignment) with:

```ts
  // ── FLEET block (raw → base → availabilities → +charging → sold) ────────
  const fleetNoteR = maxR + 1
  put(0, fleetNoteR, S('FLEET — by vehicle pool; both Availability cells are editable, the rest recompute'))
  const fleetHR = fleetNoteR + 1
  const fleetHeaders = ['Vehicle', 'Raw demand', 'Base fleet', 'Avail energy', 'Avail rotation', '+ Charging', 'Fleet sold']
  fleetHeaders.forEach((h, c) => put(c, fleetHR, S(h)))

  const firstPoolR = fleetHR + 1
  fleet.groups.forEach((g, i) => {
    const r = firstPoolR + i
    const er = r + 1
    const name = vehicleById.get(g.vehicleId)?.name ?? g.vehicleId
    const aEnergy = g.charging.aEnergy != null && g.charging.aEnergy > 0 ? g.charging.aEnergy : 1
    const aCap = g.charging.aCap != null && g.charging.aCap > 0 ? g.charging.aCap : 1
    put(0, r, S(name))
    // Raw demand pulled from the flows' Raw column by vehicle name.
    put(1, r, F(`SUMIF($D$${firstFlowR + 1}:$D$${lastFlowER},A${er},$N$${firstFlowR + 1}:$N$${lastFlowER})`, '0.000'))
    put(2, r, F(`IF(B${er}>0,ROUNDUP(B${er},0),0)`))
    put(3, r, N(aEnergy, '0%'))
    put(4, r, N(aCap, '0%'))
    put(5, r, F(`MAX(0,ROUNDUP(B${er}/MIN(D${er},E${er}),0)-C${er})`))
    // v3 composition: larger of energy (unbuffered) and rotation (buffered), floored at base.
    put(6, r, F(`MAX(C${er},ROUNDUP(MAX(B${er}/D${er},B${er}*(1+${BUFFER})/E${er}),0))`))
  })
  const nPools = fleet.groups.length
  const totalR = firstPoolR + nPools
  if (nPools > 0) {
    const firstER = firstPoolR + 1
    const lastER = firstPoolR + nPools
    put(0, totalR, S('TOTAL'))
    put(2, totalR, F(`SUM(C${firstER}:C${lastER})`))
    put(5, totalR, F(`SUM(F${firstER}:F${lastER})`))
    put(6, totalR, F(`SUM(G${firstER}:G${lastER})`))
  }
  maxR = totalR + 1

  ws['!ref'] = utils.encode_range({ s: { c: 0, r: 0 }, e: { c: MAXC, r: maxR } })
  ws['!cols'] = [
    { wch: 5 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 13 },
    { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 9 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
  ] as ColInfo[]
```

Also update the file-top comment word `availability` → `availabilities` if present.

- [ ] **Step 2:** `npx vitest run src/lib` green; `npx tsc --noEmit` clean. Commit:

```bash
git add src/lib/xlsxExport.ts
git commit -m "feat(xlsx): v3 fleet formulas — editable energy + rotation availability columns

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: PPTX strings — tiles + tier meanings

**Files:**
- Modify: `src/lib/pptx/tables.ts` (~lines 255-260 tiles; ~295-300 tier meanings)

- [ ] **Step 1: Waterfall tiles** in `fillFleetSizing` — replace the `× BUFFER` tile object with:

```ts
    { value: `×${(1 + settings.bufferPct).toFixed(2)}`, label: '× HEADROOM', compact: true,
      desc: 'target-utilization headroom for peaks and maintenance' },
```

- [ ] **Step 2: Tier meanings** in `buildTierDerivations` — replace the CHARGING and BUFFER `meaning` strings with:

```ts
      meaning: 'Cutsheet runtime vs recharge hours set availability; off-shift and day-off charging are credited. Dividing demand by availability adds the vehicles that cover charging downtime.',
```

```ts
      meaning: 'The fleet pays the larger of two constraints — peak need with utilization headroom ÷ rotation availability, or weekly energy sustain (never buffered) — rounded up once per chassis = fleet sold.',
```

- [ ] **Step 3:** `npx vitest run src/lib/pptx` green (ooxml test is structural). Commit:

```bash
git add src/lib/pptx/tables.ts
git commit -m "feat(pptx): v3 charging/headroom wording on sizing slide + appendix

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: VEHICLE-DATA-PROVENANCE.md — runTimeHr provenance

**Files:**
- Modify: `docs/VEHICLE-DATA-PROVENANCE.md`

- [ ] **Step 1: Update the Ah-migration note** (the lines defining `chargeA = …` / `dischargeA = …` near the top) — replace those two derivation lines with:

```markdown
- `calc.runTimeHr` (v3, 2026-07-18) — hours of operation per full charge. Replaces the derived
  `dischargeA`/`chargeA` amps (deleted). Current values are [estimate] back-derivations of the
  same assumed runtimes the amps encoded (`ratedAh × 0.80 ÷ dischargeA`): CB18 8.0 · 8TB50A 8.0 ·
  8HBC40A 6.0 · E7 6.0 · ML2 10.0 · M10 11.8. Replace each with the [cutsheet] runtime as
  verified — a JSON edit, no model change. `chargeTimeMin` remains [cutsheet] where noted below.
```

Also update any per-vehicle bullet that cites `dischargeA`/`chargeA` to cite `runTimeHr` instead (same provenance tag).

- [ ] **Step 2: Commit:**

```bash
git add docs/VEHICLE-DATA-PROVENANCE.md
git commit -m "docs: runTimeHr provenance (estimates pending cutsheet verification)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Sweep, verify, push

- [ ] **Step 1: Orphan sweep** (folder-hygiene rule):

Run: `grep -rn "dischargeA\|chargeA\b\|CHARGE_EFFICIENCY" src app docs/SPECIFICATION.md --include="*.ts" --include="*.tsx" --include="*.json"`
Expected: no hits in `src/`/`app/` (historical mentions in CHANGELOG/specs docs are fine). Fix any straggler the same way as its task above.

- [ ] **Step 2: Full gates:**

```bash
npx tsc --noEmit && npm run check:arch && npx vitest run
```
Expected: all clean/green (321+ tests).

- [ ] **Step 3: Judgment gates** (cannot be automated): run `/simplify` on the diff, then `/review`. Apply fixes; re-run Step 2 if anything changed.

- [ ] **Step 4: Push** (pre-push hook re-runs the mechanical gates):

```bash
git push origin main
```

- [ ] **Step 5: Manual smoke** — with the dev server restarted clean (CSS changed in Task 9): open a project → Step 3. Verify: Section 02 shows runtime/recharge hours and availability per pool; Section 03 shows "Sized demand" + binding tag under each Fleet figure; totals match `max(base, ⌈max(raw/aE, raw·(1+b)/aC)⌉)` hand-checked for one group.
