# Charging Model v4 — One Availability Term Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-branch charging model (`aCap` + `aEnergy` + a break credit) with one availability term derived from each platform's runtime, recharge time, and the staffed window — and make the fleet waterfall add up.

**Architecture:** `A = min(1, [z·R + (H − z·R)·d] / H)` where `d = R/(R+Ch)` is the platform duty ratio and `z = min(1, (24−H)/Ch)` is how much of a full charge the off-shift delivers. Three inputs: `runTimeHr`, `chargeTimeMin`, `dailyOpHr`. Breaks and `consecutiveOpDays` leave the charging path entirely. `fleetSold` becomes a single constraint, and `baseFleet + utilizationDelta + chargingDelta = fleetSold` exactly.

**Tech Stack:** TypeScript strict, Vitest, pure functions in `src/calc/`.

---

## Owner decisions this plan encodes (2026-10-04)

| decision | answer | consequence |
|---|---|---|
| Does charging stagger across the fleet? | **Yes, staggered** | Availability is the duration-weighted average over the window, not the worst moment. Without staggering the honest figure is the bare duty ratio `d`, which costs 11–16% more fleet. |
| Model charger count? | **No — assume 1:1 charger per vehicle** | No dock-contention constraint. This is what *makes* staggering achievable, so the two decisions are consistent; both must be stated in the Assumptions panel. |
| Keep breaks in the charging math? | **No** | `H = min(24, shifts × hours/shift)`. `breaksPerShift`/`breakDurationMin` stay as Step 1 proposal detail and stop touching the quote. |
| Keep off-days in the charging math? | **No** | Worth ≤1.25%. `operatingDaysPattern` keeps earning its place via `operatingDaysPerYear` (labor offset / annualization). |

## Why this is one formula and not two

`aEnergy = (24 + Ch/C) / (H·(1 + Ch/R))` and `d = 1/(1 + Ch/R)`, so
`aEnergy = d × (24 + Ch/C)/H ≥ d` for every `H ≤ 24`. **`aEnergy` can never bind.**
Verified across all six platforms × `H ∈ {8, 15, 20, 22.5, 24}`: zero violations.
The only thing that ever pushed `aCap` above `d` — and so made the second branch
reachable — was the uncapped break credit `breakHrs × (runTimeHr/chargeHr)`.
Remove breaks and the second branch is provably dead code.

The break credit itself existed to paper over a real omission: `aCap` forgets the
vehicle starts the day on a full battery. Put that term in properly (`z·R`) and
the fudge is unnecessary.

## Numbers that move (raw peak 40, target utilization 80%)

| vehicle | 1 shift | 2 shifts | 3 shifts |
|---|---|---|---|
| ebase7 | 68 → **54** (−21%) | 65 → **62** | 64 → **71** (+11%) |
| cb18 / 8tb50a | 50 → 50 | 56 → **55** | 55 → **60** (+9%) |
| 8hbc40a | 50 → **53** | 58 → 58 | 57 → **63** (+11%) |
| m10 | 50 → 50 | 50 → **52** | 50 → **56** (+12%) |
| ml2 | 50 → 50 | 50 → **51** | 50 → **53** (+6%) |

Signature: **single-shift quotes get cheaper** (the old model rated ebase7 at 74%
available on an 8 h shift its battery covers 6 h of), **24/7 quotes get more
expensive and safer** (no overnight reset exists to credit, and the break credit
was fiction). Two shifts is near-neutral.

Every quote regenerated after this ships will differ from one generated before it.
Call that out in CHANGELOG and the release note.

---

## File Structure

| file | responsibility after this change |
|---|---|
| `src/calc/fleet.ts` | `chargingAvailability` (new, exported) · `chargingForGroup` (one term) · `fleetSummary` (one constraint, additive waterfall) |
| `src/calc/types.ts` | `ChargingResult` loses `aEnergy`/`aCap`, gains `dutyRatio`/`offShiftCharge`. `FleetGroup` loses `demandEnergy`/`fleetWithCharging`, gains `fleetAtTarget`/`utilizationDelta`/`demand`. `FleetBinding` → 2 values. `FleetSettings` loses `breakHrs`/`consecutiveOpDays`. |
| `src/lib/fleetModel.ts`, `src/lib/useFleetData.ts`, `app/projects/[id]/step3/page.tsx` | stop computing/passing `breakHrs` + `consecutiveOpDays` |
| `src/lib/derivation.ts` | one availability step, one constraint step, additive waterfall |
| `src/components/rom/FleetMath.tsx`, `src/components/engine/BufferPipeline.tsx`, `src/components/engine/ChargingPipeline.tsx` | read the new fields |
| `src/components/rom/RomKpis.tsx` | Utilization gauge `raw/(sold·A)`; Charging gauge `1 − A` |
| `src/components/rom/AssumptionsPanel.tsx` | declare staggered charging + 1:1 chargers; drop the break row |
| `src/lib/xlsxExport.ts`, `src/lib/pdfExport.ts`, `src/lib/pptx/tables.ts`, `src/lib/kpiDetails.ts` | column/row renames |
| `ARCHITECTURE.md`, `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`, `src/content/methodology.ts` | the v4 story |

---

### Task 1: `chargingAvailability` — the one availability term

