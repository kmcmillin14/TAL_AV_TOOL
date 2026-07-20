# ROM Dashboard Visual & Sales Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stacked sequence of pure-SVG visual sections to the Step 4 ROM Dashboard — flow diagram, fleet duty-cycle, utilization, charging summary, battery state-of-charge, CAPEX range bars, payback curve, TCO stack, requirements-met matrix, sensitivity/resilience, and an assumptions panel — all from existing data.

**Architecture:** Strict **data/render split**. Pure shape functions in `src/calc/romCharts.ts` + `src/calc/romSensitivity.ts` turn engine data into render-agnostic `series` objects (unit-tested). Thin SVG components in `src/components/rom/charts/` render those series. The same series later feed PptxGenJS native charts in the deck; Recharts stays a cheap per-chart swap. A shared `appRequirementsFromProject` helper (extracted from `pdfExport.ts`) feeds the existing pure `qualifyVehicle` for the requirements matrix.

**Tech Stack:** TypeScript strict, Vitest (pure-calc TDD), React client SVG components, Toyota Type tokens only, Imperial-first. No new runtime dependency.

**Depends on:** `docs/superpowers/plans/2026-06-07-rom-dashboard.md` (step4 page, `romSummary`, `useFleetData` with `derivedByFlowId`) and `docs/superpowers/plans/2026-06-07-rom-dashboard-analytics.md` (`fleetAnalytics`, `AnalyticsSchedule`, `serviceLifeYears`). Execute those first.

---

