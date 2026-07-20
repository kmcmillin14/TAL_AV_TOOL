# ROM Dashboard (Step 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Step 4 placeholder with a customer-facing ROM Dashboard: fleet KPIs, ROM CAPEX pricing range, annual OPEX + payback, and a proposal PDF/JSON export — all fed by the Fleet Engine total.

**Architecture:** A new **pure** calc module `src/calc/rom.ts` turns a `FleetSummary` + economic assumptions into a `RomSummary` (CAPEX range, OPEX, payback). Economic assumptions persist as four defaulted project fields (labor rate, energy cost, maintenance %, operating days/yr). A shared `useFleetData(id)` hook centralizes the load→derive→`fleetSummary` chain (currently inline in step3) so the dashboard reuses it. The page composes focused components (`RomKpis`, `RomPricingTable`, `RomEconomics`, `RomExportBar`); the PDF export gains a fleet/ROM page.

**Tech Stack:** Next.js 16 App Router (client page), TypeScript strict, Zod 4, Vitest (pure calc TDD), pdf-lib (existing), localStorage persistence via `updateProject`. Imperial-first; USD pricing from vehicle JSON only; Toyota Type tokens only.

---

## Rules in force (from CLAUDE.md / ARCHITECTURE.md)

- **Spec-first:** Task 1 updates `docs/SPECIFICATION.md` + `docs/CHANGELOG.md` before code.
- **Calc purity:** everything in `src/calc/rom.ts` is a pure function — no React/fetch/localStorage/fs. Type-only `Vehicle` import is allowed (same as `fleet.ts`).
- **Pricing is a range** (`minUsd`/`maxUsd`), never a single value. Vehicle data from `src/content/vehicles/*.json` only.
- **Typography:** all new CSS uses `var(--tal-font-family)` / `var(--tal-font-numeric)` — never a literal font.
- **Folder hygiene:** `StepPlaceholder.tsx` becomes orphaned when step4 stops using it (it only supports `StepId = 4`) → delete it in the same task.
- **Gate after every task:** `npx vitest run` (all pass) + `npm run build` (clean) + ARCHITECTURE §6 purity grep + commit/push to `origin/main` (message ends with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` line).

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `docs/SPECIFICATION.md`, `docs/CHANGELOG.md` | Spec of record | Modify (Task 1) |
| `src/calc/rom.ts` | Pure ROM economics: pricing, OPEX, payback, `romSummary` | Create (Tasks 2–4) |
| `src/calc/__tests__/rom.test.ts` | Unit tests for the above | Create (Tasks 2–4) |
| `src/lib/validations/schemas.ts` | Add 4 economic-assumption fields | Modify (Task 5) |
| `src/lib/useFleetData.ts` | Shared load→derive→fleetSummary hook | Create (Task 6) |
| `src/components/rom/RomKpis.tsx` | Top KPI band | Create (Task 7) |
| `src/components/rom/RomPricingTable.tsx` | Per-vehicle CAPEX range table | Create (Task 7) |
| `src/components/rom/RomEconomics.tsx` | Editable cost inputs + OPEX/payback | Create (Task 8) |
| `src/components/rom/RomExportBar.tsx` | PDF + JSON download buttons | Create (Task 9) |
| `app/projects/[id]/step4/page.tsx` | Assemble the dashboard | Rewrite (Task 10) |
| `src/components/StepPlaceholder.tsx` | (orphaned) | Delete (Task 10) |
| `src/lib/pdfExport.ts` | Add fleet/ROM proposal page | Modify (Task 11) |
| `app/globals.css` | `.rom-*` styles | Modify (Task 12) |

---

### Task 1: Spec-first — document the ROM Dashboard

**Files:**
- Modify: `docs/SPECIFICATION.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add a ROM Dashboard section to the spec**

In `docs/SPECIFICATION.md`, find the Step 4 / ROM Dashboard section (or the end of the Fleet Engine section) and add:

```markdown
## Step 4 — ROM Dashboard

Customer-facing summary fed by the Fleet Engine `FleetSummary`. Read-only except the
economic assumptions.

**Fleet KPIs:** total fleet sold, vehicle-type count, total throughput (moves/hr),
total base→sold build-up.

**ROM pricing (range, never a point):** for each vehicle group,
`fleetSold × priceRange` → line range; summed to `totalMin`/`totalMax`; `totalMid =
(min+max)/2` used for downstream math only (never shown as "the price").

**Economic assumptions (persisted, editable, defaulted):**
- `laborRateUsdPerHr` (28), `energyCostUsdPerKwh` (0.12),
  `annualMaintenancePctOfCapex` (0.08), `operatingDaysPerYear` (312).

**Annual OPEX:** energy = Σ over groups of `(dischargeA × voltageV / 1000) kW ×
dailyOpHr × operatingDaysPerYear × fleetSold × energyCostUsdPerKwh`; maintenance =
`totalMid × annualMaintenancePctOfCapex`.

**Payback:** annual labor offset = `operatorsPerShift × shiftsPerDay × hoursPerShift ×
operatingDaysPerYear × laborRateUsdPerHr`; net benefit = labor offset − OPEX; payback
years = `totalMid / netBenefit` (— when net benefit ≤ 0).

**Export:** proposal PDF (existing embedded-JSON pattern, now with a fleet/ROM page) +
project JSON.
```

- [ ] **Step 2: Add a CHANGELOG entry**

At the top of the Unreleased/latest section in `docs/CHANGELOG.md`:

```markdown
### Added
- Step 4 ROM Dashboard: fleet KPIs, ROM CAPEX pricing range, annual OPEX + simple
  payback, and proposal PDF/JSON export — fed by the Fleet Engine total. Economics
  driven by four persisted assumptions (labor rate, energy cost, maintenance %,
  operating days/yr). New pure calc module `src/calc/rom.ts`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: spec ROM Dashboard (KPIs, pricing range, OPEX/payback, export)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: ROM pricing (pure calc + types)

**Files:**
- Create: `src/calc/rom.ts`
- Test: `src/calc/__tests__/rom.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/calc/__tests__/rom.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { romPricing } from '../rom'
import type { FleetSummary } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

// Minimal Vehicle stub — only the fields rom.ts reads.
function veh(id: string, minUsd: number, maxUsd: number, dischargeA = 100, voltageV = 48): Vehicle {
  return {
    id, priceRange: { minUsd, maxUsd },
    calc: { dischargeA, voltageV, ratedAh: 500, chargeA: 100 },
  } as unknown as Vehicle
}

function fleet(groups: Array<{ vehicleId: string; fleetSold: number }>): FleetSummary {
  return {
    groups: groups.map(g => ({
      vehicleId: g.vehicleId, groupRaw: 1, baseFleet: 1,
      charging: { method: 'plugged', runHr: 5, chargeHr: 5, availability: 0.5, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: g.fleetSold, fleetSold: g.fleetSold,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0,
    totalFleetSold: groups.reduce((s, g) => s + g.fleetSold, 0), bufferPct: 0.1,
  }
}

describe('romPricing', () => {
  it('multiplies fleetSold by the price range and sums lines', () => {
    const vById = new Map([['a', veh('a', 100, 200)], ['b', veh('b', 50, 75)]])
    const p = romPricing(fleet([{ vehicleId: 'a', fleetSold: 3 }, { vehicleId: 'b', fleetSold: 2 }]), vById)
    expect(p.lines[0]).toMatchObject({ vehicleId: 'a', fleetSold: 3, lineMin: 300, lineMax: 600 })
    expect(p.totalMin).toBe(400)   // 300 + 100
    expect(p.totalMax).toBe(750)   // 600 + 150
    expect(p.totalMid).toBe(575)   // (400+750)/2
  })

  it('treats a missing vehicle / price as zero', () => {
    const p = romPricing(fleet([{ vehicleId: 'ghost', fleetSold: 4 }]), new Map())
    expect(p.totalMin).toBe(0)
    expect(p.totalMax).toBe(0)
    expect(p.lines[0].unitMin).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/rom.test.ts`
Expected: FAIL — `Cannot find module '../rom'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/calc/rom.ts`:

```ts
// src/calc/rom.ts — ROM economics: CAPEX range, annual OPEX, simple payback. PURE.
// No React, no fetch, no localStorage, no fs. (Type-only Vehicle import, as in fleet.ts.)
import type { FleetSummary } from './types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

export interface RomCostInputs {
  laborRateUsdPerHr: number
  energyCostUsdPerKwh: number
  annualMaintenancePctOfCapex: number   // 0..1
  operatingDaysPerYear: number
}

export interface RomSchedule {
  dailyOpHr: number
  operatorsPerShift: number
  shiftsPerDay: number
  hoursPerShift: number
}

export interface RomPricingLine {
  vehicleId: string
  fleetSold: number
  unitMin: number
  unitMax: number
  lineMin: number
  lineMax: number
}

export interface RomPricing {
  lines: RomPricingLine[]
  totalMin: number
  totalMax: number
  totalMid: number            // (min+max)/2 — for downstream math only, never shown as "the price"
}

/** Per-vehicle CAPEX range = fleetSold × priceRange. Missing vehicle/price → 0. */
export function romPricing(fleet: FleetSummary, vehiclesById: Map<string, Vehicle>): RomPricing {
  const lines: RomPricingLine[] = fleet.groups.map(g => {
    const veh = vehiclesById.get(g.vehicleId)
    const unitMin = veh?.priceRange?.minUsd ?? 0
    const unitMax = veh?.priceRange?.maxUsd ?? 0
    return {
      vehicleId: g.vehicleId,
      fleetSold: g.fleetSold,
      unitMin, unitMax,
      lineMin: unitMin * g.fleetSold,
      lineMax: unitMax * g.fleetSold,
    }
  })
  const totalMin = lines.reduce((s, l) => s + l.lineMin, 0)
  const totalMax = lines.reduce((s, l) => s + l.lineMax, 0)
  return { lines, totalMin, totalMax, totalMid: (totalMin + totalMax) / 2 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/rom.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/rom.ts src/calc/__tests__/rom.test.ts
git commit -m "feat(rom): pure romPricing — fleetSold × price range → CAPEX total

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: ROM OPEX (pure calc)

**Files:**
- Modify: `src/calc/rom.ts`
- Test: `src/calc/__tests__/rom.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/rom.test.ts`:

```ts
import { romOpex } from '../rom'

describe('romOpex', () => {
  const costs = { laborRateUsdPerHr: 28, energyCostUsdPerKwh: 0.1, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 100 }
  const schedule = { dailyOpHr: 10, operatorsPerShift: 2, shiftsPerDay: 2, hoursPerShift: 8 }

  it('sums operating-draw energy across groups and adds maintenance', () => {
    const vById = new Map([['a', veh('a', 0, 0, 100, 48)]]) // 100A × 48V = 4.8 kW
    const f = fleet([{ vehicleId: 'a', fleetSold: 2 }])
    // energyKwh = 4.8 kW × 10 h × 100 d × 2 veh = 9600 ; cost = 960
    // maintenance = capexMid(100000) × 0.08 = 8000
    const o = romOpex(f, vById, costs, schedule, 100000)
    expect(o.annualEnergyKwh).toBeCloseTo(9600, 5)
    expect(o.annualEnergyCost).toBeCloseTo(960, 5)
    expect(o.annualMaintenance).toBeCloseTo(8000, 5)
    expect(o.annualOpex).toBeCloseTo(8960, 5)
  })

  it('skips groups whose vehicle is unknown', () => {
    const o = romOpex(fleet([{ vehicleId: 'ghost', fleetSold: 3 }]), new Map(), costs, schedule, 0)
    expect(o.annualEnergyKwh).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/rom.test.ts`
Expected: FAIL — `romOpex is not exported`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calc/rom.ts`:

```ts
export interface RomOpex {
  annualEnergyKwh: number
  annualEnergyCost: number
  annualMaintenance: number
  annualOpex: number
}

/** Annual OPEX = operating-draw energy (Σ groups) + maintenance (% of CAPEX mid).
 *  Operating power per vehicle = dischargeA × voltageV / 1000 (kW). */
export function romOpex(
  fleet: FleetSummary,
  vehiclesById: Map<string, Vehicle>,
  costs: RomCostInputs,
  schedule: RomSchedule,
  capexMid: number,
): RomOpex {
  let annualEnergyKwh = 0
  for (const g of fleet.groups) {
    const veh = vehiclesById.get(g.vehicleId)
    if (!veh) continue
    const kw = (veh.calc.dischargeA * veh.calc.voltageV) / 1000
    annualEnergyKwh += kw * schedule.dailyOpHr * costs.operatingDaysPerYear * g.fleetSold
  }
  const annualEnergyCost = annualEnergyKwh * costs.energyCostUsdPerKwh
  const annualMaintenance = capexMid * costs.annualMaintenancePctOfCapex
  return { annualEnergyKwh, annualEnergyCost, annualMaintenance, annualOpex: annualEnergyCost + annualMaintenance }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/rom.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/rom.ts src/calc/__tests__/rom.test.ts
git commit -m "feat(rom): annual OPEX — operating-draw energy + maintenance % of CAPEX

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: ROM payback + `romSummary` aggregator (pure calc)

**Files:**
- Modify: `src/calc/rom.ts`
- Test: `src/calc/__tests__/rom.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/rom.test.ts`:

```ts
import { romPayback, romSummary } from '../rom'

describe('romPayback', () => {
  const costs = { laborRateUsdPerHr: 30, energyCostUsdPerKwh: 0.1, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 250 }
  const schedule = { dailyOpHr: 16, operatorsPerShift: 2, shiftsPerDay: 2, hoursPerShift: 8 }

  it('computes labor offset, net benefit, and payback years', () => {
    // laborOffset = 2 ops × 2 shifts × 8 h × 250 d × $30 = 240000
    // net = 240000 − 40000 = 200000 ; payback = 600000 / 200000 = 3
    const p = romPayback(costs, schedule, 600000, 40000)
    expect(p.annualLaborOffset).toBeCloseTo(240000, 5)
    expect(p.netAnnualBenefit).toBeCloseTo(200000, 5)
    expect(p.paybackYears).toBeCloseTo(3, 5)
  })

  it('returns null payback when net benefit is not positive', () => {
    const p = romPayback(costs, schedule, 600000, 999999999)
    expect(p.paybackYears).toBeNull()
  })
})

describe('romSummary', () => {
  it('wires pricing → opex → payback together', () => {
    const vById = new Map([['a', veh('a', 100000, 100000, 100, 48)]])
    const f = fleet([{ vehicleId: 'a', fleetSold: 1 }])
    const costs = { laborRateUsdPerHr: 30, energyCostUsdPerKwh: 0.1, annualMaintenancePctOfCapex: 0.08, operatingDaysPerYear: 250 }
    const schedule = { dailyOpHr: 16, operatorsPerShift: 1, shiftsPerDay: 1, hoursPerShift: 8 }
    const s = romSummary(f, vById, costs, schedule)
    expect(s.pricing.totalMid).toBe(100000)
    expect(s.opex.annualMaintenance).toBeCloseTo(8000, 5)
    expect(s.payback.annualLaborOffset).toBeCloseTo(1 * 1 * 8 * 250 * 30, 5) // 60000
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/rom.test.ts`
Expected: FAIL — `romPayback is not exported`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/calc/rom.ts`:

```ts
export interface RomPayback {
  annualLaborOffset: number
  netAnnualBenefit: number
  paybackYears: number | null   // null when net benefit ≤ 0
}

/** Labor offset = operators across all shifts × annual hours × rate.
 *  Payback years = CAPEX mid / net annual benefit (null when benefit ≤ 0). */
export function romPayback(
  costs: RomCostInputs,
  schedule: RomSchedule,
  capexMid: number,
  annualOpex: number,
): RomPayback {
  const annualLaborOffset =
    schedule.operatorsPerShift * schedule.shiftsPerDay * schedule.hoursPerShift *
    costs.operatingDaysPerYear * costs.laborRateUsdPerHr
  const netAnnualBenefit = annualLaborOffset - annualOpex
  const paybackYears = netAnnualBenefit > 0 ? capexMid / netAnnualBenefit : null
  return { annualLaborOffset, netAnnualBenefit, paybackYears }
}

export interface RomSummary {
  pricing: RomPricing
  opex: RomOpex
  payback: RomPayback
}

/** One call for the dashboard: pricing → opex (uses CAPEX mid) → payback. */
export function romSummary(
  fleet: FleetSummary,
  vehiclesById: Map<string, Vehicle>,
  costs: RomCostInputs,
  schedule: RomSchedule,
): RomSummary {
  const pricing = romPricing(fleet, vehiclesById)
  const opex = romOpex(fleet, vehiclesById, costs, schedule, pricing.totalMid)
  const payback = romPayback(costs, schedule, pricing.totalMid, opex.annualOpex)
  return { pricing, opex, payback }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/calc/__tests__/rom.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full gate + commit**

```bash
npx vitest run && npm run build
grep -rE "from 'react'|localStorage|from 'fs'" src/calc/rom.ts   # expect: no matches
git add src/calc/rom.ts src/calc/__tests__/rom.test.ts
git commit -m "feat(rom): payback + romSummary aggregator (pricing → opex → payback)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Persist economic assumptions (schema)

**Files:**
- Modify: `src/lib/validations/schemas.ts:97` (after `chargeMethods`)
- Test: `src/calc/__tests__/rom.test.ts` (schema-default check) — OR `src/lib/__tests__/schemas.test.ts` if one exists; otherwise add to rom.test.ts.

- [ ] **Step 1: Write the failing test**

Append to `src/calc/__tests__/rom.test.ts`:

```ts
import { projectSchema } from '@/src/lib/validations/schemas'

describe('ROM economic-assumption defaults', () => {
  it('defaults labor/energy/maintenance/days when absent', () => {
    const parsed = projectSchema.parse({})
    expect(parsed.laborRateUsdPerHr).toBe(28)
    expect(parsed.energyCostUsdPerKwh).toBeCloseTo(0.12, 5)
    expect(parsed.annualMaintenancePctOfCapex).toBeCloseTo(0.08, 5)
    expect(parsed.operatingDaysPerYear).toBe(312)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/calc/__tests__/rom.test.ts -t "economic-assumption"`
Expected: FAIL — `laborRateUsdPerHr` is `undefined`.

- [ ] **Step 3: Add the fields**

In `src/lib/validations/schemas.ts`, immediately after the `chargeMethods` line (currently line 97):

```ts
  // ---- ROM Dashboard: economic assumptions (editable on Step 4) ----
  laborRateUsdPerHr: z.number().min(0).default(28),
  energyCostUsdPerKwh: z.number().min(0).default(0.12),
  annualMaintenancePctOfCapex: z.number().min(0).max(1).default(0.08),
  operatingDaysPerYear: z.number().int().min(1).max(366).default(312),
```

(No `defaultFields()` change needed — `StoredProject extends PartialProjectFormData`, all optional; the dashboard reads each with a `?? <default>` fallback, mirroring how `settings` is built in step3. `updateProject` already applies only caller-provided keys, so these won't clobber on partial patches.)

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run`
Expected: PASS (all, including the 1 new schema test; existing 107 unaffected).

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add src/lib/validations/schemas.ts src/calc/__tests__/rom.test.ts
git commit -m "feat(rom): persist 4 economic assumptions (labor, energy, maint%, days/yr)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: Shared `useFleetData(id)` hook

**Files:**
- Create: `src/lib/useFleetData.ts`

(This DRYs the load→derive→`fleetSummary` chain that is currently inline in
`app/projects/[id]/step3/page.tsx:46-100`. The dashboard consumes it. Step3 is
refactored onto it later in Task 13, keeping this task low-risk.)

- [ ] **Step 1: Create the hook**

Create `src/lib/useFleetData.ts`:

```ts
'use client'

import { useEffect, useMemo, useState } from 'react'
import { getProject, type StoredProject } from './storage'
import { fetchVehiclesCached } from './vehicleCache'
import type { Vehicle } from './vehicleLibrary'
import type { FleetSettings, Flow, FlowDerived } from '@/src/calc/types'
import { flowDerived, groupSummary } from '@/src/calc/flowMetrics'
import { fleetSummary } from '@/src/calc/fleet'

/** Centralizes the Fleet Engine data chain: load project + vehicles, derive flow
 *  metrics, group by vehicle, build settings, compute the FleetSummary. Used by the
 *  Fleet Engine (step3) and the ROM Dashboard (step4). Refreshes on storage/focus. */
export function useFleetData(id: string) {
  const [project, setProject] = useState<StoredProject | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const proj = getProject(id)
    if (!proj) { setError('Project not found.'); setLoading(false); return }
    setProject(proj)
    fetchVehiclesCached()
      .then(v => { setVehicles(v); setLoading(false) })
      .catch(() => { setError('Failed to load vehicle library.'); setLoading(false) })
  }, [id])

  useEffect(() => {
    const refresh = () => { const p = getProject(id); if (p) setProject(p) }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [id])

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])
  const flows: Flow[] = useMemo(() => project?.flows ?? [], [project])

  const derivedByFlowId = useMemo(() => {
    const m = new Map<string, FlowDerived>()
    for (const f of flows) {
      const veh = f.vehicleId ? vehicleById.get(f.vehicleId) : undefined
      m.set(f.id, flowDerived(f, veh))
    }
    return m
  }, [flows, vehicleById])

  const groups = useMemo(() => {
    const ids: string[] = []
    for (const f of flows) if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
    return ids.map(vid => groupSummary(vid, flows, derivedByFlowId))
  }, [flows, derivedByFlowId])

  const settings: FleetSettings = useMemo(() => ({
    regime: project?.chargeRegime ?? 'overnight',
    bufferPct: project?.bufferPct ?? 0.10,
    dailyOpHr: Math.min(24, (project?.shiftsPerDay ?? 1) * (project?.hoursPerShift ?? 8)),
    chargeMethods: project?.chargeMethods ?? {},
  }), [project])

  const fleet = useMemo(() => fleetSummary(groups, vehicleById, settings), [groups, vehicleById, settings])

  return { project, setProject, vehicles, vehicleById, loading, error, flows, derivedByFlowId, groups, settings, fleet }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: clean (the hook is unused so far — confirms it type-checks).

- [ ] **Step 3: Commit**

```bash
git add src/lib/useFleetData.ts
git commit -m "feat: shared useFleetData hook (load → derive → fleetSummary)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: `RomKpis` + `RomPricingTable` components

**Files:**
- Create: `src/components/rom/RomKpis.tsx`
- Create: `src/components/rom/RomPricingTable.tsx`

- [ ] **Step 1: Create the money/format helpers + KPIs**

Create `src/components/rom/RomKpis.tsx`:

```tsx
'use client'

import type { FleetSummary } from '@/src/calc/types'
import type { RomSummary } from '@/src/calc/rom'

export const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`

export const usdRange = (min: number, max: number) =>
  min === max ? usd(min) : `${usd(min)} – ${usd(max)}`

interface Props {
  fleet: FleetSummary
  rom: RomSummary
  flowCount: number
  totalThruPerHr: number
}

/** Top KPI band: fleet sold, vehicle types, throughput, CAPEX range, payback. */
export default function RomKpis({ fleet, rom, flowCount, totalThruPerHr }: Props) {
  const payback = rom.payback.paybackYears
  const kpis: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Total fleet', value: String(fleet.totalFleetSold), accent: true },
    { label: 'Vehicle types', value: String(fleet.groups.length) },
    { label: 'Flows', value: String(flowCount) },
    { label: 'Throughput', value: `${totalThruPerHr} / hr` },
    { label: 'ROM CAPEX', value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), accent: true },
    { label: 'Payback', value: payback == null ? '—' : `${payback.toFixed(1)} yr` },
  ]
  return (
    <section className="rom-kpis" aria-label="Fleet summary">
      {kpis.map(k => (
        <div key={k.label} className={`rom-kpi${k.accent ? ' rom-kpi-accent' : ''}`}>
          <span className="rom-kpi-val mono">{k.value}</span>
          <span className="rom-kpi-lbl">{k.label}</span>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 2: Create the pricing table**

Create `src/components/rom/RomPricingTable.tsx`:

```tsx
'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { RomPricing } from '@/src/calc/rom'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import { usd, usdRange } from './RomKpis'

interface Props {
  pricing: RomPricing
  vehicleById: Map<string, Vehicle>
}

/** Per-vehicle ROM line items → total CAPEX range. Price is ALWAYS a range. */
export default function RomPricingTable({ pricing, vehicleById }: Props) {
  if (pricing.lines.length === 0) {
    return <div className="rom-empty">Size the fleet in the Fleet Engine to see ROM pricing.</div>
  }
  return (
    <table className="rom-price-table">
      <thead>
        <tr>
          <th>Vehicle</th>
          <th className="num">Qty</th>
          <th className="num">Unit price (range)</th>
          <th className="num">Line total (range)</th>
        </tr>
      </thead>
      <tbody>
        {pricing.lines.map(l => {
          const veh = vehicleById.get(l.vehicleId)
          return (
            <tr key={l.vehicleId}>
              <td>
                <span className="rom-veh">
                  <VehicleDot vehicle={veh} size="sm" />
                  {veh?.name ?? l.vehicleId}
                </span>
              </td>
              <td className="num mono">{l.fleetSold}</td>
              <td className="num mono">{usdRange(l.unitMin, l.unitMax)}</td>
              <td className="num mono">{usdRange(l.lineMin, l.lineMax)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3} className="rom-price-total-lbl">Total ROM CAPEX</td>
          <td className="num mono rom-price-total">{usdRange(pricing.totalMin, pricing.totalMax)}</td>
        </tr>
        <tr>
          <td colSpan={3} className="rom-price-mid-lbl">Midpoint (planning)</td>
          <td className="num mono rom-price-mid">{usd(pricing.totalMid)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: clean (components unused so far — confirms types).

- [ ] **Step 4: Commit**

```bash
git add src/components/rom/RomKpis.tsx src/components/rom/RomPricingTable.tsx
git commit -m "feat(rom): RomKpis band + RomPricingTable (CAPEX range line items)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 8: `RomEconomics` component (editable assumptions + payback)

**Files:**
- Create: `src/components/rom/RomEconomics.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/rom/RomEconomics.tsx`. It renders the four editable cost
inputs and the computed OPEX/payback. Edits flow up via `onPatch` (the page persists
through `updateProject`).

```tsx
'use client'

import type { RomSummary, RomCostInputs } from '@/src/calc/rom'
import { usd } from './RomKpis'

export interface RomPatch {
  laborRateUsdPerHr?: number
  energyCostUsdPerKwh?: number
  annualMaintenancePctOfCapex?: number
  operatingDaysPerYear?: number
}

interface Props {
  costs: RomCostInputs
  rom: RomSummary
  onPatch: (patch: RomPatch) => void
}

const num = (s: string, min = 0) => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(min, n) : min
}

/** Editable economic assumptions + the OPEX/payback they drive. */
export default function RomEconomics({ costs, rom, onPatch }: Props) {
  const fields: Array<{ key: keyof RomCostInputs; label: string; value: number; step: string; suffix: string; toStore?: (n: number) => number; fromStore?: (n: number) => number }> = [
    { key: 'laborRateUsdPerHr', label: 'Labor rate', value: costs.laborRateUsdPerHr, step: '1', suffix: '$/hr' },
    { key: 'energyCostUsdPerKwh', label: 'Energy cost', value: costs.energyCostUsdPerKwh, step: '0.01', suffix: '$/kWh' },
    // maintenance stored as fraction 0..1; shown as percent.
    { key: 'annualMaintenancePctOfCapex', label: 'Maintenance', value: Math.round(costs.annualMaintenancePctOfCapex * 100), step: '1', suffix: '%/yr', toStore: n => n / 100 },
    { key: 'operatingDaysPerYear', label: 'Operating days', value: costs.operatingDaysPerYear, step: '1', suffix: 'days/yr' },
  ]

  return (
    <div className="rom-econ">
      <div className="rom-econ-inputs">
        {fields.map(f => (
          <label key={f.key} className="rom-econ-field">
            <span className="rom-econ-lbl">{f.label}</span>
            <span className="rom-econ-input-wrap">
              <input
                className="rom-econ-input mono"
                type="number" min="0" step={f.step} inputMode="decimal"
                value={f.value}
                onChange={e => {
                  const raw = num(e.target.value)
                  onPatch({ [f.key]: f.toStore ? f.toStore(raw) : raw } as RomPatch)
                }}
              />
              <span className="rom-econ-suffix">{f.suffix}</span>
            </span>
          </label>
        ))}
      </div>

      <dl className="rom-econ-out">
        <div><dt>Annual energy</dt><dd className="mono">{usd(rom.opex.annualEnergyCost)}</dd></div>
        <div><dt>Annual maintenance</dt><dd className="mono">{usd(rom.opex.annualMaintenance)}</dd></div>
        <div className="rom-econ-strong"><dt>Annual OPEX</dt><dd className="mono">{usd(rom.opex.annualOpex)}</dd></div>
        <div><dt>Annual labor offset</dt><dd className="mono">{usd(rom.payback.annualLaborOffset)}</dd></div>
        <div className="rom-econ-strong rom-econ-accent">
          <dt>Simple payback</dt>
          <dd className="mono">{rom.payback.paybackYears == null ? '—' : `${rom.payback.paybackYears.toFixed(1)} yr`}</dd>
        </div>
      </dl>
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/rom/RomEconomics.tsx
git commit -m "feat(rom): RomEconomics — editable assumptions driving OPEX + payback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 9: `RomExportBar` component

**Files:**
- Create: `src/components/rom/RomExportBar.tsx`

- [ ] **Step 1: Create the component**

Reuses the existing `downloadProjectPdf` / `projectJsonBlob` from `src/lib/pdfExport.ts`.

```tsx
'use client'

import { useState } from 'react'
import type { StoredProject } from '@/src/lib/storage'
import { downloadProjectPdf, projectJsonBlob } from '@/src/lib/pdfExport'
import Icon from '@/src/design-system/components/Icon'

interface Props { project: StoredProject }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Proposal export: PDF (embedded JSON) + raw project JSON. */
export default function RomExportBar({ project }: Props) {
  const [busy, setBusy] = useState(false)
  const base = (project.projectName || 'project').replace(/[^a-z0-9-_]+/gi, '_')

  return (
    <div className="rom-export">
      <button
        type="button" className="rom-export-btn rom-export-primary"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await downloadProjectPdf(project) } finally { setBusy(false) } }}
      >
        <Icon name="download" size={14} />
        {busy ? 'Building PDF…' : 'Download proposal PDF'}
      </button>
      <button
        type="button" className="rom-export-btn"
        onClick={() => download(projectJsonBlob(project), `${base}.json`)}
      >
        <Icon name="download" size={14} />
        Export JSON
      </button>
    </div>
  )
}
```

> **Note for executor:** confirm an icon named `download` exists in `src/design-system/components/Icon`. If not, use an existing icon name (grep the Icon component's name map) — do **not** introduce a new SVG just for this.

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/rom/RomExportBar.tsx
git commit -m "feat(rom): RomExportBar — proposal PDF + JSON download

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 10: Assemble the Step 4 page; delete the placeholder

**Files:**
- Rewrite: `app/projects/[id]/step4/page.tsx`
- Delete: `src/components/StepPlaceholder.tsx`

- [ ] **Step 1: Rewrite the page**

Replace `app/projects/[id]/step4/page.tsx` entirely:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import { useFleetData } from '@/src/lib/useFleetData'
import { updateProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import { romSummary, type RomCostInputs, type RomSchedule } from '@/src/calc/rom'
import RomKpis from '@/src/components/rom/RomKpis'
import RomPricingTable from '@/src/components/rom/RomPricingTable'
import RomEconomics, { type RomPatch } from '@/src/components/rom/RomEconomics'
import RomExportBar from '@/src/components/rom/RomExportBar'

export default function RomDashboardPage() {
  const params = useParams()
  const id = params.id as string
  const { project, setProject, vehicleById, loading, error, flows, fleet, settings } = useFleetData(id)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  const costs: RomCostInputs = useMemo(() => ({
    laborRateUsdPerHr: project?.laborRateUsdPerHr ?? 28,
    energyCostUsdPerKwh: project?.energyCostUsdPerKwh ?? 0.12,
    annualMaintenancePctOfCapex: project?.annualMaintenancePctOfCapex ?? 0.08,
    operatingDaysPerYear: project?.operatingDaysPerYear ?? 312,
  }), [project])

  const schedule: RomSchedule = useMemo(() => ({
    dailyOpHr: settings.dailyOpHr,
    operatorsPerShift: project?.operatorsPerShift ?? 0,
    shiftsPerDay: project?.shiftsPerDay ?? 1,
    hoursPerShift: project?.hoursPerShift ?? 8,
  }), [settings.dailyOpHr, project])

  const rom = useMemo(() => romSummary(fleet, vehicleById, costs, schedule), [fleet, vehicleById, costs, schedule])

  const flowCount = flows.length
  const totalThruPerHr = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))

  const patchCosts = (patch: RomPatch) => {
    const updated = updateProject(id, patch)
    if (updated) setProject(updated)
  }

  if (loading) return <div className="app-shell"><div className="step2-loading">Loading ROM dashboard…</div></div>
  if (error || !project) {
    return (
      <div className="app-shell">
        <div className="step2-error">
          <div className="step2-error-tag">Not Found</div>
          <h1>Could not load project</h1>
          <p>{error ?? 'This project does not exist in your browser.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <PersistentHeader
        project={{
          id: project.id,
          projectName: project.projectName ?? '',
          customerName: project.customerName ?? '',
          facilityLocation: project.facilityLocation,
          versionNumber: project.versionNumber,
          bastianRep: project.bastianRep,
          createdAt: project.createdAt,
          step1Complete: project.step1Complete,
          step2Complete: project.step2Complete,
          shiftsPerDay: project.shiftsPerDay,
          hoursPerShift: project.hoursPerShift,
          operatingDaysPattern: project.operatingDaysPattern,
        }}
        currentStep={4}
        showKpis
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => (u === 'imperial' ? 'metric' : 'imperial'))}
      />

      <div className="workspace">
        <div className="engine-head">
          <span className="eh-eyebrow mono">Step 04 / 04</span>
          <h1 className="eh-title">ROM Dashboard</h1>
          <p className="eh-sub">
            Rough-order fleet economics — total fleet, CAPEX range, operating cost, and a
            simple payback. Pricing is always a range; adjust the assumptions below to refine it.
          </p>
        </div>

        <RomKpis fleet={fleet} rom={rom} flowCount={flowCount} totalThruPerHr={totalThruPerHr} />

        <div className="rom-grid">
          <section className="rom-card">
            <span className="rom-card-eyebrow">ROM pricing</span>
            <RomPricingTable pricing={rom.pricing} vehicleById={vehicleById} />
          </section>
          <section className="rom-card">
            <span className="rom-card-eyebrow">Operating cost &amp; payback</span>
            <RomEconomics costs={costs} rom={rom} onPatch={patchCosts} />
          </section>
        </div>

        <section className="rom-card rom-card-export">
          <span className="rom-card-eyebrow">Proposal</span>
          <RomExportBar project={project} />
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the orphaned placeholder**

```bash
git rm src/components/StepPlaceholder.tsx
grep -rn "StepPlaceholder" app/ src/   # expect: no remaining imports
```

Expected: no matches (step4 was the only consumer).

- [ ] **Step 3: Build + run dev to verify the page renders**

```bash
npm run build
```

Expected: clean build, route `/projects/[id]/step4` present.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(rom): assemble Step 4 ROM Dashboard; remove StepPlaceholder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 11: Proposal PDF — add a fleet/ROM page

**Files:**
- Modify: `src/lib/pdfExport.ts` (insert a page before the `EMBED JSON` block, ~line 354)

- [ ] **Step 1: Compute the fleet inside the export**

`exportProjectPdf` already `await fetchVehiclesSafe()` near line 313. The fleet chain is
pure, so recompute it from the project. Add these imports at the top of `pdfExport.ts`
(alongside the existing imports):

```ts
import { flowDerived, groupSummary } from '../calc/flowMetrics'
import { fleetSummary } from '../calc/fleet'
import { romSummary } from '../calc/rom'
import type { FleetSettings, FlowDerived } from '../calc/types'
```

- [ ] **Step 2: Add the ROM page**

Immediately **before** the `// ─────────── EMBED JSON ───────────` block, insert:

```ts
  // ─────────── FLEET & ROM PRICING ───────────
  {
    const vById = new Map(vehicles.map(v => [v.id, v]))
    const flows = Array.isArray(project.flows) ? project.flows : []
    const derived = new Map<string, FlowDerived>()
    for (const f of flows) derived.set(f.id, flowDerived(f, f.vehicleId ? vById.get(f.vehicleId) : undefined))
    const vehIds: string[] = []
    for (const f of flows) if (f.vehicleId && !vehIds.includes(f.vehicleId)) vehIds.push(f.vehicleId)
    const groups = vehIds.map(vid => groupSummary(vid, flows, derived))

    const settings: FleetSettings = {
      regime: project.chargeRegime ?? 'overnight',
      bufferPct: project.bufferPct ?? 0.10,
      dailyOpHr: Math.min(24, (project.shiftsPerDay ?? 1) * (project.hoursPerShift ?? 8)),
      chargeMethods: project.chargeMethods ?? {},
    }
    const fleet = fleetSummary(groups, vById, settings)

    if (fleet.groups.length > 0) {
      const rom = romSummary(fleet, vById, {
        laborRateUsdPerHr: project.laborRateUsdPerHr ?? 28,
        energyCostUsdPerKwh: project.energyCostUsdPerKwh ?? 0.12,
        annualMaintenancePctOfCapex: project.annualMaintenancePctOfCapex ?? 0.08,
        operatingDaysPerYear: project.operatingDaysPerYear ?? 312,
      }, {
        dailyOpHr: settings.dailyOpHr,
        operatorsPerShift: project.operatorsPerShift ?? 0,
        shiftsPerDay: project.shiftsPerDay ?? 1,
        hoursPerShift: project.hoursPerShift ?? 8,
      })

      const page = pdfDoc.addPage([W, H])
      page.drawText('FLEET & ROM PRICING', { x: MX, y: H - 60, size: 10, font: bold, color: TAL_RED })
      page.drawLine({ start: { x: MX, y: H - 70 }, end: { x: W - MX, y: H - 70 }, thickness: 0.5, color: RULE })

      const money = (n: number) => `$${Math.round(n).toLocaleString()}`
      const range = (a: number, b: number) => (a === b ? money(a) : `${money(a)} – ${money(b)}`)

      let y = H - 100
      page.drawText('Total fleet', { x: MX, y, size: 9, font, color: MUTED })
      page.drawText(String(fleet.totalFleetSold), { x: MX + 200, y, size: 11, font: bold, color: TEXT })
      y -= 18
      page.drawText('ROM CAPEX', { x: MX, y, size: 9, font, color: MUTED })
      page.drawText(range(rom.pricing.totalMin, rom.pricing.totalMax), { x: MX + 200, y, size: 11, font: bold, color: TEXT })
      y -= 18
      page.drawText('Annual OPEX', { x: MX, y, size: 9, font, color: MUTED })
      page.drawText(money(rom.opex.annualOpex), { x: MX + 200, y, size: 11, font, color: TEXT })
      y -= 18
      page.drawText('Simple payback', { x: MX, y, size: 9, font, color: MUTED })
      page.drawText(rom.payback.paybackYears == null ? '—' : `${rom.payback.paybackYears.toFixed(1)} yr`, { x: MX + 200, y, size: 11, font, color: TEXT })
      y -= 30

      page.drawText('LINE ITEMS', { x: MX, y, size: 8, font: bold, color: MUTED }); y -= 16
      for (const l of rom.pricing.lines) {
        if (y < 80) break
        const name = vById.get(l.vehicleId)?.name ?? l.vehicleId
        page.drawText(`${l.fleetSold} × ${name}`, { x: MX, y, size: 10, font, color: TEXT })
        page.drawText(range(l.lineMin, l.lineMax), { x: W - MX - 160, y, size: 10, font: mono, color: TEXT })
        y -= 16
      }
    }
  }
```

- [ ] **Step 3: Build + verify the existing PDF tests still pass**

```bash
npx vitest run src/lib/__tests__/pdfExport.test.ts
npm run build
```

Expected: existing pdfExport tests PASS (the new page is additive); build clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdfExport.ts
git commit -m "feat(rom): add Fleet & ROM Pricing page to the proposal PDF

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 12: ROM Dashboard styles

**Files:**
- Modify: `app/globals.css` (append a `/* ─── ROM Dashboard ─── */` block)

- [ ] **Step 1: Add the styles**

Append to `app/globals.css`. All numerics use `var(--tal-font-numeric)`; reuse existing
tokens (`--bg-surface`, `--border`, `--accent`, `--accent-soft`, `--text-*`). Mirror the
existing `.charge-table` / `.engine-result` look for cohesion.

```css
/* ─── ROM Dashboard (Step 4) ─── */
.rom-kpis {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; margin-bottom: 20px;
}
@media (max-width: 1000px) { .rom-kpis { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 600px)  { .rom-kpis { grid-template-columns: repeat(2, 1fr); } }
.rom-kpi {
  display: flex; flex-direction: column; gap: 4px;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px;
}
.rom-kpi-accent { border-color: var(--accent); background: var(--accent-soft); }
.rom-kpi-val {
  font-family: var(--tal-font-numeric); font-variant-numeric: tabular-nums;
  font-size: 22px; font-weight: 800; line-height: 1.05; color: var(--text-primary);
}
.rom-kpi-accent .rom-kpi-val { color: var(--accent); }
.rom-kpi-lbl {
  font-family: var(--tal-font-numeric); font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-tertiary);
}

.rom-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 900px) { .rom-grid { grid-template-columns: 1fr; } }
.rom-card {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 20px 22px;
}
.rom-card-eyebrow {
  display: block; font-family: var(--tal-font-numeric); font-size: 10px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 14px;
}
.rom-empty { font-family: var(--tal-font-family); font-size: 13px; color: var(--text-tertiary); font-style: italic; }

.rom-price-table { width: 100%; border-collapse: collapse; }
.rom-price-table th, .rom-price-table td {
  text-align: left; padding: 9px 8px; font-family: var(--tal-font-family); font-size: 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}
.rom-price-table th {
  font-family: var(--tal-font-numeric); font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary);
}
.rom-price-table .num { text-align: right; }
.rom-veh { display: inline-flex; align-items: center; gap: 8px; }
.rom-price-total-lbl, .rom-price-mid-lbl {
  text-align: right; font-weight: 700; color: var(--text-secondary);
}
.rom-price-total { font-weight: 800; color: var(--accent); }
.rom-price-mid { color: var(--text-tertiary); }

.rom-econ-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
.rom-econ-field { display: flex; flex-direction: column; gap: 5px; }
.rom-econ-lbl {
  font-family: var(--tal-font-numeric); font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-tertiary);
}
.rom-econ-input-wrap { display: flex; align-items: center; gap: 8px; }
.rom-econ-input {
  width: 100%; background: var(--bg-surface-2); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 10px; color: var(--text-primary);
  font-family: var(--tal-font-numeric); font-variant-numeric: tabular-nums; font-size: 14px;
}
.rom-econ-input:focus { outline: none; border-color: var(--accent); }
.rom-econ-suffix { font-family: var(--tal-font-numeric); font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }
.rom-econ-out { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.rom-econ-out > div {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 6px 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}
.rom-econ-out dt { font-family: var(--tal-font-family); font-size: 13px; color: var(--text-secondary); margin: 0; }
.rom-econ-out dd { margin: 0; font-family: var(--tal-font-numeric); font-variant-numeric: tabular-nums; font-size: 14px; color: var(--text-primary); }
.rom-econ-strong dt, .rom-econ-strong dd { font-weight: 800; }
.rom-econ-accent dd { color: var(--accent); }

.rom-card-export { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.rom-export { display: flex; gap: 10px; }
.rom-export-btn {
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
  padding: 0 16px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--bg-surface-2); color: var(--text-primary);
  font-family: var(--tal-font-family); font-size: 13px; font-weight: 600; cursor: pointer;
  transition: transform 0.12s ease, background 0.18s ease;
}
.rom-export-btn:hover { background: color-mix(in srgb, var(--bg-surface-2) 70%, var(--text-primary) 6%); }
.rom-export-btn:active { transform: scale(0.97); }
.rom-export-btn:disabled { opacity: 0.5; cursor: default; }
.rom-export-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.rom-export-primary:hover { background: color-mix(in srgb, var(--accent) 88%, #000); }
```

- [ ] **Step 2: Verify served CSS (proven dev-server method)**

```bash
pkill -9 -f next-server; lsof -ti tcp:3000 | xargs -r kill -9
lsof -ti tcp:3000 >/dev/null 2>&1 && echo "PORT BUSY" || echo "PORT FREE"
rm -rf .next
npm run dev > /tmp/tal-dev.log 2>&1 &
# after Ready: confirm the new classes are in the served chunk
CSS=$(curl -s http://localhost:3000/ | grep -oE '/_next/static/[^"]+\.css' | head -1)
curl -s "http://localhost:3000$CSS" | grep -oE 'rom-kpi|rom-price-table|rom-econ-input' | sort -u
```

Expected: `PORT FREE`, then `rom-econ-input`, `rom-kpi`, `rom-price-table` all printed.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(rom): ROM Dashboard styles (KPI band, pricing table, economics, export)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

### Task 13: Refactor step3 onto `useFleetData` (DRY follow-up)

**Files:**
- Modify: `app/projects/[id]/step3/page.tsx:28-100`

(Optional-but-recommended cleanup now that the hook exists and is proven by step4. Keeps
all step3 tab/stage/View-Transition UI state; only the data-derivation block changes.)

- [ ] **Step 1: Replace the inline derivation with the hook**

In `app/projects/[id]/step3/page.tsx`, remove the local `project/vehicles/loading/error`
state, the two `useEffect`s (lines 46–67), and the `vehicleById`/`flows`/`derivedByFlowId`/
`groups`/`settings`/`fleet` memos (lines 69–100). Replace with:

```tsx
  const { project, setProject, vehicleById, loading, error, flows, derivedByFlowId, groups, settings, fleet } = useFleetData(id)
```

Keep `flowGroups`/`flowGroupColors` memos (they read `project`), the `tab`/`visited`/
`changeStage` UI state, and `persistPatch` (which calls `updateProject` + `setProject`).
Add the import: `import { useFleetData } from '@/src/lib/useFleetData'` and remove now-unused
imports (`getProject`, `fetchVehiclesCached`, `flowDerived`, `groupSummary`, `fleetSummary`,
`useEffect`, and the `FlowDerived` type if unused).

- [ ] **Step 2: Verify step3 still builds and behaves**

```bash
npm run build
grep -nE "getProject|fetchVehiclesCached|flowDerived|fleetSummary" app/projects/\[id\]/step3/page.tsx
```

Expected: build clean; grep shows no leftover unused imports (only `persistPatch`'s
`updateProject` remains, imported separately).

- [ ] **Step 3: Manual smoke**

In the dev server: open a project's Fleet Engine → flows render, groups/drag work,
Next/Back stage morph works, hero KPIs + build-up bar unchanged. Then Step 4 ROM Dashboard
shows matching fleet totals.

- [ ] **Step 4: Final gate + commit**

```bash
npx vitest run            # all pass (107 + new rom tests)
npm run build             # clean
grep -rE "from 'react'|localStorage|from 'fs'" src/calc/   # comments only, no imports
git add -A
git commit -m "refactor(step3): use shared useFleetData hook (DRY with ROM dashboard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

**Spec coverage** (against the four requested capabilities):
- *Fleet KPIs* → Task 7 `RomKpis` (fleet, types, flows, throughput) + Task 10 wiring. ✓
- *ROM pricing range* → Task 2 `romPricing` + Task 7 `RomPricingTable` (range never a point; `totalMid` only for math). ✓
- *Payback / OPEX* → Tasks 3–4 `romOpex`/`romPayback` + Task 5 persisted assumptions + Task 8 `RomEconomics`. ✓
- *Proposal export* → Task 9 `RomExportBar` + Task 11 PDF fleet/ROM page. ✓

**Placeholder scan:** every code step contains complete code; the only deferred item is the
Task 9 icon-name confirmation, which has an explicit fallback instruction (grep the Icon map,
reuse an existing name — no new SVG). No "TBD"/"add error handling"/"similar to" left.

**Type consistency:** `RomCostInputs`, `RomSchedule`, `RomPricing`/`RomPricingLine`, `RomOpex`,
`RomPayback`, `RomSummary`, `RomPatch` are defined in Tasks 2–4/8 and consumed with identical
names/shapes in Tasks 7–11. `romSummary(fleet, vehiclesById, costs, schedule)` signature is
used identically in the page (Task 10) and PDF (Task 11). Vehicle fields read (`priceRange.minUsd/maxUsd`,
`calc.dischargeA`, `calc.voltageV`) match `vehicleLibrary.ts`. Schedule fields
(`operatorsPerShift`, `shiftsPerDay`, `hoursPerShift`) match the project schema.

**Scope:** one page, one pure calc module, one shared hook, four small components, one PDF
page — cohesive and independently testable. No decomposition needed.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-07-rom-dashboard.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