**Files:**
- Modify: `src/calc/fleet.ts`
- Test: `src/calc/__tests__/chargingAvailability.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/calc/__tests__/chargingAvailability.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { chargingAvailability } from '../fleet'

/** v4 (2026-10-04): ONE availability term, three inputs. Replaces aCap + aEnergy
 *  + the uncapped break credit. Owner decisions encoded here: charging is
 *  staggered across the fleet (so availability is the duration-weighted average
 *  over the staffed window, not the worst moment), and there is one charger per
 *  vehicle (so dock contention is not modelled). */
describe('chargingAvailability', () => {
  it('is 100% when the battery covers the whole staffed window', () => {
    // ml2: 10 h runtime, 0.5 h recharge, single 8 h shift.
    const r = chargingAvailability(10, 30, 8)!
    expect(r.availability).toBe(1)
  })

  it('collapses to the bare duty ratio at 24/7 — there is no overnight reset to credit', () => {
    for (const [rt, cm] of [[6, 150], [11.8, 75], [10, 30]] as const) {
      const r = chargingAvailability(rt, cm, 24)!
      expect(r.availability).toBeCloseTo(rt / (rt + cm / 60), 10)
      expect(r.offShiftCharge).toBe(0)
    }
  })

  it('credits the overnight full charge, then the sustained duty ratio', () => {
    // ebase7: 6 h runtime, 2.5 h recharge, 15 h staffed.
    // 6 free hours, then 9 h at d = 6/8.5 → (6 + 9×0.70588)/15 = 0.82353
    const r = chargingAvailability(6, 150, 15)!
    expect(r.dutyRatio).toBeCloseTo(6 / 8.5, 10)
    expect(r.availability).toBeCloseTo((6 + 9 * (6 / 8.5)) / 15, 10)
  })

  it('never reports less than the duty ratio, and never more than 1', () => {
    for (const rt of [2, 6, 8, 10, 11.8]) {
      for (const cm of [6, 30, 75, 90, 150, 600]) {
        for (const H of [0.5, 8, 15, 16, 22.5, 24]) {
          const r = chargingAvailability(rt, cm, H)!
          expect(r.availability).toBeGreaterThanOrEqual(rt / (rt + cm / 60) - 1e-12)
          expect(r.availability).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is monotonic in the run:charge ratio — the platform signature', () => {
    const H = 16
    const a = [[6, 150], [6, 90], [8, 90], [11.8, 75], [10, 30]] as const
      .map(([rt, cm]) => ({ ratio: rt / (cm / 60), A: chargingAvailability(rt, cm, H)!.availability }))
      .sort((x, y) => x.ratio - y.ratio)
    for (let i = 1; i < a.length; i++) expect(a[i].A).toBeGreaterThanOrEqual(a[i - 1].A)
  })

  it('returns null when an input is missing or non-positive — never NaN', () => {
    expect(chargingAvailability(0, 90, 16)).toBeNull()
    expect(chargingAvailability(6, 0, 16)).toBeNull()
    expect(chargingAvailability(6, undefined, 16)).toBeNull()
    expect(chargingAvailability(6, 90, 0)).toBeNull()
  })

  it('REGRESSION: breaks are not an input — the uncapped credit is gone', () => {
    // v3 credited breakHrs × (runTimeHr/chargeHr) with no ceiling, which handed
    // ml2 (20:1 run:charge) 40 h of effective runtime on a 24 h day.
    expect(chargingAvailability.length).toBe(3)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/calc/__tests__/chargingAvailability.test.ts`
Expected: FAIL — `chargingAvailability` is not exported from `../fleet`.

- [ ] **Step 3: Implement**

In `src/calc/fleet.ts`, add above `chargingForGroup`:

```ts
export interface AvailabilityResult {
  /** Share of the staffed window one vehicle can be WORKING, ∈ (0,1]. */
  availability: number
  /** Steady-state duty ratio R/(R+Ch) — the floor, once the start charge is spent. */
  dutyRatio: number
  /** Fraction of a full charge the off-shift window can deliver: 1 with a long
   *  off-shift, 0 at 24/7. This is the term v3 omitted, and the reason its break
   *  credit existed. */
  offShiftCharge: number
}

/**
 * Charging availability for one vehicle type — the whole charging model (v4,
 * 2026-10-04). Three inputs, one term:
 *
 *   d = R / (R + Ch)                        duty ratio — the platform signature
 *   z = min(1, (24 − H) / Ch)               what the off-shift window can refill
 *   A = min(1, [z·R + (H − z·R)·d] / H)     free hours first, then sustained duty
 *
 * A vehicle starts the staffed window on whatever the off-shift could put in it,
 * works that off, then settles into its duty ratio. At H = 24 there is no
 * off-shift, z = 0, and A collapses to exactly d — so this ONE expression covers
 * both regimes v3 split across `aCap` and `aEnergy`.
 *
 * `A` is the duration-weighted AVERAGE over the window. That is correct only
 * because charging is staggered across the fleet (owner decision 2026-10-04,
 * paired with one charger per vehicle). If vehicles ever charge in lockstep the
 * honest figure is the bare `dutyRatio`, which is 11–16% more fleet — hence
 * `dutyRatio` is returned and displayed, not hidden.
 *
 * Replaced in v4: `aEnergy` (provably dominated — `aEnergy = d × (24 + Ch/C)/H ≥ d`
 * for all H ≤ 24, so it could only bind when the break credit inflated `aCap`
 * past `d`), and the break credit itself (`breakHrs × R/Ch`, uncapped — it handed
 * ml2 forty hours of runtime on a twenty-four hour day).
 *
 * @param runTimeHr   hours of work per full charge (cutsheet)
 * @param chargeTimeMin minutes to a full recharge (cutsheet)
 * @param staffedHr   H — clock hours/day the operation is staffed
 * @returns null when any input is missing or non-positive (display "—", never NaN)
 */
export function chargingAvailability(
  runTimeHr: number,
  chargeTimeMin: number | undefined,
  staffedHr: number,
): AvailabilityResult | null {
  if (!(runTimeHr > 0)) return null
  if (chargeTimeMin == null || !(chargeTimeMin > 0)) return null
  if (!(staffedHr > 0)) return null

  const chargeHr = chargeTimeMin / 60
  const dutyRatio = runTimeHr / (runTimeHr + chargeHr)
  const offShiftCharge = Math.min(1, Math.max(0, 24 - staffedHr) / chargeHr)
  const freeHr = offShiftCharge * runTimeHr
  const worked = Math.min(staffedHr, freeHr + Math.max(0, staffedHr - freeHr) * dutyRatio)
  return { availability: Math.min(1, worked / staffedHr), dutyRatio, offShiftCharge }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/calc/__tests__/chargingAvailability.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/calc/fleet.ts src/calc/__tests__/chargingAvailability.test.ts
git commit -m "feat(calc): chargingAvailability — one availability term (v4)"
```

