# ROM Dashboard Analytics — Data-Rich Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer a data-rich analytics surface onto the Step 4 ROM Dashboard — ~24 derived statistics (throughput/motion, fleet & utilization, energy & charging, labor & TCO, application envelope) computed **only** from data already collected in Steps 1–3 + the Fleet Engine, so the proposal reads as thorough engineering homework.

**Architecture:** One **pure** calc module `src/calc/romAnalytics.ts` turns the existing `FleetSummary` + per-flow `FlowDerived` + project schedule + the base `RomSummary` into a single `FleetAnalytics` struct (no new customer inputs except one assumption, `serviceLifeYears`). A `StatTile` primitive + five grouped section components render it. The dashboard page (from the base ROM plan) gains the analytics sections below the pricing/economics cards.

**Tech Stack:** TypeScript strict, Vitest (pure-calc TDD), React client components, Toyota Type tokens only, Imperial-first (miles derived from feet for display only).

**Depends on:** `docs/superpowers/plans/2026-06-07-rom-dashboard.md` (the base ROM Dashboard — provides `src/calc/rom.ts` `romSummary`, the `useFleetData` hook with `derivedByFlowId`, the step4 page, and the `operatingDaysPerYear` persisted assumption). Execute the base plan first.

---

## Tile Catalog (the spec — answers "what statistics should we show")

Every tile below is computable from data we already have. **E** = engineer-meaningful (sizing honesty), **C** = customer-impressive (big "did our homework" number). Formulas use existing fields; `effHr` = effective daily operating hours after breaks.

**Derived schedule basis (used throughout):**
- `effHoursPerShift = max(0, hoursPerShift − breaksPerShift × breakDurationMin/60)`
- `effDailyOpHr = min(24, shiftsPerDay × effHoursPerShift)`
- `operatingDaysPerYear` = the persisted assumption (default 312)

### Section A — Throughput & Motion *(proves we sized to the real work)*
| Tile | Formula | Source | Tag |
|---|---|---|---|
| Throughput demand | `Σ flow.thruPerHr` | Step 3 flows | E |
| Throughput coverage | `demand / requiredThroughputPerHour` | + Step 1 §5 | E |
| Daily move volume | `demand × effDailyOpHr` | flows + §4 | C |
| **Annual move volume** | `dailyMoves × operatingDaysPerYear` | | **C** |
| Daily travel distance | `Σ(thruPerHr × distanceFt×2) × effDailyOpHr / 5280` mi | flows | C |
| **Annual travel distance** | `dailyMiles × operatingDaysPerYear` | | **C** |
| Avg cycle time | throughput-weighted `Σ(thru×cycleSec)/Σthru` | FlowDerived | E |
| Flows mapped | `flows.length` | | E |
| Zones mapped | distinct `flow.sectionName` | | E |

### Section B — Fleet & Utilization *(proves the fleet isn't over/under-sized)*
| Tile | Formula | Source | Tag |
|---|---|---|---|
| Fleet sold | `totalFleetSold` | Fleet Engine | E/C |
| Base / +charging / buffer | `totalBaseFleet`, `totalChargingDelta`, `sold−(base+chg)` | | E |
| Base utilization | `ΣgroupRaw / totalBaseFleet` | | E |
| Provisioned utilization | `ΣgroupRaw / totalFleetSold` | | E |
| Spare capacity | `1 − provisionedUtilization` | | E |
| Moves per vehicle / hr | `demand / totalFleetSold` | | E |
| Avg vehicle availability | mean `group.charging.availability` | | E |

### Section C — Energy & Charging *(rich, from the Ah battery model)*
| Tile | Formula | Source | Tag |
|---|---|---|---|
| **Annual energy** | `rom.opex.annualEnergyKwh` | rom | **C** |
| Daily energy | `annualEnergyKwh / operatingDaysPerYear` | | C |
| Installed battery capacity | `Σ(ratedAh×voltageV/1000 × fleetSold)` kWh | vehicle JSON | C |
| Avg runtime / charge | mean `group.charging.runHr` | | E |
| Avg recharge time | mean `group.charging.chargeHr` | | E |
| Charge strategy mix | count opportunity vs plugged groups | | E |

### Section D — Labor & Total Cost of Ownership *(the ROI story)*
| Tile | Formula | Source | Tag |
|---|---|---|---|
| Operators automated | `operatorsPerShift × shiftsPerDay` | Step 1 §6 | C |
| Annual labor hours | `operators/shift × shifts × hoursPerShift × days` | | C |
| Annual labor offset | `rom.payback.annualLaborOffset` | rom | C |
| Annual OPEX | `rom.opex.annualOpex` | rom | E |
| **Simple payback** | `rom.payback.paybackYears` | rom | **C** |
| Service-life TCO | `capexMid + annualOpex × serviceLifeYears` | + assumption | E |
| **Cost per move** | `(capexMid/serviceLifeYears + annualOpex) / annualMoves` | | **E** |

### Section E — Application Envelope *(pure display — "we captured your requirements")*
Read-only chips straight from Step 1: load profile (`maxLoadWeightLbs`, `loadLengthIn×loadWidthIn×loadHeightIn`), max lift height, aisle width, floor condition, temperature envelope (`tempMinF`–`tempMaxF`, `outdoorRequired`, `freezerCapable`), schedule (`shiftsPerDay × hoursPerShift`, `operatingDaysPattern`), certifications count, interlocks count, WMS (`wmsRequired`/`wmsVendor`). No calc — a requirements summary that signals diligence.