## Rules in force
Spec-first (Task 1). **Calc purity** — `romCharts.ts`, `romSensitivity.ts`, `appRequirements.ts` import no React/localStorage/fs (type-only `Vehicle`/`StoredProject`/`Flow` OK). **Imperial-first** (feet stored; miles display-only). **Toyota Type tokens** only in CSS. **Gate after every task:** `npx vitest run` + `npm run build` + purity grep + commit/push (message ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `docs/SPECIFICATION.md`, `docs/CHANGELOG.md` | Spec of record | Modify (Task 1) |
| `src/lib/appRequirements.ts` | `appRequirementsFromProject` (extracted, shared) | Create (Task 2) |
| `src/lib/pdfExport.ts` | Use shared helper | Modify (Task 2) |
| `src/calc/romCharts.ts` | Pure chart `series` shape functions | Create (Tasks 3–6) |
| `src/calc/__tests__/romCharts.test.ts` | Unit tests | Create (Tasks 3–6) |
| `src/calc/romSensitivity.ts` | Pure scenario/resilience recompute | Create (Task 7) |
| `src/calc/__tests__/romSensitivity.test.ts` | Unit tests | Create (Task 7) |
| `src/components/rom/charts/svgScale.ts` | Linear scale + path helpers | Create (Task 8) |
| `src/components/rom/charts/*.tsx` | Thin SVG renderers | Create (Tasks 8–11) |
| `src/components/rom/RequirementsMatrix.tsx`, `SensitivityPanel.tsx`, `AssumptionsPanel.tsx` | §4 panels | Create (Task 12) |
| `src/components/rom/RomVisuals.tsx` | Compose §1–§4 | Create (Task 13) |
| `app/projects/[id]/step4/page.tsx` | Wire `RomVisuals` | Modify (Task 13) |
| `app/globals.css` | `.rv-*` styles | Modify (Task 14) |

---

### Task 1: Spec-first

**Files:** Modify `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`

- [ ] **Step 1: Add a visuals subsection to the spec**

Under the Step 4 ROM Dashboard section, append:

```markdown
### ROM Dashboard — Visual & Sales Layer

Stacked pure-SVG sections (no charting dependency), all from existing data:
- §1 Flow diagram (origins → destinations, thru/hr edges, Qty·vehicle).
- §2 AV duty-cycle, Utilization, Charging summary, Battery state-of-charge profile.
- §3 CAPEX range bars, Payback curve, TCO stacked.
- §4 Requirements-met matrix (Step 2 gates), Sensitivity/resilience, Assumptions panel.

Architecture: pure shape functions (`src/calc/romCharts.ts`, `romSensitivity.ts`) produce
render-agnostic `series`; thin SVG components render them; the same series feed PptxGenJS
deck charts. Dropped: CO₂/sustainability, charging-infrastructure footprint.
```

- [ ] **Step 2: CHANGELOG entry**

```markdown
### Added
- ROM Dashboard visual layer: flow diagram, fleet duty-cycle, utilization, charging
  summary, battery state-of-charge, CAPEX range bars, payback curve, TCO stack,
  requirements-met matrix, sensitivity/resilience, and assumptions panel — pure SVG, no
  new dependency. New pure modules `src/calc/romCharts.ts`, `src/calc/romSensitivity.ts`;
  shared `src/lib/appRequirements.ts`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: spec ROM Dashboard visual & sales layer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Shared `appRequirementsFromProject` (DRY for the requirements matrix)

**Files:**
- Create: `src/lib/appRequirements.ts`
- Modify: `src/lib/pdfExport.ts:20-38` (remove local copy, import shared)
- Test: `src/calc/__tests__/romCharts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/calc/__tests__/romCharts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import type { StoredProject } from '@/src/lib/storage'

describe('appRequirementsFromProject', () => {
  it('maps project fields into ApplicationRequirements with safe defaults', () => {
    const p = { maxLoadWeightLbs: 2000, minAisleWidthFt: 10, certifications: ['UL'] } as unknown as StoredProject
    const r = appRequirementsFromProject(p)
    expect(r.maxLoadWeightLbs).toBe(2000)
    expect(r.minAisleWidthFt).toBe(10)
    expect(r.certifications).toEqual(['UL'])
    expect(r.typicalUnitType).toBe('')        // default
    expect(r.outdoorRequired).toBe(false)     // default
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t appRequirementsFromProject`
Expected: FAIL — `Cannot find module '@/src/lib/appRequirements'`.

- [ ] **Step 3: Create the shared helper**

Create `src/lib/appRequirements.ts` (lifted verbatim from `pdfExport.ts` lines 20–38, now exported):

```ts
import type { StoredProject } from './storage'
import type { ApplicationRequirements } from '../calc/types'

/** Map a stored project into the calc engine's ApplicationRequirements shape. */
export function appRequirementsFromProject(p: StoredProject): ApplicationRequirements {
  return {
    maxLoadWeightLbs: p.maxLoadWeightLbs ?? 0,
    typicalUnitType: p.typicalUnitType ?? '',
    transferMethod: p.transferMethod ?? '',
    deliveryPattern: p.deliveryPattern ?? '',
    maxLiftHeightFt: p.maxLiftHeightFt,
    minAisleWidthFt: p.minAisleWidthFt ?? 0,
    certifications: Array.isArray(p.certifications) ? p.certifications : [],
    tempMinF: p.tempMinF,
    tempMaxF: p.tempMaxF,
    maxRampGrade: p.maxRampGrade ?? 0,
    outdoorRequired: p.outdoorRequired ?? false,
    freezerCapable: p.freezerCapable ?? false,
    loadLengthIn: p.loadLengthIn,
    loadWidthIn: p.loadWidthIn,
    loadHeightIn: p.loadHeightIn,
  }
}
```

- [ ] **Step 4: Point pdfExport at the shared helper**

In `src/lib/pdfExport.ts`: delete the local `function appRequirementsFromProject(...) {...}` (lines 20–38) and add to the imports at the top:

```ts
import { appRequirementsFromProject } from './appRequirements'
```

- [ ] **Step 5: Run tests + build**

```bash
npx vitest run
npm run build
```

Expected: new test PASS; existing pdfExport tests still PASS; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/appRequirements.ts src/lib/pdfExport.ts src/calc/__tests__/romCharts.test.ts
git commit -m "refactor: extract shared appRequirementsFromProject helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: Flow-diagram series (pure)

**Files:** Create `src/calc/romCharts.ts`; Test `src/calc/__tests__/romCharts.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/romCharts.test.ts`:

```ts
import { flowDiagramSeries } from '../romCharts'
import type { Flow, FleetSummary } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

function flow(id: string, origin: string, destination: string, thruPerHr: number, vehicleId: string): Flow {
  return { id, origin, destination, distanceFt: 100, thruPerHr, routeLayout: 'medium', liftHeightFt: 0, vehicleId }
}
function vstub(id: string, name: string): Vehicle {
  return { id, name, calc: {}, priceRange: { minUsd: 0, maxUsd: 0 } } as unknown as Vehicle
}
function fleetWith(fleetSold: Record<string, number>): FleetSummary {
  return {
    groups: Object.entries(fleetSold).map(([vehicleId, n]) => ({
      vehicleId, groupRaw: n, baseFleet: n,
      charging: { method: 'plugged', runHr: 5, chargeHr: 5, availability: 1, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: n, fleetSold: n,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0,
    totalFleetSold: Object.values(fleetSold).reduce((s, n) => s + n, 0), bufferPct: 0.1,
  }
}

describe('flowDiagramSeries', () => {
  it('groups edges by origin with thru/hr, dest, vehicle name and fleet qty', () => {
    const flows = [flow('f1', 'A', 'C', 43, 'cb18'), flow('f2', 'A', 'D', 38, 'cb18')]
    const vById = new Map([['cb18', vstub('cb18', 'CB18 AGF')]])
    const s = flowDiagramSeries(flows, vById, fleetWith({ cb18: 10 }))
    expect(s.origins).toHaveLength(1)
    expect(s.origins[0].label).toBe('A')
    expect(s.origins[0].edges).toHaveLength(2)
    expect(s.origins[0].edges[0]).toMatchObject({ destLabel: 'C', thruPerHr: 43, vehicleName: 'CB18 AGF', vehicleId: 'cb18', qty: 10 })
  })

  it('skips flows without a vehicle or origin', () => {
    const s = flowDiagramSeries([flow('f1', '', 'C', 10, 'cb18')], new Map(), fleetWith({}))
    expect(s.origins).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t flowDiagramSeries`
Expected: FAIL — `Cannot find module '../romCharts'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/calc/romCharts.ts`:

```ts
// src/calc/romCharts.ts — pure chart-series shape functions for the ROM dashboard.
// No React, no fetch, no localStorage, no fs. (Type-only Flow/FleetSummary/Vehicle imports.)
import type { Flow, FleetSummary } from './types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export interface FlowDiagramEdge { destLabel: string; thruPerHr: number; vehicleName: string; vehicleId: string; qty: number }
export interface FlowDiagramOrigin { id: string; label: string; edges: FlowDiagramEdge[] }
export interface FlowDiagramSeries { origins: FlowDiagramOrigin[] }

/** Node-link series: group flows by origin; each edge carries throughput, destination,
 *  the assigned vehicle, and that vehicle's fleet quantity. */
export function flowDiagramSeries(
  flows: Flow[],
  vehiclesById: Map<string, Vehicle>,
  fleet: FleetSummary,
): FlowDiagramSeries {
  const qtyByVehicle = new Map(fleet.groups.map(g => [g.vehicleId, g.fleetSold]))
  const byOrigin = new Map<string, FlowDiagramOrigin>()
  for (const f of flows) {
    if (!f.vehicleId || !f.origin) continue
    const veh = vehiclesById.get(f.vehicleId)
    const o = byOrigin.get(f.origin) ?? { id: f.origin, label: f.origin, edges: [] }
    o.edges.push({
      destLabel: f.destination || '—',
      thruPerHr: f.thruPerHr || 0,
      vehicleName: veh?.name ?? f.vehicleId,
      vehicleId: f.vehicleId,
      qty: qtyByVehicle.get(f.vehicleId) ?? 0,
    })
    byOrigin.set(f.origin, o)
  }
  return { origins: [...byOrigin.values()] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t flowDiagramSeries`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/romCharts.ts src/calc/__tests__/romCharts.test.ts
git commit -m "feat(rom): flowDiagramSeries — node-link operation map series

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: Duty-cycle + utilization series (pure)

**Files:** Modify `src/calc/romCharts.ts`; Test `src/calc/__tests__/romCharts.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { dutyCycleSeries, utilizationSeries } from '../romCharts'
import type { CycleBreakdown, FlowDerived } from '../types'

function bd(over: Partial<CycleBreakdown>): CycleBreakdown {
  return { travelLoadedSec: 0, travelEmptySec: 0, loadSec: 0, unloadSec: 0, liftTimeSec: 0, totalSec: 0,
    methodName: '', liftHeightFt: 0, routeLayout: 'medium', routeLayoutFactor: 0.5, ...over }
}

describe('dutyCycleSeries', () => {
  it('weights activity seconds by throughput and adds a charging fraction', () => {
    const flows = [flow('f1', 'A', 'C', 100, 'cb18')]
    const dByF = new Map<string, FlowDerived>([['f1', { cycleSeconds: 100, rawVehicles: 1,
      breakdown: bd({ travelLoadedSec: 40, travelEmptySec: 20, loadSec: 10, unloadSec: 10, liftTimeSec: 20, totalSec: 100 }) }]])
    // availability 0.8 → charging fraction 0.2 of wall time; activity scaled to 0.8
    const f = fleetWith({ cb18: 1 })
    f.groups[0].charging.availability = 0.8
    const s = dutyCycleSeries(flows, dByF, f, new Map([['cb18', vstub('cb18', 'CB18')]]))
    const frac = (k: string) => s.segments.find(x => x.key === k)!.fraction
    expect(frac('charging')).toBeCloseTo(0.2, 5)
    // drive = (40+20)/100 = 0.6 of operating time → ×0.8 availability = 0.48
    expect(frac('driveLoaded') + frac('driveEmpty')).toBeCloseTo(0.6 * 0.8, 5)
    const sum = s.segments.reduce((a, x) => a + x.fraction, 0)
    expect(sum).toBeCloseTo(1, 5)
  })
})

describe('utilizationSeries', () => {
  it('emits raw demand, base, and sold per vehicle type', () => {
    const f = fleetWith({ cb18: 4 })
    f.groups[0].groupRaw = 2.4; f.groups[0].baseFleet = 3; f.groups[0].fleetSold = 4
    const s = utilizationSeries(f, new Map([['cb18', vstub('cb18', 'CB18')]]))
    expect(s.rows[0]).toMatchObject({ vehicleName: 'CB18', rawDemand: 2.4, baseFleet: 3, fleetSold: 4 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t "dutyCycleSeries|utilizationSeries"`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calc/romCharts.ts`:

```ts
import type { CycleBreakdown, FlowDerived } from './types'

export type DutyKey = 'driveLoaded' | 'driveEmpty' | 'transfer' | 'lift' | 'charging' | 'idle'
export interface DutySegment { key: DutyKey; label: string; fraction: number }
export interface DutyCycleSeries { segments: DutySegment[] }

const DUTY_LABELS: Record<DutyKey, string> = {
  driveLoaded: 'Drive loaded', driveEmpty: 'Drive empty', transfer: 'Load / unload',
  lift: 'Lift', charging: 'Charging', idle: 'Idle',
}

/** Fleet-aggregate activity split. Operating-time fractions come from throughput-weighted
 *  cycle breakdowns; they are scaled by availability, and (1−availability) becomes charging. */
export function dutyCycleSeries(
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
  fleet: FleetSummary,
  vehiclesById: Map<string, Vehicle>,
): DutyCycleSeries {
  let wLoaded = 0, wEmpty = 0, wTransfer = 0, wLift = 0, wTotal = 0
  for (const f of flows) {
    const b: CycleBreakdown | null | undefined = derivedByFlowId.get(f.id)?.breakdown
    const w = f.thruPerHr || 0
    if (!b || w <= 0 || b.totalSec <= 0) continue
    wLoaded += w * b.travelLoadedSec
    wEmpty += w * b.travelEmptySec
    wTransfer += w * (b.loadSec + b.unloadSec)
    wLift += w * b.liftTimeSec
    wTotal += w * b.totalSec
  }
  // availability: mean of group availabilities (fallback 1 = always operating)
  const avails = fleet.groups.map(g => g.charging.availability).filter((a): a is number => a != null)
  const availability = avails.length ? avails.reduce((s, a) => s + a, 0) / avails.length : 1
  const chargingFrac = Math.max(0, 1 - availability)

  if (wTotal <= 0) {
    return { segments: (['driveLoaded', 'driveEmpty', 'transfer', 'lift', 'charging', 'idle'] as DutyKey[])
      .map(key => ({ key, label: DUTY_LABELS[key], fraction: key === 'idle' ? 1 : 0 })) }
  }
  const op = availability // operating share of wall time
  const seg = (sec: number): number => (sec / wTotal) * op
  const driveLoaded = seg(wLoaded), driveEmpty = seg(wEmpty), transfer = seg(wTransfer), lift = seg(wLift)
  const idle = Math.max(0, 1 - (driveLoaded + driveEmpty + transfer + lift + chargingFrac))
  const fracByKey: Record<DutyKey, number> = { driveLoaded, driveEmpty, transfer, lift, charging: chargingFrac, idle }
  return { segments: (Object.keys(fracByKey) as DutyKey[]).map(key => ({ key, label: DUTY_LABELS[key], fraction: fracByKey[key] })) }
}

export interface UtilizationRow { vehicleName: string; rawDemand: number; baseFleet: number; fleetSold: number }
export interface UtilizationSeries { rows: UtilizationRow[] }

/** Per-vehicle-type demand vs provisioned capacity. */
export function utilizationSeries(fleet: FleetSummary, vehiclesById: Map<string, Vehicle>): UtilizationSeries {
  return {
    rows: fleet.groups.map(g => ({
      vehicleName: vehiclesById.get(g.vehicleId)?.name ?? g.vehicleId,
      rawDemand: g.groupRaw, baseFleet: g.baseFleet, fleetSold: g.fleetSold,
    })),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t "dutyCycleSeries|utilizationSeries"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/romCharts.ts src/calc/__tests__/romCharts.test.ts
git commit -m "feat(rom): dutyCycleSeries + utilizationSeries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Charging + battery-SoC series (pure)

**Files:** Modify `src/calc/romCharts.ts`; Test `src/calc/__tests__/romCharts.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { chargingSeries, batterySocSeries } from '../romCharts'

function vbat(id: string, name: string, ratedAh: number, voltageV: number, dischargeA: number, chargeA: number): Vehicle {
  return { id, name, priceRange: { minUsd: 0, maxUsd: 0 }, calc: { ratedAh, voltageV, dischargeA, chargeA } } as unknown as Vehicle
}

describe('chargingSeries', () => {
  it('emits per-type runtime, recharge, method, availability', () => {
    const f = fleetWith({ cb18: 2 })
    Object.assign(f.groups[0].charging, { runHr: 6, chargeHr: 4, method: 'plugged', availability: 0.6 })
    const s = chargingSeries(f, new Map([['cb18', vbat('cb18', 'CB18', 533, 48, 80, 120)]]))
    expect(s.rows[0]).toMatchObject({ vehicleName: 'CB18', runHr: 6, chargeHr: 4, method: 'plugged', availability: 0.6 })
  })
})

describe('batterySocSeries', () => {
  it('samples a depletion-to-DOD-floor then recharge sawtooth across the day', () => {
    const f = fleetWith({ cb18: 1 })
    Object.assign(f.groups[0].charging, { runHr: 5, chargeHr: 2.5 })
    const s = batterySocSeries(f, new Map([['cb18', vbat('cb18', 'CB18', 500, 48, 80, 160)]]), 10, 0.5)
    expect(s.rows[0].dodFloor).toBeCloseTo(0.2, 5) // 1 − 0.8 DOD
    expect(s.rows[0].points[0]).toMatchObject({ hr: 0, soc: 1 })
    // SoC must stay within [dodFloor, 1]
    for (const p of s.rows[0].points) { expect(p.soc).toBeGreaterThanOrEqual(0.2 - 1e-9); expect(p.soc).toBeLessThanOrEqual(1 + 1e-9) }
    expect(s.rows[0].points[s.rows[0].points.length - 1].hr).toBeCloseTo(10, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t "chargingSeries|batterySocSeries"`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calc/romCharts.ts`:

```ts
import { DEFAULT_DOD } from './types'
import type { ChargeMethod } from './types'

export interface ChargingRow { vehicleName: string; runHr: number | null; chargeHr: number | null; method: ChargeMethod; availability: number | null }
export interface ChargingSeries { rows: ChargingRow[] }

/** Per-vehicle-type charging summary. */
export function chargingSeries(fleet: FleetSummary, vehiclesById: Map<string, Vehicle>): ChargingSeries {
  return {
    rows: fleet.groups.map(g => ({
      vehicleName: vehiclesById.get(g.vehicleId)?.name ?? g.vehicleId,
      runHr: g.charging.runHr, chargeHr: g.charging.chargeHr,
      method: g.charging.method, availability: g.charging.availability,
    })),
  }
}

export interface SocPoint { hr: number; soc: number }
export interface BatterySocRow { vehicleName: string; dodFloor: number; points: SocPoint[] }
export interface BatterySocSeries { rows: BatterySocRow[] }

/** State-of-charge sawtooth over the operating day. SoC starts full, falls linearly over
 *  runHr to the DOD floor (1−DEFAULT_DOD), recharges linearly over chargeHr back to full,
 *  and repeats. Sampled every `stepHr` to `dayHr`. */
export function batterySocSeries(
  fleet: FleetSummary,
  vehiclesById: Map<string, Vehicle>,
  dayHr: number,
  stepHr: number,
): BatterySocSeries {
  const floor = 1 - DEFAULT_DOD
  const usable = DEFAULT_DOD
  const rows: BatterySocRow[] = []
  for (const g of fleet.groups) {
    const runHr = g.charging.runHr
    const chargeHr = g.charging.chargeHr
    const name = vehiclesById.get(g.vehicleId)?.name ?? g.vehicleId
    const points: SocPoint[] = []
    if (!runHr || runHr <= 0 || !chargeHr || chargeHr <= 0) {
      points.push({ hr: 0, soc: 1 }, { hr: dayHr, soc: 1 })
      rows.push({ vehicleName: name, dodFloor: floor, points })
      continue
    }
    const dischargeRate = usable / runHr   // SoC units per hour while operating
    const chargeRate = usable / chargeHr   // SoC units per hour while charging
    let soc = 1
    let charging = false
    const steps = Math.ceil(dayHr / stepHr)
    for (let i = 0; i <= steps; i++) {
      const hr = Math.min(dayHr, i * stepHr)
      points.push({ hr, soc: Math.max(floor, Math.min(1, soc)) })
      // advance state for next sample
      if (!charging) {
        soc -= dischargeRate * stepHr
        if (soc <= floor) { soc = floor; charging = true }
      } else {
        soc += chargeRate * stepHr
        if (soc >= 1) { soc = 1; charging = false }
      }
    }
    rows.push({ vehicleName: name, dodFloor: floor, points })
  }
  return { rows }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t "chargingSeries|batterySocSeries"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/romCharts.ts src/calc/__tests__/romCharts.test.ts
git commit -m "feat(rom): chargingSeries + batterySocSeries (SoC sawtooth)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: CAPEX bars, payback, TCO series (pure)

**Files:** Modify `src/calc/romCharts.ts`; Test `src/calc/__tests__/romCharts.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { capexBarsSeries, paybackSeries, tcoSeries } from '../romCharts'
import type { RomSummary } from '../rom'

const romFix: RomSummary = {
  pricing: { lines: [{ vehicleId: 'cb18', fleetSold: 10, unitMin: 165000, unitMax: 210000, lineMin: 1650000, lineMax: 2100000 }],
             totalMin: 1650000, totalMax: 2100000, totalMid: 1875000 },
  opex: { annualEnergyKwh: 1, annualEnergyCost: 1000, annualMaintenance: 150000, annualOpex: 151000 },
  payback: { annualLaborOffset: 600000, netAnnualBenefit: 449000, paybackYears: 1875000 / 449000 },
}

describe('capexBarsSeries', () => {
  it('emits per-vehicle line ranges + totals', () => {
    const s = capexBarsSeries(romFix, new Map([['cb18', vstub('cb18', 'CB18')]]))
    expect(s.rows[0]).toMatchObject({ vehicleName: 'CB18', qty: 10, lineMin: 1650000, lineMax: 2100000 })
    expect(s.totalMin).toBe(1650000); expect(s.totalMax).toBe(2100000)
  })
})

describe('paybackSeries', () => {
  it('cumulative cash flow starts at −CAPEX and rises by net benefit; marks break-even', () => {
    const s = paybackSeries(romFix, 7)
    expect(s.points[0]).toMatchObject({ year: 0 })
    expect(s.points[0].cumulative).toBeCloseTo(-1875000, 5)
    expect(s.points[1].cumulative).toBeCloseTo(-1875000 + 449000, 5)
    expect(s.breakEvenYear).toBeCloseTo(1875000 / 449000, 5)
  })
})

describe('tcoSeries', () => {
  it('accumulates capex + opex vs labor offset by year', () => {
    const s = tcoSeries(romFix, 7)
    expect(s.points[2]).toMatchObject({ year: 2, capex: 1875000 })
    expect(s.points[2].cumOpex).toBeCloseTo(151000 * 2, 5)
    expect(s.points[2].cumLaborOffset).toBeCloseTo(600000 * 2, 5)
    expect(s.points[2].net).toBeCloseTo(1875000 + 151000 * 2 - 600000 * 2, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romCharts.test.ts -t "capexBarsSeries|paybackSeries|tcoSeries"`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calc/romCharts.ts`:

```ts
import type { RomSummary } from './rom'

export interface CapexBarRow { vehicleName: string; qty: number; lineMin: number; lineMax: number }
export interface CapexBarsSeries { rows: CapexBarRow[]; totalMin: number; totalMax: number }

export function capexBarsSeries(rom: RomSummary, vehiclesById: Map<string, Vehicle>): CapexBarsSeries {
  return {
    rows: rom.pricing.lines.map(l => ({
      vehicleName: vehiclesById.get(l.vehicleId)?.name ?? l.vehicleId,
      qty: l.fleetSold, lineMin: l.lineMin, lineMax: l.lineMax,
    })),
    totalMin: rom.pricing.totalMin, totalMax: rom.pricing.totalMax,
  }
}

export interface PaybackPoint { year: number; cumulative: number }
export interface PaybackSeries { points: PaybackPoint[]; breakEvenYear: number | null }

/** Cumulative cash flow: −CAPEX at year 0, + net annual benefit each year through life. */
export function paybackSeries(rom: RomSummary, serviceLifeYears: number): PaybackSeries {
  const capex = rom.pricing.totalMid
  const net = rom.payback.netAnnualBenefit
  const points: PaybackPoint[] = []
  for (let y = 0; y <= serviceLifeYears; y++) points.push({ year: y, cumulative: -capex + net * y })
  return { points, breakEvenYear: net > 0 ? capex / net : null }
}

export interface TcoPoint { year: number; capex: number; cumOpex: number; cumLaborOffset: number; net: number }
export interface TcoSeries { points: TcoPoint[] }

/** Cumulative cost stack vs cumulative labor offset across the life. */
export function tcoSeries(rom: RomSummary, serviceLifeYears: number): TcoSeries {
  const capex = rom.pricing.totalMid
  const opex = rom.opex.annualOpex
  const offset = rom.payback.annualLaborOffset
  const points: TcoPoint[] = []
  for (let y = 0; y <= serviceLifeYears; y++) {
    points.push({ year: y, capex, cumOpex: opex * y, cumLaborOffset: offset * y, net: capex + opex * y - offset * y })
  }
  return { points }
}
```

- [ ] **Step 4: Run full suite + purity grep + build**

```bash
npx vitest run
grep -rE "from 'react'|localStorage|from 'fs'" src/calc/romCharts.ts   # expect: no matches
npm run build
```

Expected: all PASS; no purity matches; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/calc/romCharts.ts src/calc/__tests__/romCharts.test.ts
git commit -m "feat(rom): capexBarsSeries + paybackSeries + tcoSeries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: Sensitivity / resilience (pure)

**Files:** Create `src/calc/romSensitivity.ts`; Test `src/calc/__tests__/romSensitivity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/calc/__tests__/romSensitivity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resilience, type ResilienceInput } from '../romSensitivity'
import type { FleetSummary } from '../types'

function fleet(rows: Array<{ vehicleId: string; groupRaw: number; fleetSold: number }>): FleetSummary {
  return {
    groups: rows.map(r => ({
      vehicleId: r.vehicleId, groupRaw: r.groupRaw, baseFleet: Math.ceil(r.groupRaw),
      charging: { method: 'plugged', runHr: 5, chargeHr: 5, availability: 1, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: r.fleetSold, fleetSold: r.fleetSold,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0,
    totalFleetSold: rows.reduce((s, r) => s + r.fleetSold, 0), bufferPct: 0.1,
  }
}

describe('resilience', () => {
  it('throughput is held when removing one vehicle still covers raw demand', () => {
    // demand 2.4 needs 3; sold 4 → with one down (3) still ≥ 2.4 → held
    const r = resilience({ fleet: fleet([{ vehicleId: 'cb18', groupRaw: 2.4, fleetSold: 4 }]) } as ResilienceInput)
    expect(r.throughputHeldWithOneDown).toBe(true)
    expect(r.retainedPct).toBeCloseTo(1, 5)
  })

  it('throughput drops when one down falls below raw demand', () => {
    // demand 3.6 needs 4; sold 4 → one down (3) < 3.6 → not held; retained 3/3.6
    const r = resilience({ fleet: fleet([{ vehicleId: 'cb18', groupRaw: 3.6, fleetSold: 4 }]) } as ResilienceInput)
    expect(r.throughputHeldWithOneDown).toBe(false)
    expect(r.retainedPct).toBeCloseTo(3 / 3.6, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/romSensitivity.test.ts`
Expected: FAIL — `Cannot find module '../romSensitivity'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/calc/romSensitivity.ts`:

```ts
// src/calc/romSensitivity.ts — resilience / what-if recompute. PURE.
// No React, no fetch, no localStorage, no fs.
import type { FleetSummary } from './types'

export interface ResilienceInput { fleet: FleetSummary }
export interface ResilienceResult { throughputHeldWithOneDown: boolean; retainedPct: number }

/** Can the operation hold throughput if one vehicle is offline? For each vehicle type the
 *  available units drop by 1; throughput is held only if the remaining provisioned units
 *  still cover the raw (fractional) demand for every type. retainedPct is the worst-type
 *  ratio of (sold−1) capacity to demand, capped at 1. */
export function resilience(input: ResilienceInput): ResilienceResult {
  const groups = input.fleet.groups
  if (groups.length === 0) return { throughputHeldWithOneDown: true, retainedPct: 1 }
  let held = true
  let worst = 1
  for (const g of groups) {
    if (g.groupRaw <= 0) continue
    const remaining = Math.max(0, g.fleetSold - 1)
    const ratio = Math.min(1, remaining / g.groupRaw)
    if (remaining < g.groupRaw) held = false
    if (ratio < worst) worst = ratio
  }
  return { throughputHeldWithOneDown: held, retainedPct: worst }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/romSensitivity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/romSensitivity.ts src/calc/__tests__/romSensitivity.test.ts
git commit -m "feat(rom): resilience — throughput held with one vehicle down

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

> **Note for executor:** the spec also mentions ±throughput / +1-shift what-if rows. Those
> require re-running `fleetSummary`/`romSummary` with scaled inputs. If you implement them,
> add a `scenarios(base, scenarioList)` function here that rebuilds `GroupSummary[]` with
> `thruPerHr × factor` and `dailyOpHr` for +shifts, then calls the existing pure engine — TDD
> the same way. The dashboard can ship with **resilience** alone first (YAGNI); add what-if
> rows in a follow-up if desired.

---

### Task 8: SVG scale helper + FlowDiagram + DutyCycleChart

**Files:**
- Create: `src/components/rom/charts/svgScale.ts`
- Create: `src/components/rom/charts/FlowDiagram.tsx`
- Create: `src/components/rom/charts/DutyCycleChart.tsx`

- [ ] **Step 1: Scale helper**

Create `src/components/rom/charts/svgScale.ts`:

```ts
/** Linear scale: map a value in [d0,d1] to [r0,r1]. */
export function linScale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0)
}

/** Build an SVG polyline points string from [x,y] pairs. */
export function polyline(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}
```

- [ ] **Step 2: FlowDiagram (§1)**

Create `src/components/rom/charts/FlowDiagram.tsx`:

```tsx
'use client'

import type { FlowDiagramSeries } from '@/src/calc/romCharts'

interface Props { series: FlowDiagramSeries }

/** Node-link operation map: each origin fans out to its destinations with thru/hr labels. */
export default function FlowDiagram({ series }: Props) {
  if (series.origins.length === 0) return <div className="rv-empty">Add flows with origins and vehicles to map the operation.</div>
  return (
    <div className="rv-flowmap">
      {series.origins.map(o => (
        <div key={o.id} className="rv-flow-origin">
          <div className="rv-flow-node rv-flow-src">{o.label}</div>
          <div className="rv-flow-edges">
            {o.edges.map((e, i) => (
              <div key={i} className="rv-flow-edge">
                <span className="rv-flow-thru mono">{e.thruPerHr}/hr</span>
                <span className="rv-flow-arrow" aria-hidden="true">→</span>
                <span className="rv-flow-node rv-flow-dst">
                  {e.destLabel}
                  <span className="rv-flow-qty mono">Qty {e.qty} · {e.vehicleName}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: DutyCycleChart (§2)**

Create `src/components/rom/charts/DutyCycleChart.tsx`:

```tsx
'use client'

import type { DutyCycleSeries, DutyKey } from '@/src/calc/romCharts'

const COLORS: Record<DutyKey, string> = {
  driveLoaded: 'var(--accent)', driveEmpty: '#6aa9ff', transfer: '#46c19a',
  lift: '#e0a23c', charging: '#9b7ad6', idle: 'var(--border)',
}

interface Props { series: DutyCycleSeries }

/** Single 100% stacked bar of what the fleet does all day. */
export default function DutyCycleChart({ series }: Props) {
  const segs = series.segments.filter(s => s.fraction > 0.001)
  return (
    <div className="rv-duty">
      <div className="rv-duty-bar" role="img" aria-label="Fleet activity split">
        {segs.map(s => (
          <span key={s.key} className="rv-duty-seg" style={{ width: `${s.fraction * 100}%`, background: COLORS[s.key] }} title={`${s.label}: ${Math.round(s.fraction * 100)}%`} />
        ))}
      </div>
      <ul className="rv-legend">
        {segs.map(s => (
          <li key={s.key}><span className="rv-swatch" style={{ background: COLORS[s.key] }} />{s.label} <span className="mono">{Math.round(s.fraction * 100)}%</span></li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean (components unused so far).

- [ ] **Step 5: Commit**

```bash
git add src/components/rom/charts/svgScale.ts src/components/rom/charts/FlowDiagram.tsx src/components/rom/charts/DutyCycleChart.tsx
git commit -m "feat(rom): FlowDiagram + DutyCycleChart + svgScale helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 9: UtilizationChart + ChargingSummary

**Files:**
- Create: `src/components/rom/charts/UtilizationChart.tsx`
- Create: `src/components/rom/charts/ChargingSummary.tsx`

- [ ] **Step 1: UtilizationChart**

Create `src/components/rom/charts/UtilizationChart.tsx`:

```tsx
'use client'

import type { UtilizationSeries } from '@/src/calc/romCharts'

interface Props { series: UtilizationSeries }

/** Per-type demand vs provisioned bars; the demand fill over the sold track shows headroom. */
export default function UtilizationChart({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see utilization.</div>
  const max = Math.max(1, ...series.rows.map(r => r.fleetSold))
  return (
    <div className="rv-util">
      {series.rows.map(r => {
        const pctDemand = (r.rawDemand / max) * 100
        const pctSold = (r.fleetSold / max) * 100
        const util = r.fleetSold > 0 ? Math.round((r.rawDemand / r.fleetSold) * 100) : 0
        return (
          <div key={r.vehicleName} className="rv-util-row">
            <span className="rv-util-name">{r.vehicleName}</span>
            <span className="rv-util-track">
              <span className="rv-util-sold" style={{ width: `${pctSold}%` }} />
              <span className="rv-util-demand" style={{ width: `${pctDemand}%` }} />
            </span>
            <span className="rv-util-val mono">{util}% · {r.rawDemand.toFixed(1)}/{r.fleetSold}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: ChargingSummary**

Create `src/components/rom/charts/ChargingSummary.tsx`:

```tsx
'use client'

import type { ChargingSeries } from '@/src/calc/romCharts'

const fmtH = (h: number | null) => (h == null ? '—' : `${h.toFixed(1)} h`)
const fmtP = (a: number | null) => (a == null ? '—' : `${Math.round(a * 100)}%`)

interface Props { series: ChargingSeries }

/** Per-type runtime, recharge, method, and uptime. */
export default function ChargingSummary({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see charging.</div>
  return (
    <table className="rv-charge">
      <thead><tr><th>Vehicle</th><th>Method</th><th className="num">Runtime</th><th className="num">Recharge</th><th className="num">Uptime</th></tr></thead>
      <tbody>
        {series.rows.map(r => (
          <tr key={r.vehicleName}>
            <td>{r.vehicleName}</td>
            <td>{r.method === 'opportunity' ? 'Opportunity' : 'Plugged'}</td>
            <td className="num mono">{fmtH(r.runHr)}</td>
            <td className="num mono">{fmtH(r.chargeHr)}</td>
            <td className="num mono">{fmtP(r.availability)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/components/rom/charts/UtilizationChart.tsx src/components/rom/charts/ChargingSummary.tsx
git commit -m "feat(rom): UtilizationChart + ChargingSummary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 10: BatterySocChart + CapexRangeBars

**Files:**
- Create: `src/components/rom/charts/BatterySocChart.tsx`
- Create: `src/components/rom/charts/CapexRangeBars.tsx`

- [ ] **Step 1: BatterySocChart**

Create `src/components/rom/charts/BatterySocChart.tsx`:

```tsx
'use client'

import type { BatterySocSeries } from '@/src/calc/romCharts'
import { linScale, polyline } from './svgScale'

const W = 520, H = 130, PAD = 24
const LINE_COLORS = ['var(--accent)', '#6aa9ff', '#46c19a', '#e0a23c', '#9b7ad6']

interface Props { series: BatterySocSeries }

/** State-of-charge sawtooth per vehicle type over the operating day. */
export default function BatterySocChart({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see the battery profile.</div>
  const maxHr = Math.max(1, ...series.rows.flatMap(r => r.points.map(p => p.hr)))
  const x = linScale(0, maxHr, PAD, W - PAD)
  const y = linScale(0, 1, H - PAD, PAD)
  const floor = series.rows[0]?.dodFloor ?? 0.2
  return (
    <div className="rv-soc">
      <svg viewBox={`0 0 ${W} ${H}`} className="rv-soc-svg" role="img" aria-label="Battery state of charge over the day">
        <line x1={PAD} y1={y(floor)} x2={W - PAD} y2={y(floor)} className="rv-soc-floor" strokeDasharray="3 3" />
        {series.rows.map((r, i) => (
          <polyline key={r.vehicleName} fill="none" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.75}
            points={polyline(r.points.map(p => [x(p.hr), y(p.soc)]))} />
        ))}
        <text x={PAD} y={H - 6} className="rv-soc-axis">0 h</text>
        <text x={W - PAD} y={H - 6} className="rv-soc-axis" textAnchor="end">{Math.round(maxHr)} h</text>
        <text x={PAD - 6} y={y(floor) + 3} className="rv-soc-axis" textAnchor="end">{Math.round(floor * 100)}%</text>
      </svg>
      <ul className="rv-legend">
        {series.rows.map((r, i) => (
          <li key={r.vehicleName}><span className="rv-swatch" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />{r.vehicleName}</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: CapexRangeBars**

Create `src/components/rom/charts/CapexRangeBars.tsx`:

```tsx
'use client'

import type { CapexBarsSeries } from '@/src/calc/romCharts'

const usd = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}K`

interface Props { series: CapexBarsSeries }

/** Per-vehicle price-range bars over a shared scale + total band. Always a range. */
export default function CapexRangeBars({ series }: Props) {
  if (series.rows.length === 0) return <div className="rv-empty">Size the fleet to see ROM pricing.</div>
  const max = Math.max(series.totalMax, ...series.rows.map(r => r.lineMax)) || 1
  const bar = (min: number, max2: number) => ({ left: `${(min / max) * 100}%`, width: `${((max2 - min) / max) * 100}%` })
  return (
    <div className="rv-capex">
      {series.rows.map(r => (
        <div key={r.vehicleName} className="rv-capex-row">
          <span className="rv-capex-name">{r.qty}× {r.vehicleName}</span>
          <span className="rv-capex-track"><span className="rv-capex-fill" style={bar(r.lineMin, r.lineMax)} /></span>
          <span className="rv-capex-val mono">{usd(r.lineMin)}–{usd(r.lineMax)}</span>
        </div>
      ))}
      <div className="rv-capex-row rv-capex-total">
        <span className="rv-capex-name">Total</span>
        <span className="rv-capex-track"><span className="rv-capex-fill" style={bar(series.totalMin, series.totalMax)} /></span>
        <span className="rv-capex-val mono">{usd(series.totalMin)}–{usd(series.totalMax)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/components/rom/charts/BatterySocChart.tsx src/components/rom/charts/CapexRangeBars.tsx
git commit -m "feat(rom): BatterySocChart + CapexRangeBars

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 11: PaybackCurve + TcoStacked

**Files:**
- Create: `src/components/rom/charts/PaybackCurve.tsx`
- Create: `src/components/rom/charts/TcoStacked.tsx`

- [ ] **Step 1: PaybackCurve**

Create `src/components/rom/charts/PaybackCurve.tsx`:

```tsx
'use client'

import type { PaybackSeries } from '@/src/calc/romCharts'
import { linScale, polyline } from './svgScale'

const W = 520, H = 170, PAD = 30

interface Props { series: PaybackSeries }

/** Cumulative cash flow over the life, crossing zero at break-even. */
export default function PaybackCurve({ series }: Props) {
  const pts = series.points
  if (pts.length < 2) return <div className="rv-empty">Size the fleet to project payback.</div>
  const years = pts[pts.length - 1].year
  const lo = Math.min(0, ...pts.map(p => p.cumulative))
  const hi = Math.max(0, ...pts.map(p => p.cumulative))
  const x = linScale(0, years, PAD, W - PAD)
  const y = linScale(lo, hi, H - PAD, PAD)
  const be = series.breakEvenYear
  const usd = (n: number) => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1_000_000).toFixed(1)}M`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rv-pay" role="img" aria-label="Cumulative cash flow to break-even">
      <line x1={PAD} y1={y(0)} x2={W - PAD} y2={y(0)} className="rv-pay-zero" />
      <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={polyline(pts.map(p => [x(p.year), y(p.cumulative)]))} />
      {be != null && be <= years && (
        <g>
          <line x1={x(be)} y1={PAD} x2={x(be)} y2={H - PAD} className="rv-pay-be" strokeDasharray="3 3" />
          <text x={x(be) + 4} y={PAD + 10} className="rv-pay-belbl">payback {be.toFixed(1)} yr</text>
        </g>
      )}
      <text x={PAD} y={H - 8} className="rv-soc-axis">yr 0</text>
      <text x={W - PAD} y={H - 8} className="rv-soc-axis" textAnchor="end">yr {years}</text>
      <text x={PAD - 4} y={y(hi)} className="rv-soc-axis" textAnchor="end">{usd(hi)}</text>
    </svg>
  )
}
```

- [ ] **Step 2: TcoStacked**

Create `src/components/rom/charts/TcoStacked.tsx`:

```tsx
'use client'

import type { TcoSeries } from '@/src/calc/romCharts'

const usd = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`

interface Props { series: TcoSeries }

/** Per-year bars: cost stack (CAPEX once + cumulative OPEX) vs cumulative labor offset. */
export default function TcoStacked({ series }: Props) {
  const pts = series.points
  if (pts.length < 2) return <div className="rv-empty">Size the fleet to see TCO.</div>
  const max = Math.max(1, ...pts.map(p => Math.max(p.capex + p.cumOpex, p.cumLaborOffset)))
  return (
    <div className="rv-tco">
      {pts.filter(p => p.year > 0).map(p => {
        const costH = ((p.capex + p.cumOpex) / max) * 100
        const offsetH = (p.cumLaborOffset / max) * 100
        return (
          <div key={p.year} className="rv-tco-col">
            <div className="rv-tco-bars">
              <span className="rv-tco-cost" style={{ height: `${costH}%` }} title={`Cost ${usd(p.capex + p.cumOpex)}`} />
              <span className="rv-tco-offset" style={{ height: `${offsetH}%` }} title={`Labor offset ${usd(p.cumLaborOffset)}`} />
            </div>
            <span className="rv-tco-yr mono">{p.year}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/components/rom/charts/PaybackCurve.tsx src/components/rom/charts/TcoStacked.tsx
git commit -m "feat(rom): PaybackCurve + TcoStacked

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 12: §4 panels — RequirementsMatrix, SensitivityPanel, AssumptionsPanel

**Files:**
- Create: `src/components/rom/RequirementsMatrix.tsx`
- Create: `src/components/rom/SensitivityPanel.tsx`
- Create: `src/components/rom/AssumptionsPanel.tsx`

- [ ] **Step 1: RequirementsMatrix**

Create `src/components/rom/RequirementsMatrix.tsx`. It runs the existing pure `qualifyVehicle`
against each fleet vehicle and shows the union of hard/soft gates.

```tsx
'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary, GateResult } from '@/src/calc/types'
import { qualifyVehicle } from '@/src/calc/trafficLight'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'

interface Props { project: StoredProject; fleet: FleetSummary; vehicleById: Map<string, Vehicle> }

/** Green checklist: every Step 2 gate satisfied by the chosen fleet. */
export default function RequirementsMatrix({ project, fleet, vehicleById }: Props) {
  const req = appRequirementsFromProject(project)
  // Aggregate gates across the fleet vehicles; a gate is "met" only if it passes for all.
  const byGate = new Map<string, { name: string; severity: string; met: boolean; skipped: boolean; reason: string }>()
  for (const g of fleet.groups) {
    const veh = vehicleById.get(g.vehicleId)
    if (!veh) continue
    const q = qualifyVehicle(veh, req)
    for (const gate of [...q.hardGates, ...q.softPreferences] as GateResult[]) {
      const cur = byGate.get(gate.gateId)
      const met = !gate.skipped && gate.passed
      if (!cur) byGate.set(gate.gateId, { name: gate.name, severity: gate.severity, met, skipped: gate.skipped, reason: gate.reason })
      else { cur.met = cur.met && met; cur.skipped = cur.skipped && gate.skipped }
    }
  }
  const rows = [...byGate.values()].filter(r => !r.skipped)
  if (rows.length === 0) return <div className="rv-empty">Provide application requirements in Step 1 to verify compatibility.</div>
  return (
    <ul className="rv-req">
      {rows.map(r => (
        <li key={r.name} className={`rv-req-row ${r.met ? 'rv-req-ok' : 'rv-req-no'}`}>
          <span className="rv-req-mark" aria-hidden="true">{r.met ? '✓' : '✕'}</span>
          <span className="rv-req-name">{r.name}</span>
          <span className="rv-req-sev">{r.severity === 'hard' ? 'Requirement' : 'Preference'}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: SensitivityPanel**

Create `src/components/rom/SensitivityPanel.tsx`:

```tsx
'use client'

import type { FleetSummary } from '@/src/calc/types'
import { resilience } from '@/src/calc/romSensitivity'

interface Props { fleet: FleetSummary }

/** Resilience readout: does throughput hold with one vehicle down? */
export default function SensitivityPanel({ fleet }: Props) {
  const r = resilience({ fleet })
  return (
    <div className="rv-sens">
      <div className={`rv-sens-card ${r.throughputHeldWithOneDown ? 'rv-sens-ok' : 'rv-sens-warn'}`}>
        <span className="rv-sens-val mono">{r.throughputHeldWithOneDown ? 'Held' : `${Math.round(r.retainedPct * 100)}%`}</span>
        <span className="rv-sens-lbl">Throughput with one vehicle down</span>
      </div>
      <p className="rv-sens-note">
        {r.throughputHeldWithOneDown
          ? 'The buffer absorbs a single vehicle outage with no throughput loss.'
          : `A single outage retains ${Math.round(r.retainedPct * 100)}% of demanded throughput on the tightest vehicle type.`}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: AssumptionsPanel**

Create `src/components/rom/AssumptionsPanel.tsx`:

```tsx
'use client'

import type { StoredProject } from '@/src/lib/storage'

interface Props { project: StoredProject }

/** Auditable methodology list — the assumptions behind the numbers. */
export default function AssumptionsPanel({ project: p }: Props) {
  const rows: Array<[string, string]> = [
    ['Usable depth of discharge', '80%'],
    ['Route speed factors', 'Low 30% · Medium 50% · High 70% of rated'],
    ['Safety buffer', `${Math.round((p.bufferPct ?? 0.10) * 100)}%`],
    ['Charge regime', p.chargeRegime === 'continuous' ? 'Continuous 24/7' : 'Overnight window'],
    ['Operating days / year', String(p.operatingDaysPerYear ?? 312)],
    ['Labor rate', `$${p.laborRateUsdPerHr ?? 28}/hr`],
    ['Energy cost', `$${p.energyCostUsdPerKwh ?? 0.12}/kWh`],
    ['Maintenance', `${Math.round((p.annualMaintenancePctOfCapex ?? 0.08) * 100)}%/yr of CAPEX`],
    ['Service life', `${p.serviceLifeYears ?? 7} yr`],
  ]
  return (
    <dl className="rv-assume">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>
      ))}
    </dl>
  )
}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/components/rom/RequirementsMatrix.tsx src/components/rom/SensitivityPanel.tsx src/components/rom/AssumptionsPanel.tsx
git commit -m "feat(rom): requirements matrix + sensitivity + assumptions panels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 13: Compose `RomVisuals` + wire into step4

**Files:**
- Create: `src/components/rom/RomVisuals.tsx`
- Modify: `app/projects/[id]/step4/page.tsx`

- [ ] **Step 1: RomVisuals composition**

Create `src/components/rom/RomVisuals.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary, Flow, FlowDerived } from '@/src/calc/types'
import type { RomSummary } from '@/src/calc/rom'
import {
  flowDiagramSeries, dutyCycleSeries, utilizationSeries, chargingSeries,
  batterySocSeries, capexBarsSeries, paybackSeries, tcoSeries,
} from '@/src/calc/romCharts'
import FlowDiagram from './charts/FlowDiagram'
import DutyCycleChart from './charts/DutyCycleChart'
import UtilizationChart from './charts/UtilizationChart'
import ChargingSummary from './charts/ChargingSummary'
import BatterySocChart from './charts/BatterySocChart'
import CapexRangeBars from './charts/CapexRangeBars'
import PaybackCurve from './charts/PaybackCurve'
import TcoStacked from './charts/TcoStacked'
import RequirementsMatrix from './RequirementsMatrix'
import SensitivityPanel from './SensitivityPanel'
import AssumptionsPanel from './AssumptionsPanel'

interface Props {
  project: StoredProject
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  fleet: FleetSummary
  rom: RomSummary
  vehicleById: Map<string, Vehicle>
  effDailyOpHr: number
  serviceLifeYears: number
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rom-card"><span className="rom-card-eyebrow">{title}</span>{children}</section>
}

/** The stacked visual & sales layer (§1–§4). */
export default function RomVisuals(p: Props) {
  const flowSeries = useMemo(() => flowDiagramSeries(p.flows, p.vehicleById, p.fleet), [p.flows, p.vehicleById, p.fleet])
  const duty = useMemo(() => dutyCycleSeries(p.flows, p.derivedByFlowId, p.fleet, p.vehicleById), [p.flows, p.derivedByFlowId, p.fleet, p.vehicleById])
  const util = useMemo(() => utilizationSeries(p.fleet, p.vehicleById), [p.fleet, p.vehicleById])
  const charge = useMemo(() => chargingSeries(p.fleet, p.vehicleById), [p.fleet, p.vehicleById])
  const soc = useMemo(() => batterySocSeries(p.fleet, p.vehicleById, p.effDailyOpHr, 0.25), [p.fleet, p.vehicleById, p.effDailyOpHr])
  const capex = useMemo(() => capexBarsSeries(p.rom, p.vehicleById), [p.rom, p.vehicleById])
  const payback = useMemo(() => paybackSeries(p.rom, p.serviceLifeYears), [p.rom, p.serviceLifeYears])
  const tco = useMemo(() => tcoSeries(p.rom, p.serviceLifeYears), [p.rom, p.serviceLifeYears])

  return (
    <div className="rom-visuals">
      <Card title="Operation map"><FlowDiagram series={flowSeries} /></Card>
      <div className="rom-grid">
        <Card title="What the fleet does"><DutyCycleChart series={duty} /></Card>
        <Card title="Utilization"><UtilizationChart series={util} /></Card>
      </div>
      <div className="rom-grid">
        <Card title="Charging"><ChargingSummary series={charge} /></Card>
        <Card title="Battery state of charge"><BatterySocChart series={soc} /></Card>
      </div>
      <Card title="ROM CAPEX"><CapexRangeBars series={capex} /></Card>
      <div className="rom-grid">
        <Card title="Payback"><PaybackCurve series={payback} /></Card>
        <Card title="Total cost of ownership"><TcoStacked series={tco} /></Card>
      </div>
      <Card title="Requirements met"><RequirementsMatrix project={p.project} fleet={p.fleet} vehicleById={p.vehicleById} /></Card>
      <div className="rom-grid">
        <Card title="Resilience"><SensitivityPanel fleet={p.fleet} /></Card>
        <Card title="Assumptions &amp; methodology"><AssumptionsPanel project={p.project} /></Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into step4**

In `app/projects/[id]/step4/page.tsx`, add the import:

```tsx
import RomVisuals from '@/src/components/rom/RomVisuals'
import { effDailyOpHr } from '@/src/calc/romAnalytics'
```

Compute `effDailyOpHr` from the analytics schedule (already built in the analytics plan) and
render `RomVisuals` after `RomEnvelope` (and before the export card):

```tsx
        <RomVisuals
          project={project}
          flows={flows}
          derivedByFlowId={derivedByFlowId}
          fleet={fleet}
          rom={rom}
          vehicleById={vehicleById}
          effDailyOpHr={effDailyOpHr(analyticsSchedule)}
          serviceLifeYears={project.serviceLifeYears ?? 7}
        />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean; the dashboard renders all visual sections.

- [ ] **Step 4: Commit**

```bash
git add src/components/rom/RomVisuals.tsx app/projects/\[id\]/step4/page.tsx
git commit -m "feat(rom): compose RomVisuals and wire into the ROM dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 14: Styles + final gate

**Files:** Modify `app/globals.css`

- [ ] **Step 1: Add the `.rv-*` styles**

Append to `app/globals.css`. All numerics use `var(--tal-font-numeric)`; reuse existing
tokens. (Complete block — covers flow map, duty bar, legend, utilization, charge table, SoC
svg, capex bars, payback/tco, requirements, sensitivity, assumptions.)

```css
/* ─── ROM Dashboard visuals ─── */
.rom-visuals { display: flex; flex-direction: column; gap: 16px; }
.rv-empty { font-family: var(--tal-font-family); font-size: 13px; color: var(--text-tertiary); font-style: italic; }

/* §1 flow map */
.rv-flowmap { display: flex; flex-direction: column; gap: 16px; }
.rv-flow-origin { display: flex; align-items: center; gap: 16px; }
.rv-flow-node { font-family: var(--tal-font-numeric); font-size: 13px; font-weight: 700; color: var(--text-primary);
  padding: 8px 12px; border-radius: 9px; background: var(--bg-surface-2); border: 1px solid var(--border); white-space: nowrap; }
.rv-flow-src { border-color: var(--accent); }
.rv-flow-edges { display: flex; flex-direction: column; gap: 8px; }
.rv-flow-edge { display: flex; align-items: center; gap: 10px; }
.rv-flow-thru { font-size: 12px; color: var(--text-secondary); }
.rv-flow-arrow { color: var(--text-tertiary); }
.rv-flow-dst { display: inline-flex; flex-direction: column; gap: 2px; }
.rv-flow-qty { font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); }

/* §2 duty cycle + legend */
.rv-duty { display: flex; flex-direction: column; gap: 12px; }
.rv-duty-bar { display: flex; height: 26px; border-radius: 7px; overflow: hidden; border: 1px solid var(--border); }
.rv-duty-seg { display: block; height: 100%; }
.rv-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; }
.rv-legend li { display: inline-flex; align-items: center; gap: 6px; font-family: var(--tal-font-family); font-size: 12px; color: var(--text-secondary); }
.rv-swatch { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }

/* §2 utilization */
.rv-util { display: flex; flex-direction: column; gap: 9px; }
.rv-util-row { display: grid; grid-template-columns: 90px 1fr auto; align-items: center; gap: 10px; }
.rv-util-name { font-family: var(--tal-font-family); font-size: 12px; color: var(--text-primary); }
.rv-util-track { position: relative; height: 16px; background: var(--bg-surface-2); border-radius: 5px; overflow: hidden; }
.rv-util-sold { position: absolute; left: 0; top: 0; height: 100%; background: color-mix(in srgb, var(--accent) 22%, transparent); }
.rv-util-demand { position: absolute; left: 0; top: 0; height: 100%; background: var(--accent); border-radius: 5px; }
.rv-util-val { font-size: 11px; color: var(--text-tertiary); }

/* §2 charging table */
.rv-charge { width: 100%; border-collapse: collapse; }
.rv-charge th, .rv-charge td { text-align: left; padding: 7px 8px; font-family: var(--tal-font-family); font-size: 12.5px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent); }
.rv-charge th { font-family: var(--tal-font-numeric); font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--text-tertiary); }
.rv-charge .num { text-align: right; }

/* §2 battery SoC */
.rv-soc { display: flex; flex-direction: column; gap: 10px; }
.rv-soc-svg { width: 100%; height: auto; }
.rv-soc-floor { stroke: var(--text-tertiary); stroke-width: 1; }
.rv-soc-axis { fill: var(--text-tertiary); font-family: var(--tal-font-numeric); font-size: 9px; }

/* §3 capex bars */
.rv-capex { display: flex; flex-direction: column; gap: 9px; }
.rv-capex-row { display: grid; grid-template-columns: 130px 1fr auto; align-items: center; gap: 10px; }
.rv-capex-name { font-family: var(--tal-font-family); font-size: 12px; color: var(--text-primary); }
.rv-capex-track { position: relative; height: 14px; background: var(--bg-surface-2); border-radius: 5px; }
.rv-capex-fill { position: absolute; top: 0; height: 100%; background: var(--accent); border-radius: 5px; opacity: 0.85; }
.rv-capex-val { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
.rv-capex-total .rv-capex-name, .rv-capex-total .rv-capex-val { font-weight: 800; color: var(--accent); }

/* §3 payback + tco */
.rv-pay { width: 100%; height: auto; }
.rv-pay-zero { stroke: var(--text-tertiary); stroke-width: 1; }
.rv-pay-be { stroke: var(--accent); stroke-width: 1; }
.rv-pay-belbl { fill: var(--accent); font-family: var(--tal-font-numeric); font-size: 10px; }
.rv-tco { display: flex; align-items: flex-end; gap: 8px; height: 150px; }
.rv-tco-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; height: 100%; justify-content: flex-end; }
.rv-tco-bars { display: flex; align-items: flex-end; gap: 3px; height: 100%; width: 100%; justify-content: center; }
.rv-tco-cost { width: 38%; background: color-mix(in srgb, var(--text-primary) 30%, transparent); border-radius: 3px 3px 0 0; }
.rv-tco-offset { width: 38%; background: var(--accent); border-radius: 3px 3px 0 0; }
.rv-tco-yr { font-size: 10px; color: var(--text-tertiary); }

/* §4 requirements */
.rv-req { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
@media (max-width: 720px) { .rv-req { grid-template-columns: 1fr; } }
.rv-req-row { display: flex; align-items: center; gap: 9px; padding: 6px 0; font-family: var(--tal-font-family); font-size: 13px; }
.rv-req-mark { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 11px; font-weight: 800; }
.rv-req-ok .rv-req-mark { background: color-mix(in srgb, #2faa5a 25%, transparent); color: #54d98a; }
.rv-req-no .rv-req-mark { background: color-mix(in srgb, var(--accent) 25%, transparent); color: var(--accent); }
.rv-req-name { flex: 1; color: var(--text-primary); }
.rv-req-sev { font-family: var(--tal-font-numeric); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); }

/* §4 sensitivity */
.rv-sens { display: flex; flex-direction: column; gap: 10px; }
.rv-sens-card { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border); }
.rv-sens-ok { border-color: #2faa5a; background: color-mix(in srgb, #2faa5a 12%, transparent); }
.rv-sens-warn { border-color: var(--accent); background: var(--accent-soft); }
.rv-sens-val { font-family: var(--tal-font-numeric); font-size: 22px; font-weight: 800; color: var(--text-primary); }
.rv-sens-lbl { font-family: var(--tal-font-numeric); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); }
.rv-sens-note { margin: 0; font-family: var(--tal-font-family); font-size: 12.5px; color: var(--text-secondary); }

/* §4 assumptions */
.rv-assume { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
@media (max-width: 720px) { .rv-assume { grid-template-columns: 1fr; } }
.rv-assume > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 6px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 45%, transparent); }
.rv-assume dt { font-family: var(--tal-font-family); font-size: 12.5px; color: var(--text-secondary); margin: 0; }
.rv-assume dd { margin: 0; font-family: var(--tal-font-numeric); font-size: 12.5px; color: var(--text-primary); text-align: right; }
```

- [ ] **Step 2: Verify served CSS (proven dev-server method)**

```bash
pkill -9 -f next-server; lsof -ti tcp:3000 | xargs -r kill -9
lsof -ti tcp:3000 >/dev/null 2>&1 && echo "PORT BUSY" || echo "PORT FREE"
rm -rf .next
npm run dev > /tmp/tal-dev.log 2>&1 &
CSS=$(curl -s http://localhost:3000/ | grep -oE '/_next/static/[^"]+\.css' | head -1)
curl -s "http://localhost:3000$CSS" | grep -oE 'rv-flowmap|rv-duty-bar|rv-soc-svg|rv-capex-fill|rv-req-row' | sort -u
```

Expected: `PORT FREE`, then `rv-capex-fill`, `rv-duty-bar`, `rv-flowmap`, `rv-req-row`, `rv-soc-svg`.

- [ ] **Step 3: Full gate + commit**

```bash
npx vitest run            # all pass (existing + romCharts + romSensitivity)
npm run build             # clean
grep -rE "from 'react'|localStorage|from 'fs'" src/calc/romCharts.ts src/calc/romSensitivity.ts   # comments only / none
git add app/globals.css
git commit -m "feat(rom): ROM Dashboard visuals styles + final gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

**Spec coverage** (visuals spec §1–§4):
- §1 Flow diagram → Task 3 `flowDiagramSeries` + Task 8 `FlowDiagram`. ✓
- §2 Duty-cycle → Task 4 `dutyCycleSeries` + Task 8 `DutyCycleChart`. ✓
- §2 Utilization → Task 4 `utilizationSeries` + Task 9 `UtilizationChart`. ✓
- §2 Charging summary → Task 5 `chargingSeries` + Task 9 `ChargingSummary`. ✓
- §2 Battery SoC → Task 5 `batterySocSeries` + Task 10 `BatterySocChart`. ✓
- §3 CAPEX bars → Task 6 `capexBarsSeries` + Task 10 `CapexRangeBars`. ✓
- §3 Payback → Task 6 `paybackSeries` + Task 11 `PaybackCurve`. ✓
- §3 TCO → Task 6 `tcoSeries` + Task 11 `TcoStacked`. ✓
- §4 Requirements matrix → Task 12 `RequirementsMatrix` (+ Task 2 shared helper). ✓
- §4 Sensitivity/resilience → Task 7 `resilience` + Task 12 `SensitivityPanel`. ✓
- §4 Assumptions → Task 12 `AssumptionsPanel`. ✓
- Compose + wire + styles → Tasks 13–14. ✓
- Dropped items (CO₂, infra footprint) → correctly absent. ✓

**Placeholder scan:** every code step has complete code. The only deferred item is the optional ±throughput/+shift what-if rows, explicitly marked YAGNI with a complete TDD recipe in Task 7's note — not a placeholder in the shipped scope.

**Type consistency:** series types (`FlowDiagramSeries`, `DutyCycleSeries`, `UtilizationSeries`, `ChargingSeries`, `BatterySocSeries`, `CapexBarsSeries`, `PaybackSeries`, `TcoSeries`) are defined in Tasks 3–6 and imported by the exact same names in Tasks 8–11/13. `resilience({ fleet })` / `ResilienceInput` match between Task 7 and Task 12. `appRequirementsFromProject` (Task 2) is consumed by Task 12. `effDailyOpHr` (from the analytics plan's `romAnalytics.ts`) is reused in Task 13. `DutyKey` union matches between `romCharts.ts` and `DutyCycleChart`/CSS color map. Vehicle fields (`calc.ratedAh/voltageV/dischargeA/chargeA`, `name`, `priceRange`) match `vehicleLibrary.ts`.

**Scope:** two pure calc modules + one shared helper + eight chart components + three panels + one composition + CSS — cohesive, each independently testable, depends only on the prior ROM plans.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-07-rom-dashboard-visuals.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute here with checkpoints.

**Which approach?** (Reminder: this builds on the base ROM Dashboard + analytics plans — run those first. The paused PPTX plan can follow.)