---

### Task 2: Reshape `ChargingResult` and `chargingForGroup`

**Files:**
- Modify: `src/calc/types.ts:178-190` (`ChargingResult`), `src/calc/fleet.ts` (`ChargingInput`, `chargingForGroup`)
- Test: `src/calc/__tests__/fleet.test.ts`

- [ ] **Step 1: Update the type**

Replace `ChargingResult` in `src/calc/types.ts`:

```ts
/** Per-vehicle-group charging outcome. Nulls mean inputs were insufficient —
 *  display "—", never NaN. v4 (2026-10-04): `aEnergy`/`aCap` are gone; there is
 *  one `availability` term, with `dutyRatio` carried alongside as the
 *  no-staggering floor (see chargingAvailability). */
export interface ChargingResult {
  method: ChargeMethod
  runHr: number | null        // operating hours one charge sustains
  chargeHr: number | null     // hours to a full recharge
  availability: number | null // A ∈ (0,1] — share of the staffed window workable
  dutyRatio: number | null    // R/(R+Ch) — the floor if charging ever un-staggers
  offShiftCharge: number | null // fraction of a full charge the off-shift delivers
  sustainable: boolean        // false when inputs invalid/zero
  reason: string              // human explanation
}
```

`chargingDelta` moves off `ChargingResult` to `FleetGroup` in Task 3 — it is a
fleet-composition figure, not a charging figure, and it can only be computed once
the utilization target is known.

- [ ] **Step 2: Update `ChargingInput` and `chargingForGroup` in `src/calc/fleet.ts`**

```ts
export interface ChargingInput {
  runTimeHr: number           // hours of operation per full charge (cutsheet)
  chargeTimeMin?: number      // minutes to a full recharge (cutsheet)
  method: ChargeMethod        // display only (carried onto ChargingResult)
  staffedHr: number           // H — clock hours/day the operation is staffed
}

/** Wrap `chargingAvailability` with the display fields the UI needs. */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    dutyRatio: null, offShiftCharge: null, sustainable: false, reason,
  })
  if (!(i.runTimeHr > 0)) return invalid('Missing battery runtime data')
  if (i.chargeTimeMin == null || !(i.chargeTimeMin > 0)) return invalid('Missing charge time data')
  if (!(i.staffedHr > 0)) return invalid('No production hours')

  const a = chargingAvailability(i.runTimeHr, i.chargeTimeMin, i.staffedHr)
  if (!a || !(a.availability > 0)) return invalid('Cannot determine availability')

  const pct = `${Math.round(a.availability * 100)}%`
  return {
    method: i.method, runHr: i.runTimeHr, chargeHr: i.chargeTimeMin / 60,
    availability: a.availability, dutyRatio: a.dutyRatio, offShiftCharge: a.offShiftCharge,
    sustainable: true,
    reason: a.availability >= 1
      ? 'The battery covers the staffed window — charging costs no vehicles'
      : `Available ${pct} of the staffed window; the rest is charging`,
  }
}
```

- [ ] **Step 3: Update the charging tests in `src/calc/__tests__/fleet.test.ts`**

Every `chargingForGroup({ groupRaw, baseFleet, runTimeHr, chargeTimeMin, method, hProd, breakHrs, consecutiveOpDays })`
call becomes `chargingForGroup({ runTimeHr, chargeTimeMin, method, staffedHr })`.
Assertions on `aEnergy`/`aCap`/`chargingDelta` move to `availability`/`dutyRatio`,
or to Task 3's `fleetSummary` tests for `chargingDelta`. Recompute every expected
number from the Task 1 formula — **do not carry a v3 expectation forward**; the
whole point is that those numbers were wrong.

- [ ] **Step 4: Run**