---

## Rules in force
- **Spec-first** (Task 1). **Calc purity** — `src/calc/romAnalytics.ts` pure (type-only `Vehicle`/`Flow` imports OK). **Imperial-first** — feet stored; miles only a display conversion (`/5280`). **Toyota Type tokens** only. **Gate after every task:** `npx vitest run` + `npm run build` + purity grep + commit/push (message ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `docs/SPECIFICATION.md`, `docs/CHANGELOG.md` | Spec of record | Modify (Task 1) |
| `src/lib/validations/schemas.ts` | Add `serviceLifeYears` assumption | Modify (Task 2) |
| `src/calc/romAnalytics.ts` | Pure `FleetAnalytics` + helpers | Create (Tasks 3–5) |
| `src/calc/__tests__/romAnalytics.test.ts` | Unit tests | Create (Tasks 3–5) |
| `src/components/rom/StatTile.tsx` | Tile primitive + value formatters | Create (Task 6) |
| `src/components/rom/RomAnalytics.tsx` | Sections A–D from `FleetAnalytics` | Create (Task 7) |
| `src/components/rom/RomEnvelope.tsx` | Section E requirements chips | Create (Task 7) |
| `app/projects/[id]/step4/page.tsx` | Wire analytics into the dashboard | Modify (Task 8) |
| `app/globals.css` | `.rom-stat*` / `.rom-envelope*` styles | Modify (Task 9) |

---

### Task 1: Spec-first — document the tile catalog

**Files:**
- Modify: `docs/SPECIFICATION.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add the analytics catalog to the spec**

In `docs/SPECIFICATION.md`, under the Step 4 ROM Dashboard section (added by the base plan), append a subsection. Paste the entire **"Tile Catalog"** block from this plan (Sections A–E with their formula tables) verbatim, prefixed:

```markdown
### ROM Dashboard — Analytics Tiles

All tiles derive from data already collected in Steps 1–3 + the Fleet Engine; the only
new input is `serviceLifeYears` (default 7). Tags: **E** = engineer-meaningful,
**C** = customer-facing. Effective hours account for breaks:
`effDailyOpHr = min(24, shiftsPerDay × (hoursPerShift − breaksPerShift × breakDurationMin/60))`.

<paste Sections A–E tables here>
```

- [ ] **Step 2: Add a CHANGELOG entry**

Top of the latest section in `docs/CHANGELOG.md`:

```markdown
### Added
- ROM Dashboard analytics: ~24 derived statistics across throughput/motion, fleet &
  utilization, energy & charging, labor & TCO, plus an application-envelope requirements
  summary — all computed from existing Step 1–3 + Fleet Engine data. New pure calc module
  `src/calc/romAnalytics.ts`; one new persisted assumption `serviceLifeYears` (default 7).
```

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: spec ROM Dashboard analytics tile catalog (A–E)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Persist `serviceLifeYears` assumption

**Files:**
- Modify: `src/lib/validations/schemas.ts` (after `operatingDaysPerYear`, added by the base plan)
- Test: `src/calc/__tests__/romAnalytics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/calc/__tests__/romAnalytics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { projectSchema } from '@/src/lib/validations/schemas'

describe('serviceLifeYears default', () => {
  it('defaults to 7 when absent', () => {
    expect(projectSchema.parse({}).serviceLifeYears).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts`
Expected: FAIL — `serviceLifeYears` is `undefined`.

- [ ] **Step 3: Add the field**

In `src/lib/validations/schemas.ts`, directly after the `operatingDaysPerYear` line (added in the base plan's ROM economic-assumptions block):

```ts
  /** Equipment service life (yr) used for TCO and cost-per-move amortization. */
  serviceLifeYears: z.number().int().min(1).max(20).default(7),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/schemas.ts src/calc/__tests__/romAnalytics.test.ts
git commit -m "feat(rom): persist serviceLifeYears assumption (default 7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Throughput & motion analytics (pure calc)

**Files:**
- Create: `src/calc/romAnalytics.ts`
- Test: `src/calc/__tests__/romAnalytics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/romAnalytics.test.ts`:

```ts
import { motionStats, type AnalyticsSchedule } from '../romAnalytics'
import type { Flow, FlowDerived } from '../types'

function flow(id: string, thruPerHr: number, distanceFt: number, vehicleId = 'a'): Flow {
  return { id, origin: '', destination: '', distanceFt, thruPerHr, routeLayout: 'medium', liftHeightFt: 0, vehicleId, sectionName: 'Z1' }
}
function derived(cycleSeconds: number | null): FlowDerived {
  return { cycleSeconds, rawVehicles: 0.5, breakdown: null }
}

const sched: AnalyticsSchedule = {
  shiftsPerDay: 2, hoursPerShift: 8, breaksPerShift: 2, breakDurationMin: 15,
  operatorsPerShift: 3, operatingDaysPerYear: 250,
}
// effHoursPerShift = 8 − 2×15/60 = 7.5 ; effDailyOpHr = 2 × 7.5 = 15

describe('motionStats', () => {
  it('computes effective hours, daily/annual moves, miles, weighted cycle, coverage', () => {
    const flows = [flow('f1', 100, 200), flow('f2', 50, 100)] // demand 150
    const dByF = new Map<string, FlowDerived>([['f1', derived(60)], ['f2', derived(120)]])
    const m = motionStats(flows, dByF, sched, 120) // required 120
    expect(m.effDailyOpHr).toBeCloseTo(15, 5)
    expect(m.throughputDemandPerHr).toBe(150)
    expect(m.throughputCoverage).toBeCloseTo(150 / 120, 5)
    expect(m.dailyMoves).toBeCloseTo(150 * 15, 5)            // 2250
    expect(m.annualMoves).toBeCloseTo(2250 * 250, 5)         // 562500
    // daily ft/hr = 100×400 + 50×200 = 50000 ; ×15 h /5280 = 142.045 mi
    expect(m.dailyTravelMiles).toBeCloseTo(50000 * 15 / 5280, 3)
    expect(m.annualTravelMiles).toBeCloseTo((50000 * 15 / 5280) * 250, 2)
    // weighted cycle = (100×60 + 50×120)/150 = 80
    expect(m.avgCycleSec).toBeCloseTo(80, 5)
    expect(m.flowsMapped).toBe(2)
    expect(m.zonesMapped).toBe(1)
  })

  it('null coverage when no required throughput; null cycle when none derived', () => {
    const m = motionStats([flow('f1', 0, 0)], new Map([['f1', derived(null)]]), sched, null)
    expect(m.throughputCoverage).toBeNull()
    expect(m.avgCycleSec).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts -t motionStats`
Expected: FAIL — `Cannot find module '../romAnalytics'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/calc/romAnalytics.ts`:

```ts
// src/calc/romAnalytics.ts — derived ROM dashboard statistics. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only Flow/FlowDerived/Vehicle imports.)
import type { Flow, FlowDerived } from './types'

const FT_PER_MILE = 5280

export interface AnalyticsSchedule {
  shiftsPerDay: number
  hoursPerShift: number
  breaksPerShift: number
  breakDurationMin: number
  operatorsPerShift: number
  operatingDaysPerYear: number
}

export interface MotionStats {
  effDailyOpHr: number
  throughputDemandPerHr: number
  throughputCoverage: number | null
  dailyMoves: number
  annualMoves: number
  dailyTravelMiles: number
  annualTravelMiles: number
  avgCycleSec: number | null
  flowsMapped: number
  zonesMapped: number
}

/** Effective daily operating hours after breaks, capped at 24. */
export function effDailyOpHr(s: AnalyticsSchedule): number {
  const effHoursPerShift = Math.max(0, s.hoursPerShift - (s.breaksPerShift * s.breakDurationMin) / 60)
  return Math.min(24, s.shiftsPerDay * effHoursPerShift)
}

/** Throughput, move volumes, travel distance, weighted cycle time. Distance is
 *  round-trip (distanceFt × 2 per cycle). Miles are a display conversion only. */
export function motionStats(
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
  schedule: AnalyticsSchedule,
  requiredThroughputPerHr: number | null,
): MotionStats {
  const hr = effDailyOpHr(schedule)
  const demand = flows.reduce((s, f) => s + (f.thruPerHr || 0), 0)

  let dailyFtPerHr = 0
  let cycleWeighted = 0
  let cycleWeight = 0
  const zones = new Set<string>()
  for (const f of flows) {
    dailyFtPerHr += (f.thruPerHr || 0) * (f.distanceFt || 0) * 2
    const d = derivedByFlowId.get(f.id)
    if (d?.cycleSeconds != null && (f.thruPerHr || 0) > 0) {
      cycleWeighted += (f.thruPerHr || 0) * d.cycleSeconds
      cycleWeight += f.thruPerHr || 0
    }
    if (f.sectionName) zones.add(f.sectionName)
  }

  const dailyMoves = demand * hr
  const dailyTravelMiles = (dailyFtPerHr * hr) / FT_PER_MILE
  return {
    effDailyOpHr: hr,
    throughputDemandPerHr: demand,
    throughputCoverage: requiredThroughputPerHr && requiredThroughputPerHr > 0 ? demand / requiredThroughputPerHr : null,
    dailyMoves,
    annualMoves: dailyMoves * schedule.operatingDaysPerYear,
    dailyTravelMiles,
    annualTravelMiles: dailyTravelMiles * schedule.operatingDaysPerYear,
    avgCycleSec: cycleWeight > 0 ? cycleWeighted / cycleWeight : null,
    flowsMapped: flows.length,
    zonesMapped: zones.size,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts -t motionStats`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/romAnalytics.ts src/calc/__tests__/romAnalytics.test.ts
git commit -m "feat(rom): motionStats — throughput, move volume, travel miles, cycle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: Fleet/utilization + energy/charging analytics (pure calc)

**Files:**
- Modify: `src/calc/romAnalytics.ts`
- Test: `src/calc/__tests__/romAnalytics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/romAnalytics.test.ts`:

```ts
import { fleetStats, energyStats } from '../romAnalytics'
import type { FleetSummary } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

function vstub(id: string, ratedAh: number, voltageV: number, dischargeA: number): Vehicle {
  return { id, priceRange: { minUsd: 0, maxUsd: 0 }, calc: { ratedAh, voltageV, dischargeA, chargeA: 100 } } as unknown as Vehicle
}
function summary(groups: Array<{ vehicleId: string; groupRaw: number; baseFleet: number; fleetSold: number; availability: number | null; runHr: number | null; chargeHr: number | null; method: 'opportunity' | 'plugged' }>): FleetSummary {
  return {
    groups: groups.map(g => ({
      vehicleId: g.vehicleId, groupRaw: g.groupRaw, baseFleet: g.baseFleet,
      charging: { method: g.method, runHr: g.runHr, chargeHr: g.chargeHr, availability: g.availability, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: g.fleetSold, fleetSold: g.fleetSold,
    })),
    totalBaseFleet: groups.reduce((s, g) => s + g.baseFleet, 0),
    totalChargingDelta: 0,
    totalFleetSold: groups.reduce((s, g) => s + g.fleetSold, 0),
    bufferPct: 0.1,
  }
}

describe('fleetStats', () => {
  it('computes utilization, spare capacity, moves/veh, avg availability', () => {
    const f = summary([
      { vehicleId: 'a', groupRaw: 2.4, baseFleet: 3, fleetSold: 4, availability: 0.8, runHr: 5, chargeHr: 5, method: 'plugged' },
      { vehicleId: 'b', groupRaw: 1.5, baseFleet: 2, fleetSold: 2, availability: 0.5, runHr: 3, chargeHr: 9, method: 'opportunity' },
    ])
    const s = fleetStats(f, 150) // demand 150/hr
    expect(s.baseUtilizationPct).toBeCloseTo((2.4 + 1.5) / 5, 5)       // raw/base
    expect(s.provisionedUtilizationPct).toBeCloseTo((2.4 + 1.5) / 6, 5) // raw/sold
    expect(s.spareCapacityPct).toBeCloseTo(1 - (3.9 / 6), 5)
    expect(s.movesPerVehiclePerHr).toBeCloseTo(150 / 6, 5)
    expect(s.avgAvailabilityPct).toBeCloseTo((0.8 + 0.5) / 2, 5)
  })
})

describe('energyStats', () => {
  it('sums installed kWh and counts charge strategies; daily = annual/days', () => {
    const vById = new Map([['a', vstub('a', 500, 48, 100)], ['b', vstub('b', 250, 24, 80)]])
    const f = summary([
      { vehicleId: 'a', groupRaw: 1, baseFleet: 1, fleetSold: 2, availability: 1, runHr: 6, chargeHr: 4, method: 'plugged' },
      { vehicleId: 'b', groupRaw: 1, baseFleet: 1, fleetSold: 1, availability: 1, runHr: 2, chargeHr: 8, method: 'opportunity' },
    ])
    // installed = (500×48/1000×2) + (250×24/1000×1) = 48 + 6 = 54 kWh
    const e = energyStats(f, vById, 9000, 250) // annualEnergyKwh=9000, days=250
    expect(e.installedBatteryKwh).toBeCloseTo(54, 5)
    expect(e.annualEnergyKwh).toBe(9000)
    expect(e.dailyEnergyKwh).toBeCloseTo(36, 5)
    expect(e.opportunityCount).toBe(1)
    expect(e.pluggedCount).toBe(1)
    expect(e.avgRunHr).toBeCloseTo((6 + 2) / 2, 5)
    expect(e.avgChargeHr).toBeCloseTo((4 + 8) / 2, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts -t "fleetStats|energyStats"`
Expected: FAIL — `fleetStats is not exported`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calc/romAnalytics.ts`:

```ts
import type { FleetSummary } from './types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export interface FleetStats {
  baseUtilizationPct: number | null
  provisionedUtilizationPct: number | null
  spareCapacityPct: number | null
  movesPerVehiclePerHr: number | null
  avgAvailabilityPct: number | null
}

/** Utilization (raw demand vs provisioned), spare capacity, intensity, availability. */
export function fleetStats(fleet: FleetSummary, throughputDemandPerHr: number): FleetStats {
  const totalRaw = fleet.groups.reduce((s, g) => s + g.groupRaw, 0)
  const avail = fleet.groups.map(g => g.charging.availability).filter((a): a is number => a != null)
  const base = fleet.totalBaseFleet
  const sold = fleet.totalFleetSold
  const provisioned = sold > 0 ? totalRaw / sold : null
  return {
    baseUtilizationPct: base > 0 ? totalRaw / base : null,
    provisionedUtilizationPct: provisioned,
    spareCapacityPct: provisioned == null ? null : 1 - provisioned,
    movesPerVehiclePerHr: sold > 0 ? throughputDemandPerHr / sold : null,
    avgAvailabilityPct: avail.length > 0 ? avail.reduce((s, a) => s + a, 0) / avail.length : null,
  }
}

export interface EnergyStats {
  installedBatteryKwh: number
  dailyEnergyKwh: number
  annualEnergyKwh: number
  avgRunHr: number | null
  avgChargeHr: number | null
  opportunityCount: number
  pluggedCount: number
}

/** Installed battery capacity (Σ kWh × fleetSold), energy split, charge-strategy mix.
 *  annualEnergyKwh is passed through from rom.opex to stay consistent with OPEX. */
export function energyStats(
  fleet: FleetSummary,
  vehiclesById: Map<string, Vehicle>,
  annualEnergyKwh: number,
  operatingDaysPerYear: number,
): EnergyStats {
  let installedBatteryKwh = 0
  let opportunityCount = 0
  let pluggedCount = 0
  const runs: number[] = []
  const charges: number[] = []
  for (const g of fleet.groups) {
    const veh = vehiclesById.get(g.vehicleId)
    if (veh) installedBatteryKwh += (veh.calc.ratedAh * veh.calc.voltageV / 1000) * g.fleetSold
    if (g.charging.method === 'opportunity') opportunityCount++; else pluggedCount++
    if (g.charging.runHr != null) runs.push(g.charging.runHr)
    if (g.charging.chargeHr != null) charges.push(g.charging.chargeHr)
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  return {
    installedBatteryKwh,
    annualEnergyKwh,
    dailyEnergyKwh: operatingDaysPerYear > 0 ? annualEnergyKwh / operatingDaysPerYear : 0,
    avgRunHr: mean(runs),
    avgChargeHr: mean(charges),
    opportunityCount,
    pluggedCount,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts -t "fleetStats|energyStats"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/romAnalytics.ts src/calc/__tests__/romAnalytics.test.ts
git commit -m "feat(rom): fleetStats (utilization) + energyStats (kWh, charge mix)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Labor/TCO + `fleetAnalytics` aggregator (pure calc)

**Files:**
- Modify: `src/calc/romAnalytics.ts`
- Test: `src/calc/__tests__/romAnalytics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/romAnalytics.test.ts`:

```ts
import { laborTcoStats, fleetAnalytics } from '../romAnalytics'
import type { RomSummary } from '../rom'

const rom: RomSummary = {
  pricing: { lines: [], totalMin: 800000, totalMax: 1200000, totalMid: 1000000 },
  opex: { annualEnergyKwh: 9000, annualEnergyCost: 1000, annualMaintenance: 80000, annualOpex: 81000 },
  payback: { annualLaborOffset: 300000, netAnnualBenefit: 219000, paybackYears: 1000000 / 219000 },
}

describe('laborTcoStats', () => {
  it('computes operators, labor hours, TCO, and cost per move', () => {
    const t = laborTcoStats(rom, sched, 7, 562500) // serviceLife 7yr, annualMoves 562500
    expect(t.operatorsAcrossShifts).toBe(3 * 2)                 // operators/shift × shifts
    expect(t.annualLaborHours).toBeCloseTo(3 * 2 * 8 * 250, 5)  // 12000
    expect(t.tcoUsd).toBeCloseTo(1000000 + 81000 * 7, 5)        // 1,567,000
    // costPerMove = (1000000/7 + 81000) / 562500
    expect(t.costPerMoveUsd).toBeCloseTo((1000000 / 7 + 81000) / 562500, 6)
  })

  it('null cost per move when no moves', () => {
    expect(laborTcoStats(rom, sched, 7, 0).costPerMoveUsd).toBeNull()
  })
})

describe('fleetAnalytics', () => {
  it('assembles all sections into one struct', () => {
    const flows = [flow('f1', 100, 200), flow('f2', 50, 100)]
    const dByF = new Map<string, FlowDerived>([['f1', derived(60)], ['f2', derived(120)]])
    const f = summary([{ vehicleId: 'a', groupRaw: 2, baseFleet: 2, fleetSold: 3, availability: 0.8, runHr: 5, chargeHr: 5, method: 'plugged' }])
    const vById = new Map([['a', vstub('a', 500, 48, 100)]])
    const a = fleetAnalytics({ fleet: f, flows, derivedByFlowId: dByF, vehiclesById: vById, rom, schedule: sched, requiredThroughputPerHr: 120, serviceLifeYears: 7 })
    expect(a.motion.throughputDemandPerHr).toBe(150)
    expect(a.fleet.movesPerVehiclePerHr).toBeCloseTo(150 / 3, 5)
    expect(a.energy.annualEnergyKwh).toBe(9000)
    expect(a.labor.tcoUsd).toBeCloseTo(1000000 + 81000 * 7, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts -t "laborTcoStats|fleetAnalytics"`
Expected: FAIL — `laborTcoStats is not exported`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calc/romAnalytics.ts`:

```ts
import type { RomSummary } from './rom'

export interface LaborTcoStats {
  operatorsPerShift: number
  operatorsAcrossShifts: number
  annualLaborHours: number
  annualLaborOffsetUsd: number
  annualOpexUsd: number
  serviceLifeYears: number
  tcoUsd: number
  costPerMoveUsd: number | null
}

/** Labor automated + lifecycle cost. TCO = CAPEX mid + OPEX × life. Cost per move =
 *  (amortized CAPEX/yr + annual OPEX) / annual moves. */
export function laborTcoStats(
  rom: RomSummary,
  schedule: AnalyticsSchedule,
  serviceLifeYears: number,
  annualMoves: number,
): LaborTcoStats {
  const capexMid = rom.pricing.totalMid
  const annualOpexUsd = rom.opex.annualOpex
  const annualCapexAmortized = serviceLifeYears > 0 ? capexMid / serviceLifeYears : capexMid
  return {
    operatorsPerShift: schedule.operatorsPerShift,
    operatorsAcrossShifts: schedule.operatorsPerShift * schedule.shiftsPerDay,
    annualLaborHours: schedule.operatorsPerShift * schedule.shiftsPerDay * schedule.hoursPerShift * schedule.operatingDaysPerYear,
    annualLaborOffsetUsd: rom.payback.annualLaborOffset,
    annualOpexUsd,
    serviceLifeYears,
    tcoUsd: capexMid + annualOpexUsd * serviceLifeYears,
    costPerMoveUsd: annualMoves > 0 ? (annualCapexAmortized + annualOpexUsd) / annualMoves : null,
  }
}

export interface FleetAnalytics {
  motion: MotionStats
  fleet: FleetStats
  energy: EnergyStats
  labor: LaborTcoStats
}

export interface FleetAnalyticsInput {
  fleet: FleetSummary
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  vehiclesById: Map<string, Vehicle>
  rom: RomSummary
  schedule: AnalyticsSchedule
  requiredThroughputPerHr: number | null
  serviceLifeYears: number
}

/** One call for the dashboard — every derived statistic, all from existing data. */
export function fleetAnalytics(i: FleetAnalyticsInput): FleetAnalytics {
  const motion = motionStats(i.flows, i.derivedByFlowId, i.schedule, i.requiredThroughputPerHr)
  const fleet = fleetStats(i.fleet, motion.throughputDemandPerHr)
  const energy = energyStats(i.fleet, i.vehiclesById, i.rom.opex.annualEnergyKwh, i.schedule.operatingDaysPerYear)
  const labor = laborTcoStats(i.rom, i.schedule, i.serviceLifeYears, motion.annualMoves)
  return { motion, fleet, energy, labor }
}
```

- [ ] **Step 4: Run full suite + purity grep**

```bash
npx vitest run
grep -rE "from 'react'|localStorage|from 'fs'" src/calc/romAnalytics.ts   # expect: no matches
npm run build
```

Expected: all tests PASS; no purity matches; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/calc/romAnalytics.ts src/calc/__tests__/romAnalytics.test.ts
git commit -m "feat(rom): laborTcoStats + fleetAnalytics aggregator (all tiles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: `StatTile` primitive + formatters

**Files:**
- Create: `src/components/rom/StatTile.tsx`

- [ ] **Step 1: Create the tile + formatters**

```tsx
'use client'

import type { ReactNode } from 'react'

/** Compact value formatters for dashboard tiles. */
export const fmtInt = (n: number) => Math.round(n).toLocaleString()
export const fmtNum = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d })
export const fmtPct = (f: number | null) => (f == null ? '—' : `${Math.round(f * 100)}%`)
export const fmtBig = (n: number) =>
  n >= 1_000_000 ? `${fmtNum(n / 1_000_000, 1)}M`
  : n >= 1_000 ? `${fmtNum(n / 1_000, 1)}K`
  : fmtInt(n)
export const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${fmtNum(n / 1_000_000, 2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`
export const fmtHr = (h: number | null) => (h == null ? '—' : `${fmtNum(h, 1)} h`)

interface Props {
  label: string
  value: ReactNode
  sub?: string
  accent?: boolean
}

/** One dashboard statistic. Value is monospace tabular; label is an uppercase eyebrow. */
export default function StatTile({ label, value, sub, accent }: Props) {
  return (
    <div className={`rom-stat${accent ? ' rom-stat-accent' : ''}`}>
      <span className="rom-stat-val mono">{value}</span>
      <span className="rom-stat-lbl">{label}</span>
      {sub && <span className="rom-stat-sub">{sub}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: clean (unused so far).

- [ ] **Step 3: Commit**

```bash
git add src/components/rom/StatTile.tsx
git commit -m "feat(rom): StatTile primitive + value formatters

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: `RomAnalytics` (Sections A–D) + `RomEnvelope` (Section E)

**Files:**
- Create: `src/components/rom/RomAnalytics.tsx`
- Create: `src/components/rom/RomEnvelope.tsx`

- [ ] **Step 1: Create the analytics sections**

```tsx
'use client'

import type { FleetAnalytics } from '@/src/calc/romAnalytics'
import StatTile, { fmtInt, fmtBig, fmtNum, fmtPct, fmtUsd, fmtHr } from './StatTile'

interface Props { a: FleetAnalytics }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rom-stat-section">
      <span className="rom-card-eyebrow">{title}</span>
      <div className="rom-stat-grid">{children}</div>
    </section>
  )
}

/** Sections A–D of the data-rich dashboard, from a FleetAnalytics struct. */
export default function RomAnalytics({ a }: Props) {
  return (
    <>
      <Section title="Throughput & motion">
        <StatTile label="Throughput demand" value={`${fmtInt(a.motion.throughputDemandPerHr)} / hr`} accent />
        <StatTile label="Throughput coverage" value={fmtPct(a.motion.throughputCoverage)} sub="of required" />
        <StatTile label="Daily moves" value={fmtBig(a.motion.dailyMoves)} />
        <StatTile label="Annual moves" value={fmtBig(a.motion.annualMoves)} accent />
        <StatTile label="Daily travel" value={`${fmtNum(a.motion.dailyTravelMiles)} mi`} />
        <StatTile label="Annual travel" value={`${fmtBig(a.motion.annualTravelMiles)} mi`} accent />
        <StatTile label="Avg cycle time" value={a.motion.avgCycleSec == null ? '—' : `${Math.round(a.motion.avgCycleSec)}s`} />
        <StatTile label="Flows mapped" value={fmtInt(a.motion.flowsMapped)} sub={`${a.motion.zonesMapped} zones`} />
      </Section>

      <Section title="Fleet & utilization">
        <StatTile label="Base utilization" value={fmtPct(a.fleet.baseUtilizationPct)} accent />
        <StatTile label="Provisioned utilization" value={fmtPct(a.fleet.provisionedUtilizationPct)} sub="incl. buffer" />
        <StatTile label="Spare capacity" value={fmtPct(a.fleet.spareCapacityPct)} />
        <StatTile label="Moves / vehicle / hr" value={a.fleet.movesPerVehiclePerHr == null ? '—' : fmtNum(a.fleet.movesPerVehiclePerHr)} />
        <StatTile label="Avg availability" value={fmtPct(a.fleet.avgAvailabilityPct)} />
      </Section>

      <Section title="Energy & charging">
        <StatTile label="Annual energy" value={`${fmtBig(a.energy.annualEnergyKwh)} kWh`} accent />
        <StatTile label="Daily energy" value={`${fmtBig(a.energy.dailyEnergyKwh)} kWh`} />
        <StatTile label="Installed battery" value={`${fmtBig(a.energy.installedBatteryKwh)} kWh`} />
        <StatTile label="Avg runtime / charge" value={fmtHr(a.energy.avgRunHr)} />
        <StatTile label="Avg recharge" value={fmtHr(a.energy.avgChargeHr)} />
        <StatTile label="Charge strategy" value={`${a.energy.opportunityCount} opp · ${a.energy.pluggedCount} plug`} />
      </Section>

      <Section title="Labor & total cost of ownership">
        <StatTile label="Operators automated" value={fmtInt(a.labor.operatorsAcrossShifts)} sub="across shifts" accent />
        <StatTile label="Annual labor hours" value={fmtBig(a.labor.annualLaborHours)} />
        <StatTile label="Annual labor offset" value={fmtUsd(a.labor.annualLaborOffsetUsd)} />
        <StatTile label="Annual OPEX" value={fmtUsd(a.labor.annualOpexUsd)} />
        <StatTile label={`${a.labor.serviceLifeYears}-yr TCO`} value={fmtUsd(a.labor.tcoUsd)} />
        <StatTile label="Cost per move" value={a.labor.costPerMoveUsd == null ? '—' : `$${fmtNum(a.labor.costPerMoveUsd, 2)}`} accent />
      </Section>
    </>
  )
}
```

- [ ] **Step 2: Create the envelope (Section E)**

`RomEnvelope` reads project fields directly — no calc. It signals "we captured your requirements."

```tsx
'use client'

import type { StoredProject } from '@/src/lib/storage'

interface Props { project: StoredProject }

const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v))

/** Application-envelope chips: a read-only requirements summary from Step 1. */
export default function RomEnvelope({ project: p }: Props) {
  const dims = [p.loadLengthIn, p.loadWidthIn, p.loadHeightIn].every(x => x != null)
    ? `${p.loadLengthIn}×${p.loadWidthIn}×${p.loadHeightIn} in` : '—'
  const temp = p.tempMinF != null || p.tempMaxF != null
    ? `${p.tempMinF ?? '—'}–${p.tempMaxF ?? '—'} °F` : '—'
  const env = [p.outdoorRequired ? 'Outdoor' : null, p.freezerCapable ? 'Freezer' : null].filter(Boolean).join(' · ') || 'Indoor'
  const schedule = p.shiftsPerDay && p.hoursPerShift ? `${p.shiftsPerDay} × ${p.hoursPerShift} h` : '—'

  const chips: Array<[string, string]> = [
    ['Max load', p.maxLoadWeightLbs ? `${p.maxLoadWeightLbs.toLocaleString()} lbs` : '—'],
    ['Load size', dims],
    ['Max lift', p.maxLiftHeightFt != null ? `${p.maxLiftHeightFt} ft` : '—'],
    ['Min aisle', p.minAisleWidthFt ? `${p.minAisleWidthFt} ft` : '—'],
    ['Floor', dash(p.floorCondition)],
    ['Schedule', schedule],
    ['Days', dash(p.operatingDaysPattern)],
    ['Temp', temp],
    ['Environment', env],
    ['Certifications', String((p.certifications ?? []).length)],
    ['Interlocks', String((p.interlocks ?? []).length)],
    ['WMS', p.wmsRequired ? dash(p.wmsVendor) || 'Required' : 'None'],
  ]

  return (
    <section className="rom-card">
      <span className="rom-card-eyebrow">Application envelope</span>
      <div className="rom-envelope">
        {chips.map(([k, v]) => (
          <div key={k} className="rom-env-chip">
            <span className="rom-env-k">{k}</span>
            <span className="rom-env-v">{v}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/rom/RomAnalytics.tsx src/components/rom/RomEnvelope.tsx
git commit -m "feat(rom): RomAnalytics sections A–D + RomEnvelope requirements summary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 8: Wire analytics into the Step 4 page

**Files:**
- Modify: `app/projects/[id]/step4/page.tsx` (from the base ROM plan)

- [ ] **Step 1: Compute analytics and render the sections**

In `app/projects/[id]/step4/page.tsx`, add imports near the other `rom` imports:

```tsx
import { fleetAnalytics, type AnalyticsSchedule } from '@/src/calc/romAnalytics'
import RomAnalytics from '@/src/components/rom/RomAnalytics'
import RomEnvelope from '@/src/components/rom/RomEnvelope'
```

Pull `derivedByFlowId` from the hook (it is already returned by `useFleetData`):

```tsx
  const { project, setProject, vehicleById, loading, error, flows, derivedByFlowId, fleet, settings } = useFleetData(id)
```

After the existing `rom` memo, add:

```tsx
  const analyticsSchedule: AnalyticsSchedule = useMemo(() => ({
    shiftsPerDay: project?.shiftsPerDay ?? 1,
    hoursPerShift: project?.hoursPerShift ?? 8,
    breaksPerShift: project?.breaksPerShift ?? 0,
    breakDurationMin: project?.breakDurationMin ?? 0,
    operatorsPerShift: project?.operatorsPerShift ?? 0,
    operatingDaysPerYear: project?.operatingDaysPerYear ?? 312,
  }), [project])

  const analytics = useMemo(() => fleetAnalytics({
    fleet, flows, derivedByFlowId, vehiclesById: vehicleById, rom,
    schedule: analyticsSchedule,
    requiredThroughputPerHr: project?.requiredThroughputPerHour ?? null,
    serviceLifeYears: project?.serviceLifeYears ?? 7,
  }), [fleet, flows, derivedByFlowId, vehicleById, rom, analyticsSchedule, project])
```

Then, in the JSX, **after** the `rom-grid` section (pricing + economics) and **before** the export card, insert:

```tsx
        <RomAnalytics a={analytics} />
        <RomEnvelope project={project} />
```

- [ ] **Step 2: Build + run dev to verify**

```bash
npm run build
```

Expected: clean; the dashboard now renders the four stat sections + envelope.

- [ ] **Step 3: Commit**

```bash
git add app/projects/\[id\]/step4/page.tsx
git commit -m "feat(rom): render analytics sections + envelope on the ROM dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 9: Analytics styles

**Files:**
- Modify: `app/globals.css` (append after the `/* ─── ROM Dashboard ─── */` block from the base plan)

- [ ] **Step 1: Add the styles**

```css
/* ─── ROM Dashboard analytics tiles ─── */
.rom-stat-section { margin-bottom: 18px; }
.rom-stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
}
@media (max-width: 1000px) { .rom-stat-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 720px)  { .rom-stat-grid { grid-template-columns: repeat(2, 1fr); } }
.rom-stat {
  display: flex; flex-direction: column; gap: 3px;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 13px 15px;
}
.rom-stat-accent { border-color: var(--accent); background: var(--accent-soft); }
.rom-stat-val {
  font-family: var(--tal-font-numeric); font-variant-numeric: tabular-nums;
  font-size: 19px; font-weight: 800; line-height: 1.05; color: var(--text-primary);
}
.rom-stat-accent .rom-stat-val { color: var(--accent); }
.rom-stat-lbl {
  font-family: var(--tal-font-numeric); font-size: 9px; font-weight: 700;
  letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-tertiary);
}
.rom-stat-sub { font-family: var(--tal-font-family); font-size: 10.5px; color: var(--text-tertiary); }

.rom-envelope {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
}
@media (max-width: 1000px) { .rom-envelope { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 720px)  { .rom-envelope { grid-template-columns: repeat(2, 1fr); } }
.rom-env-chip {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px; border-radius: 9px;
  background: var(--bg-surface-2); border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.rom-env-k {
  font-family: var(--tal-font-numeric); font-size: 8.5px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary);
}
.rom-env-v { font-family: var(--tal-font-family); font-size: 13px; font-weight: 600; color: var(--text-primary); }
```

- [ ] **Step 2: Verify served CSS (proven dev-server method)**

```bash
pkill -9 -f next-server; lsof -ti tcp:3000 | xargs -r kill -9
lsof -ti tcp:3000 >/dev/null 2>&1 && echo "PORT BUSY" || echo "PORT FREE"
rm -rf .next
npm run dev > /tmp/tal-dev.log 2>&1 &
CSS=$(curl -s http://localhost:3000/ | grep -oE '/_next/static/[^"]+\.css' | head -1)
curl -s "http://localhost:3000$CSS" | grep -oE 'rom-stat-grid|rom-env-chip' | sort -u
```

Expected: `PORT FREE`, then `rom-env-chip`, `rom-stat-grid`.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(rom): analytics tile + envelope styles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

**Spec coverage** (Tile Catalog A–E):
- *A Throughput & motion* → Task 3 `motionStats` + Task 7 Section A. ✓
- *B Fleet & utilization* → Task 4 `fleetStats` + Task 7 Section B. ✓
- *C Energy & charging* → Task 4 `energyStats` + Task 7 Section C. ✓
- *D Labor & TCO* → Task 5 `laborTcoStats` + Task 7 Section D. ✓
- *E Application envelope* → Task 7 `RomEnvelope` (pure project-field display). ✓
- *New assumption serviceLifeYears* → Task 2. ✓

**Placeholder scan:** every code step has complete code; all formulas use real fields. No "TBD"/"handle edge cases"/"similar to" present.

**Type consistency:** `AnalyticsSchedule`, `MotionStats`, `FleetStats`, `EnergyStats`, `LaborTcoStats`, `FleetAnalytics`, `FleetAnalyticsInput` are defined in Tasks 3–5 and consumed with identical names in Tasks 7–8. `fleetAnalytics({ fleet, flows, derivedByFlowId, vehiclesById, rom, schedule, requiredThroughputPerHr, serviceLifeYears })` keys match the page call in Task 8. `energyStats` is fed `rom.opex.annualEnergyKwh` (consistent with the base OPEX, no double-modeling). Vehicle fields (`calc.ratedAh`, `calc.voltageV`, `calc.dischargeA`, `priceRange`) match `vehicleLibrary.ts`. `RomSummary` shape matches the base plan's `src/calc/rom.ts`.

**Scope:** one pure calc module, two display components, one page wiring, one CSS block — cohesive, independently testable, depends only on the base ROM plan.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-07-rom-dashboard-analytics.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute here with checkpoints.

**Which approach?** (Note: execute the base ROM Dashboard plan first — this one builds on its `romSummary`, `useFleetData`, step4 page, and `operatingDaysPerYear` assumption.)