Run: `npx tsc --noEmit && npx vitest run src/calc/__tests__/fleet.test.ts`
Expected: clean typecheck; `fleetSummary` tests still fail (Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/calc/types.ts src/calc/fleet.ts src/calc/__tests__/fleet.test.ts
git commit -m "refactor(calc)!: ChargingResult carries one availability term"
```

---

### Task 3: `fleetSummary` — one constraint, a waterfall that sums

**Files:**
- Modify: `src/calc/types.ts` (`FleetGroup`, `FleetSummary`, `FleetBinding`, `FleetSettings`), `src/calc/fleet.ts` (`fleetSummary`)
- Test: `src/calc/__tests__/fleet.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/fleet.test.ts`:

Reuse the existing `grp` / `veh` / `settings` helpers already defined in the
`fleetSummary` describe block (`src/calc/__tests__/fleet.test.ts:85-94`) — and
first delete `breakHrs: 0` and `consecutiveOpDays: Infinity` from `settings()`,
since Task 3 removes both from `FleetSettings`.

```ts
describe('fleetSummary — v4 additive waterfall', () => {
  // ml2-like (10 h run / 0.5 h charge) and ebase7-like (6 h run / 2.5 h charge).
  const mix = [grp('fast', 3.4, 4), grp('slow', 3.4, 4)]
  const vById = new Map([
    ['fast', veh('fast', 10, 30)],
    ['slow', veh('slow', 6, 150)],
  ])

  it('base + utilization + charging === sold, for every group', () => {
    const f = fleetSummary(mix, vById, settings({ dailyOpHr: 16 }))
    expect(f.groups).toHaveLength(2)
    for (const g of f.groups) {
      expect(g.baseFleet + g.utilizationDelta + g.chargingDelta).toBe(g.fleetSold)
    }
    expect(f.totalBaseFleet + f.totalUtilizationDelta + f.totalChargingDelta)
      .toBe(f.totalFleetSold)
  })

  it('charging costs nothing when the battery covers the window', () => {
    // 10 h runtime over an 8 h staffed day → availability 1.
    const f = fleetSummary(mix, vById, settings({ dailyOpHr: 8 }))
    const g = f.groups.find(x => x.vehicleId === 'fast')!
    expect(g.charging.availability).toBe(1)
    expect(g.chargingDelta).toBe(0)
    expect(g.binding).toBe('utilization')
  })

  it('charging binds when availability is short', () => {
    const f = fleetSummary(mix, vById, settings({ dailyOpHr: 24 }))
    const g = f.groups.find(x => x.vehicleId === 'slow')!
    expect(g.charging.availability).toBeCloseTo(6 / 8.5, 10)   // 24/7 → bare duty ratio
    expect(g.chargingDelta).toBeGreaterThan(0)
    expect(g.binding).toBe('charging')
  })

  it('the slow-charging platform always needs at least as many units', () => {
    const f = fleetSummary(mix, vById, settings({ dailyOpHr: 16 }))
    const fast = f.groups.find(x => x.vehicleId === 'fast')!
    const slow = f.groups.find(x => x.vehicleId === 'slow')!
    expect(slow.fleetSold).toBeGreaterThanOrEqual(fast.fleetSold)
  })

  it('never sells below the peak demand floor', () => {
    const f = fleetSummary(mix, vById, settings({ dailyOpHr: 16, bufferPct: 0 }))
    for (const g of f.groups) expect(g.fleetSold).toBeGreaterThanOrEqual(g.baseFleet)
  })

  it('a group with no battery data costs no charging vehicles', () => {
    const f = fleetSummary([grp('bare', 3.4, 4)], new Map(), settings({ dailyOpHr: 16 }))
    const g = f.groups[0]
    expect(g.charging.availability).toBeNull()
    expect(g.chargingDelta).toBe(0)
  })

  it('REGRESSION: no demandEnergy branch survives', () => {
    const g = fleetSummary(mix, vById, settings({ dailyOpHr: 16 })).groups[0]
    expect('demandEnergy' in g).toBe(false)
    expect('fleetWithCharging' in g).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts -t 'v4 additive'`
Expected: FAIL — `utilizationDelta` does not exist.

- [ ] **Step 3: Update the types**

In `src/calc/types.ts`:

```ts
/** Which cause set `fleetSold`. v4: one constraint, so this says whether
 *  charging contributed at all. */
export type FleetBinding = 'charging' | 'utilization'

export interface FleetGroup {
  vehicleId: string
  groupRaw: number             // peak demand in vehicle-equivalents
  baseFleet: number            // ⌈groupRaw⌉ — the physical floor
  charging: ChargingResult
  /** Fleet at the utilization target, before charging: max(baseFleet, ⌈raw/U⌉). */
  fleetAtTarget: number
  /** Pre-ceil demand = groupRaw / (availability × U). The SINGLE source for the
   *  constraint arithmetic — display layers read it, never re-derive it. */
  demand: number
  /** fleetAtTarget − baseFleet. */
  utilizationDelta: number
  /** fleetSold − fleetAtTarget — vehicles needed BECAUSE of charging. A true
   *  addend: baseFleet + utilizationDelta + chargingDelta === fleetSold. */
  chargingDelta: number
  fleetSold: number
  binding: FleetBinding
}

export interface FleetSummary {
  groups: FleetGroup[]
  totalBaseFleet: number
  totalUtilizationDelta: number
  totalChargingDelta: number
  totalFleetSold: number
  bufferPct: number
}

/** Project-level fleet settings consumed by the engine. `dailyOpHr` is derived
 *  from Step 1 (shiftsPerDay × hoursPerShift, capped at 24). v4 dropped
 *  `breakHrs` and `consecutiveOpDays`: breaks were only ever compensating for a
 *  missing term in `aCap`, and the day-off reset was worth ≤1.25%. */
export interface FleetSettings {
  regime: ChargeRegime            // legacy — kept for the engine UI's display toggle only
  bufferPct: number
  dailyOpHr: number               // H = min(24, shifts × hours)
  chargeMethods: Record<string, ChargeMethod>
}
```

- [ ] **Step 4: Implement `fleetSummary`**

Replace the body in `src/calc/fleet.ts`:

```ts
/**
 * Compose the fleet per vehicle group (v4, 2026-10-04). ONE constraint:
 *
 *   U         = 1 / (1 + bufferPct)                 target utilization
 *   fleetSold = max(⌈raw⌉, ⌈ raw / (A · U) ⌉)
 *
 * and the reported stages are true addends:
 *
 *   baseFleet  = ⌈raw⌉                              peak demand
 *   +util      = max(baseFleet, ⌈raw/U⌉) − baseFleet headroom
 *   +charging  = fleetSold − fleetAtTarget           charging downtime
 *   = fleetSold
 *
 * v3 reported `base + charging` as a waterfall that did NOT sum to `fleetSold`,
 * because sold was computed from a separate max() of two constraints. One
 * constraint makes the decomposition honest.
 *
 * Groups with no base fleet are skipped. `dailyOpHr` comes from the caller
 * (Step 1 schedule) so this stays pure.
 */
export function fleetSummary(
  groups: GroupSummary[],
  vehiclesById: Map<string, Vehicle>,
  settings: FleetSettings,
): FleetSummary {
  const targetUtil = 1 / (1 + settings.bufferPct)
  const out: FleetGroup[] = []
  for (const g of groups) {
    if (g.baseFleet <= 0) continue
    const veh = vehiclesById.get(g.vehicleId)
    const method = settings.chargeMethods[g.vehicleId] ?? defaultChargeMethod(veh?.calc.chargerType)
    const charging: ChargingResult = veh
      ? chargingForGroup({
          runTimeHr: veh.calc.runTimeHr,
          chargeTimeMin: veh.calc.chargeTimeMin,
          method,
          staffedHr: settings.dailyOpHr,
        })
      : { method, runHr: null, chargeHr: null, availability: null, dutyRatio: null,
          offShiftCharge: null, sustainable: false, reason: 'Vehicle not found' }

    // No battery data → availability degrades to 1, i.e. charging costs nothing.
    // Same convention v3 used for aCap, and the gate engine already flags the
    // missing cutsheet data elsewhere.
    const A = charging.availability ?? 1
    const fleetAtTarget = Math.max(g.baseFleet, Math.ceil(g.groupRaw / targetUtil))
    const demand = g.groupRaw / (A * targetUtil)
    const fleetSold = Math.max(fleetAtTarget, Math.ceil(demand))
    out.push({
      vehicleId: g.vehicleId, groupRaw: g.groupRaw, baseFleet: g.baseFleet, charging,
      fleetAtTarget, demand,
      utilizationDelta: fleetAtTarget - g.baseFleet,
      chargingDelta: fleetSold - fleetAtTarget,
      fleetSold,
      binding: fleetSold > fleetAtTarget ? 'charging' : 'utilization',
    })
  }
  return {
    groups: out,
    totalBaseFleet: out.reduce((s, x) => s + x.baseFleet, 0),
    totalUtilizationDelta: out.reduce((s, x) => s + x.utilizationDelta, 0),
    totalChargingDelta: out.reduce((s, x) => s + x.chargingDelta, 0),
    totalFleetSold: out.reduce((s, x) => s + x.fleetSold, 0),
    bufferPct: settings.bufferPct,
  }
}
```

- [ ] **Step 5: Run**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts`
Expected: PASS. Fix any remaining v3 expectations by recomputing from the formula.

- [ ] **Step 6: Commit**

```bash
git add src/calc/types.ts src/calc/fleet.ts src/calc/__tests__/fleet.test.ts
git commit -m "feat(calc)!: one sizing constraint, additive fleet waterfall (v4)"
```

---

### Task 4: Stop feeding breaks and off-days to the engine

**Files:**
- Modify: `src/lib/fleetModel.ts:42-51`, `src/lib/useFleetData.ts:68-72`, `app/projects/[id]/step3/page.tsx:89-93`
- Test: `src/lib/__tests__/fleetModel.test.ts`

- [ ] **Step 1: Remove `breakHrs` / `consecutiveOpDays` from each `FleetSettings` literal**

In `src/lib/fleetModel.ts` delete the `const breakHrs = …` line and both settings
keys. Do the same in `useFleetData.ts` and `step3/page.tsx`. Leave
`consecutiveOperatingDays` itself in place — grep first; if `fleetModel.ts`'s
`defaultOperatingDaysPerYear` is its only other caller the import stays, otherwise
drop the now-unused import.

`project.breaksPerShift` / `breakDurationMin` keep their Step 1 fields and their
schema entries — they are proposal detail now, not engine inputs. Do **not**
delete them.

- [ ] **Step 2: Add a regression test**

Create `src/lib/__tests__/chargingInputs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeFleetModel } from '../fleetModel'
import type { StoredProject } from '../storage'

/** v4: breaks and the day-off reset left the charging model. Breaks were only
 *  compensating for a term aCap omitted, and the credit was uncapped. This pins
 *  that entering breaks can no longer move a single vehicle. */
describe('breaks do not touch the fleet', () => {
  const base = {
    projectName: 'B', shiftsPerDay: 2, hoursPerShift: 8, bufferPct: 0.25,
    loads: [{ id: 'l1', unitType: 'Pallet', weightLbs: 2500 }],
    flows: [{ id: 'f1', origin: 'A', destination: 'B', distanceFt: 300, thruPerHr: 30,
              routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 }],
  } as unknown as StoredProject

  it('is identical with and without breaks entered', async () => {
    const { loadVehicleLibrary } = await import('../vehicleLibrary')
    const vehicles = await loadVehicleLibrary()
    const none = computeFleetModel(base, vehicles)
    const lots = computeFleetModel(
      { ...base, breaksPerShift: 3, breakDurationMin: 30 } as StoredProject, vehicles)
    expect(lots.fleet.totalFleetSold).toBe(none.fleet.totalFleetSold)
    expect(lots.fleet.groups[0].charging.availability)
      .toBe(none.fleet.groups[0].charging.availability)
  })

  it('is identical across operating-day patterns', async () => {
    const { loadVehicleLibrary } = await import('../vehicleLibrary')
    const vehicles = await loadVehicleLibrary()
    const five = computeFleetModel({ ...base, operatingDaysPattern: '5x8' } as StoredProject, vehicles)
    const seven = computeFleetModel({ ...base, operatingDaysPattern: '7x24' } as StoredProject, vehicles)
    expect(seven.fleet.totalFleetSold).toBe(five.fleet.totalFleetSold)
  })
})
```

Adjust the `operatingDaysPattern` literals to the real enum values before running.

- [ ] **Step 3: Run**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/chargingInputs.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(engine): breaks and off-days leave the charging model"
```

---

### Task 5: Derivation and engine pipelines

**Files:**
- Modify: `src/lib/derivation.ts:93-155`, `src/components/engine/ChargingPipeline.tsx`, `src/components/engine/BufferPipeline.tsx`, `src/components/rom/FleetMath.tsx`
- Test: `src/lib/__tests__/derivation.test.ts`

- [ ] **Step 1: `chargingDerivation` — one availability step**

`settings` narrows to `Pick<FleetSettings, 'dailyOpHr'>`. Replace the two
availability rows with:

```ts
sec('Availability'),
{ label: 'Duty ratio (run : charge)', expr: 'runtime ÷ (runtime + recharge) — the floor once the start charge is spent', result: c.dutyRatio == null ? '—' : `${Math.round(c.dutyRatio * 100)}%` },
{ label: 'Off-shift charge', expr: `${n1(Math.max(0, 24 - H))} h off-shift ÷ ${c.chargeHr == null ? '—' : n1(c.chargeHr)} h recharge, capped at one full battery`, result: c.offShiftCharge == null ? '—' : `${Math.round(c.offShiftCharge * 100)}% of a charge` },
{ label: 'Availability', expr: 'free hours on that charge, then the duty ratio, averaged over the staffed window', result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%`, emphasis: true },
```

Note in the derivation's `note`: availability is the staggered-charging average;
the duty ratio is what it would be if the fleet charged in lockstep.

- [ ] **Step 2: `bufferDerivation` — one constraint, additive stages**

```ts
const A = group.charging.availability
// ...
steps: [
  sec('Fleet build-up — these add'),
  { label: 'Peak demand', expr: 'Σ (moves/hr × cycle) ÷ 3600, rounded up', sub: n2(group.groupRaw), result: String(group.baseFleet) },
  { label: '+ utilization headroom', expr: `target ${Math.round(utilizationFromBuffer(bufferPct) * 100)}% — spikes, maintenance, queueing`, sub: `⌈ ${n2(group.groupRaw)} ÷ ${n2(utilizationFromBuffer(bufferPct))} ⌉`, result: `+${group.utilizationDelta}` },
  { label: '+ charging', expr: 'vehicles covering charging downtime', sub: A == null ? undefined : `÷ ${n2(A)} availability`, result: `+${group.chargingDelta}` },
  { label: 'Fleet (sold)', expr: 'the three above, which sum exactly', sub: `${group.baseFleet} + ${group.utilizationDelta} + ${group.chargingDelta}`, result: String(group.fleetSold), emphasis: true },
  { label: 'Binding constraint', expr: 'what set the fleet', result: BINDING_LABEL[group.binding] },
],
```

`BINDING_LABEL` becomes `{ charging: 'Charging', utilization: 'Target utilization' }`.

- [ ] **Step 3: Call sites**

- `ChargingPipeline.tsx`: drop the `breakHrs` / `consecutiveOpDays` props (lines 18-19, 38), the breaks text at line 91, and pass `{ dailyOpHr }` only at line 138.
- `step3/page.tsx`: drop both props (lines 287-288) and show `totalUtilizationDelta` next to `totalChargingDelta` at line 204 so the strip sums.
- `BufferPipeline.tsx:127`: `g.demand.toFixed(2)`.
- `FleetMath.tsx:77-81`: read `g.demand`; print the additive build-up instead of `max(rotation, energy)`.
- `FleetMath.tsx:131`: `base + utilization + charging = sold` — the totals now sum, so say so.
- `kpiDetails.ts:56`: `base ${totalBaseFleet} +util ${totalUtilizationDelta} +charging ${totalChargingDelta} → ${totalFleetSold}`.
- `FleetMath.tsx:121,173`: replace the two `A_energy` formula strings with the v4 one.

- [ ] **Step 4: Run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS once `derivation.test.ts` expectations are recomputed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(ui): derivation and pipelines read the v4 waterfall"
```

---

### Task 6: Gauges that reconcile

**Files:**
- Modify: `src/components/rom/RomKpis.tsx:86-99` and the gauge strip
- Test: `src/lib/__tests__/gaugeReconciliation.test.ts` (create)

The Utilization gauge is `raw ÷ sold`, which equals `U × A` — so it already
contains charging, and the Charging gauge then reports it again. Worse, it sits
beside a driver labelled "Target utilization 80%" while reading 62%.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { computeFleetModel } from '../fleetModel'
import { loadVehicleLibrary } from '../vehicleLibrary'
import { utilizationFromBuffer } from '@/src/calc/types'
import type { StoredProject } from '../storage'

/** The gauge strip must partition the day, not double-report charging.
 *  Utilization is of AVAILABLE time; availability + charging = 100%. */
describe('gauge reconciliation', () => {
  it('utilization measures available time, so it tracks the target', async () => {
    const vehicles = await loadVehicleLibrary()
    const m = computeFleetModel(PROJECT, vehicles)
    const target = utilizationFromBuffer(m.fleet.bufferPct)
    for (const g of m.fleet.groups) {
      const A = g.charging.availability ?? 1
      const util = g.groupRaw / (g.fleetSold * A)
      expect(util).toBeLessThanOrEqual(target + 0.02)   // ceil slack only
      expect(util).toBeGreaterThan(target - 0.25)
    }
  })

  it('availability and charging sum to one', async () => {
    const vehicles = await loadVehicleLibrary()
    const m = computeFleetModel(PROJECT, vehicles)
    for (const g of m.fleet.groups) {
      const A = g.charging.availability ?? 1
      expect(A + (1 - A)).toBeCloseTo(1, 10)
    }
  })
})
```

With `PROJECT` declared above the describe block — two vehicle types so the
weighting is exercised:

```ts
const PROJECT = {
  projectName: 'Gauges', shiftsPerDay: 2, hoursPerShift: 8, bufferPct: 0.25,
  operatorsPerShift: 3, fullyBurdenedRateUsdPerYear: 65000,
  loads: [{ id: 'l1', unitType: 'Pallet', weightLbs: 2500 }],
  flows: [
    { id: 'f1', origin: 'Dock', destination: 'Rack', distanceFt: 300, thruPerHr: 25,
      routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'cb18', transferMethodIdx: 0 },
    { id: 'f2', origin: 'Rack', destination: 'Line', distanceFt: 450, thruPerHr: 18,
      routeLayout: 'medium', liftHeightFt: 0, vehicleId: 'ebase7', transferMethodIdx: 0 },
  ],
} as unknown as StoredProject
```

- [ ] **Step 2: Implement in `RomKpis.tsx`**

```ts
// Utilization is of AVAILABLE time, not of the clock. raw/sold silently equals
// U × availability, so it carried charging downtime and then the Charging gauge
// reported the same hours again — and it contradicted the "Target utilization"
// driver next to it. Dividing out availability makes the strip partition the day:
// availability + charging = 100%, and utilization answers "of the time a vehicle
// COULD work, how much does it?"
let wRaw = 0, wCap = 0
for (const g of fleet.groups) {
  const A = g.charging.availability ?? 1
  wRaw += g.groupRaw
  wCap += g.fleetSold * A
}
const avgUtil = wCap > 0 ? wRaw / wCap : null
const avgAvailability = totalSold > 0
  ? fleet.groups.reduce((s, g) => s + (g.charging.availability ?? 1) * g.fleetSold, 0) / totalSold
  : 0
const avgCharging = 1 - avgAvailability
```

Update the Utilization gauge's `def` to "Share of the time a vehicle *could* work
that it does — charging downtime is excluded and shown separately." Also update
`kpiDetails.ts:109-110`, whose utilization bars use the same `groupRaw / fleetSold`.

- [ ] **Step 3: Run**

Run: `npx vitest run src/lib/__tests__/gaugeReconciliation.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "fix(dashboard): gauges partition the day instead of double-reporting charging"
```

---

### Task 7: Declare the new assumptions

**Files:**
- Modify: `src/components/rom/AssumptionsPanel.tsx:15-24`

Staggered charging and 1:1 chargers are now load-bearing. An assumption that
moves 11–16% of the fleet must be visible, not buried in a comment.

- [ ] **Step 1: Edit the Operations group**

Remove the break row if present. Add:

```ts
{ label: 'Charging', value: 'Staggered across the fleet', why: 'Vehicles are sent to charge before they run flat, so the fleet never queues for chargers at once. Availability is therefore the average over the staffed window. If charging were left to run in lockstep the figure would be the bare duty ratio — 11–16% more vehicles.', isDefault: true },
{ label: 'Chargers', value: 'One per vehicle', why: 'Dock contention is not modelled at this stage: every vehicle is assumed to have a charger available when it needs one. This is what makes staggered charging achievable.', isDefault: true },
{ label: 'Availability', value: 'min(1, [z·R + (H − z·R)·d] / H)', why: 'Per platform: d = runtime ÷ (runtime + recharge) is the duty ratio; z is how much of a full charge the off-shift window delivers (zero at 24/7). A vehicle works off its overnight charge, then settles into its duty ratio. Cutsheet hours — no DOD or efficiency derates, they are already in the measured hours.', isDefault: true },
{ label: 'Operator breaks', value: 'Fleet keeps working', why: 'Breaks are recorded for the proposal but do not reduce the staffed window or credit charging time — the fleet runs through them.', isDefault: true },
```

Delete the old `Charging` row (the `min(energy, capacity)` one) and change the
`Operating days / year` rationale from "Annualizes energy and labor" to
"Annualizes the labor offset."

- [ ] **Step 2: Verify visually**

Run the dev server, open Step 5, expand Assumptions. Confirm four Operations rows
and no stale `A_energy` text anywhere on the page.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs(ui): declare staggered charging and 1:1 chargers as assumptions"
```

---

### Task 8: Exports

**Files:**
- Modify: `src/lib/xlsxExport.ts:81-98`, `src/lib/pdfExport.ts` (fleet table), `src/lib/pptx/tables.ts:253,403`
- Test: `src/lib/__tests__/xlsxExport.test.ts`, `src/lib/__tests__/pdfExportFleet.test.ts`, `src/lib/pptx/__tests__/*`

- [ ] **Step 1: XLSX**

Headers `['Vehicle', 'Peak demand', 'Base fleet', 'Availability', 'Duty ratio', '+ Utilization', '+ Charging', 'Fleet sold']`.
Drop the `aEnergy`/`aCap` columns and the v3 composition comment at line 98;
replace with the additive build-up so the spreadsheet's own formulas sum.

- [ ] **Step 2: PDF + PPTX**

Wherever `totalChargingDelta` is printed as part of a build-up, print
`totalUtilizationDelta` beside it — the stages sum now and the documents should
show that. Keep the same table shapes; this is a label and one extra column.

- [ ] **Step 3: Run**

Run: `npx vitest run`
Expected: PASS after expectations are recomputed.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(exports): v4 fleet waterfall in XLSX/PDF/PPTX"
```

---

### Task 9: Documentation

**Files:**
- Modify: `ARCHITECTURE.md` (§3 gate/engine model), `docs/SPECIFICATION.md:360-400,745-770`, `docs/CHANGELOG.md`, `src/content/methodology.ts`
- Create: `docs/specs/2026-10-04-charging-model-v4-design.md`

- [ ] **Step 1: Write the design spec**

Record: the `aEnergy ≥ d` dominance proof; that the break credit existed to cover
`aCap`'s missing start-charge term; the owner decisions table; the staggered-vs-
lockstep 11–16% fork and why it is an assumption rather than a formula; the
1:1 charger assumption and the dock-contention gap it leaves open; and the
before/after fleet table.

- [ ] **Step 2: `methodology.ts`**

Replace the charging/buffer entries with the single v4 term and the additive
waterfall. Variables: `R`, `Ch`, `H`, `d`, `z`, `U`. Drop `A_energy`, `C`, and
every break symbol.

- [ ] **Step 3: `SPECIFICATION.md` + `ARCHITECTURE.md`**

Replace every `A = min(A_energy, A_cap)` and
`fleetSold = max(base, ⌈max(raw ÷ A_energy, raw × (1+buffer) ÷ A_cap)⌉)` with the
v4 forms. The three-stage story (Step 3 engineering / Step 4 physics / Step 5
policy) survives — Step 4 just has one term now.

- [ ] **Step 4: `CHANGELOG.md`**

Lead with the quoted-number impact: single-shift fleets fall up to 21%, 24/7
fleets rise up to 12%, two-shift is near-neutral. State plainly that any quote
regenerated after this ships will differ from one generated before it, and why
each direction is the correction.

- [ ] **Step 5: Full gates**

```bash
npx tsc --noEmit && npm run check:arch && npx vitest run && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: charging model v4 — one availability term"
```

---

## Open items this plan deliberately does NOT close

- **Dock contention.** 1:1 chargers is an assumption, not a finding. At 71 ebase7s
  the fleet needs ~21 simultaneous chargers; a site with 8 is constrained by the
  dock, not the battery, and nothing in the app would say so. Revisit when the
  owner wants charger count as an input.
- **`m10.runTimeHr` = 11.8 h implies 0.091 kW** from a 28 Ah × 48 V pack. That is
  not a working-duty figure, and `R` is the single most sensitive input in this
  model — a 2× error in it moves the fleet further than v3→v4 does. Placeholder
  register item; needs a cutsheet number.
- **`chargerType` on `8hbc40a` / `8tb50a`** says `shift_swap`; the owner confirms
  all six platforms are opportunity-charging. Display-only (method never touched
  the math), but it is a false statement about the products. One-line data fix,
  worth doing alongside.
- **Peak timing.** `A` is an average over the window, so it assumes peak demand is
  not concentrated in the window's weakest hour. Unknowable from current inputs.
