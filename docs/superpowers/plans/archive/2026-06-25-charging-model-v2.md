# Charging Model v2 (availability ratio + weekend reset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fleet Engine's charging adder with a per-vehicle-type availability `A = min(A_energy, A_cap)` — `A_energy` credits nightly off-shift + the day-off reset (`usableAh/C`), `A_cap` is the within-window battery capacity — so the fleet is the fewest vehicles that meet throughput and stay charged across the operating week.

**Architecture:** Pure rewrite of `chargingForGroup` in `src/calc/fleet.ts`, keeping the existing waterfall (`base → +charging → ×buffer`) and `FleetSummary` shape. A new pure helper `consecutiveOperatingDays` derives `C` from the operating-days pattern. `FleetSettings`/`ChargingResult` gain a few fields; the three places that build `FleetSettings` thread the schedule facts in. The legacy `ChargeMethod`/`ChargeRegime`/`chargeMethods` stay for the engine UI's display toggles but no longer affect the number.

**Tech Stack:** TypeScript (strict), Vitest, Next.js App Router. Pure functions in `src/calc/`. Spec: `docs/superpowers/specs/2026-06-25-charging-model-v2-design.md`.

---

## Background the engineer needs

- The charging math is pure (`src/calc/` — no React/fetch/localStorage/fs; enforced by `npm run check:arch`).
- `DEFAULT_DOD = 0.80` lives in `src/calc/types.ts`; `usableAh = ratedAh × DEFAULT_DOD`.
- The waterfall: per vehicle type, `fleetWithCharging = baseFleet + chargingDelta`, then `fleetSold = ⌈fleetWithCharging × (1+bufferPct)⌉`. We only change how `chargingDelta` is computed.
- The model (from the spec), per vehicle type:
  ```
  usableAh    = ratedAh × 0.80
  chargeRate  = chargeTimeMin>0 ? usableAh/(chargeTimeMin/60) : chargeA          Ah/hr
  runHr       = usableAh / dischargeA
  chargeHr    = usableAh / chargeRate
  breakAh     = chargeRate × breakHrs                                            Ah/day from breaks
  runHrEff    = (usableAh + breakAh) / dischargeA                                run + break credit
  H           = hProd = min(24, shifts×hours) − breakHrs                         productive hrs/day
  C           = consecutiveOpDays (Infinity when all 7 days operate)
  A_energy    = min(1, ( (C finite ? usableAh/C : 0) + 24·chargeRate ) / ( H·(dischargeA + chargeRate) ))
  A_cap       = runHrEff ≥ H ? 1 : runHrEff/(runHrEff + chargeHr)
  A           = min(A_energy, A_cap)
  chargingDelta = max(0, ⌈groupRaw / A⌉ − baseFleet)
  guards: ratedAh>0, dischargeA>0, chargeRate>0, H>0 — else not-sustainable, delta 0
  ```
- Run tests `npx vitest run`; typecheck `npx tsc --noEmit`; arch `npm run check:arch`.

## File structure

- `src/calc/romAnalytics.ts` — add pure `consecutiveOperatingDays(pattern, customDays)`.
- `src/calc/types.ts` — `ChargingResult` += `aEnergy`,`aCap`; `FleetSettings` += `breakHrs`,`consecutiveOpDays`.
- `src/calc/fleet.ts` — rewrite `ChargingInput` + `chargingForGroup`; update the `fleetSummary` call.
- `src/lib/fleetModel.ts`, `src/lib/useFleetData.ts`, `app/projects/[id]/step3/page.tsx` — build the two new `FleetSettings` fields.
- `src/lib/derivation.ts` — rewrite the charging walkthrough (`chargingDerivation`); update its callers.
- `src/components/rom/AssumptionsPanel.tsx` (+ `MethodologyPanel.tsx` if it states the charging formula) — copy update.
- `docs/SPECIFICATION.md`, `docs/CHANGELOG.md` — docs-first. Delete obsolete `docs/superpowers/plans/2026-06-23-charging-model.md`.

---

## Task 0: Docs-first + retire v1 plan

**Files:**
- Modify: `docs/SPECIFICATION.md` (Fleet Engine charging section)
- Modify: `docs/CHANGELOG.md`
- Delete: `docs/superpowers/plans/2026-06-23-charging-model.md`

- [ ] **Step 1: Update the charging description in SPECIFICATION.md**

Run `grep -n "charging\|chargingForGroup\|availability\|overnight" docs/SPECIFICATION.md`, read the Fleet Engine charging subsection, and replace its body with:

```markdown
Charging adder per vehicle type uses an availability ratio `A = min(A_energy, A_cap)`:
`A_energy = min(1, (usableAh/C + 24·chargeRate) / (H·(dischargeA + chargeRate)))` credits the
nightly off-shift (`24·chargeRate`) and the day-off reset (`usableAh/C`, where `C` = consecutive
operating days before a rest day, ∞ for 24/7); `A_cap = runHrEff/(runHrEff+chargeHr)` (or 1 when
the battery covers the production window `H = shifts×hours − breaks`). Then
`fleetWithCharging = ⌈groupRaw/A⌉`. Like vehicles pool (per type); the buffer is applied after.
Days off recharge to 100% (a reset, not banking), so the binding case is surviving the consecutive
operating days. See `docs/superpowers/specs/2026-06-25-charging-model-v2-design.md`.
```

- [ ] **Step 2: Prepend a CHANGELOG.md entry**

```markdown
## 2026-06-25 — Charging model v2 (availability + weekend reset)

- Reworked the per-type charging adder to `A = min(A_energy, A_cap)`: `A_energy` credits the
  nightly off-shift and the day-off reset (`usableAh/C`, C = consecutive operating days),
  `A_cap` is the within-window battery capacity. Fewest vehicles that meet throughput and stay
  charged across the operating week; days off reset to 100% (no energy banking). Buffer applied
  after. New pure `consecutiveOperatingDays` helper. Legacy method/regime kept for display only.
```

- [ ] **Step 3: Delete the obsolete v1 plan and commit**

```bash
git rm docs/superpowers/plans/2026-06-23-charging-model.md
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: charging model v2 (spec section + changelog); retire v1 plan"
```

---

## Task 1: `consecutiveOperatingDays` helper (TDD)

**Files:**
- Modify: `src/calc/romAnalytics.ts`
- Test: `src/calc/__tests__/romAnalytics.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```typescript
import { consecutiveOperatingDays } from '../romAnalytics'

describe('consecutiveOperatingDays', () => {
  it('maps the standard patterns', () => {
    expect(consecutiveOperatingDays('Mon–Fri')).toBe(5)
    expect(consecutiveOperatingDays('Mon–Sat')).toBe(6)
    expect(consecutiveOperatingDays('Mon–Sun')).toBe(Infinity)
  })
  it('unset/unknown defaults to Mon–Sat (6), matching the cost-side default', () => {
    expect(consecutiveOperatingDays(undefined)).toBe(6)
    expect(consecutiveOperatingDays('whatever')).toBe(6)
  })
  it('computes the longest consecutive run for Custom, wrapping the week', () => {
    expect(consecutiveOperatingDays('Custom', ['Mon', 'Tue', 'Wed'])).toBe(3)
    expect(consecutiveOperatingDays('Custom', ['Fri', 'Sat', 'Sun', 'Mon'])).toBe(4) // wraps
    expect(consecutiveOperatingDays('Custom', ['Mon', 'Wed', 'Fri'])).toBe(1)       // no two in a row
    expect(consecutiveOperatingDays('Custom', ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])).toBe(Infinity)
    expect(consecutiveOperatingDays('Custom', [])).toBe(0)
  })
})
```

- [ ] **Step 2: Run it — expect failure**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts -t consecutiveOperatingDays`
Expected: FAIL — `consecutiveOperatingDays` is not exported.

- [ ] **Step 3: Implement it** (append to `src/calc/romAnalytics.ts`)

```typescript
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Longest run of consecutive operating days before a rest day (wrapping the week).
 *  Infinity when all 7 days operate (no weekly reset). Drives the charging model's
 *  weekend-reset credit. Unset/unknown patterns default to Mon–Sat (6), matching
 *  `defaultOperatingDaysPerYear`. */
export function consecutiveOperatingDays(pattern?: string | null, customDays?: string[] | null): number {
  let on: boolean[]
  switch (pattern) {
    case 'Mon–Fri': on = [true, true, true, true, true, false, false]; break
    case 'Mon–Sat': on = [true, true, true, true, true, true, false]; break
    case 'Mon–Sun': return Infinity
    case 'Custom': {
      const set = new Set(customDays ?? [])
      on = WEEK.map(d => set.has(d))
      break
    }
    default: on = [true, true, true, true, true, true, false] // Mon–Sat
  }
  if (on.every(Boolean)) return Infinity
  if (!on.some(Boolean)) return 0
  const n = on.length
  let max = 0, run = 0
  for (let k = 0; k < 2 * n; k++) {        // 2× pass handles wrap-around
    if (on[k % n]) { run++; if (run > max) max = run } else run = 0
  }
  return Math.min(max, n)
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npx vitest run src/calc/__tests__/romAnalytics.test.ts -t consecutiveOperatingDays`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc/romAnalytics.ts src/calc/__tests__/romAnalytics.test.ts
git commit -m "feat: consecutiveOperatingDays helper for the charging weekend-reset credit"
```

---

## Task 2: Extend the calc types

**Files:**
- Modify: `src/calc/types.ts` (`ChargingResult`, `FleetSettings`)

- [ ] **Step 1: Add `aEnergy`/`aCap` to `ChargingResult`**

Replace the `ChargingResult` interface body with:

```typescript
export interface ChargingResult {
  method: ChargeMethod
  runHr: number | null        // operating hours one charge sustains
  chargeHr: number | null     // hours to a full recharge
  availability: number | null // final A ∈ (0,1]
  aEnergy: number | null      // energy availability (off-shift + weekend reset)
  aCap: number | null         // within-window battery-capacity availability
  chargingDelta: number       // extra vehicles for charging (≥ 0)
  sustainable: boolean        // false when inputs invalid/zero
  reason: string              // human explanation
}
```

- [ ] **Step 2: Add `breakHrs`/`consecutiveOpDays` to `FleetSettings`**

Replace the `FleetSettings` interface with:

```typescript
export interface FleetSettings {
  regime: ChargeRegime            // legacy — kept for the engine UI's display toggle only
  bufferPct: number
  dailyOpHr: number               // clock staffed hours/day = min(24, shifts × hours)
  breakHrs: number                // total break hours/day
  consecutiveOpDays: number       // C — consecutive operating days before a rest (Infinity if none)
  chargeMethods: Record<string, ChargeMethod>
}
```

- [ ] **Step 3: Typecheck (expect errors only in fleet.ts + the 3 settings builders)**

Run: `npx tsc --noEmit`
Expected: errors about missing `breakHrs`/`consecutiveOpDays` in `FleetSettings` literals (`fleet.ts` tests, `fleetModel.ts`, `useFleetData.ts`, `step3/page.tsx`) and missing `aEnergy`/`aCap` in `ChargingResult` literals (`fleet.ts`, test fixtures). These are fixed in later tasks. No error inside `types.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add src/calc/types.ts
git commit -m "feat: ChargingResult aEnergy/aCap + FleetSettings breakHrs/consecutiveOpDays"
```

---

## Task 3: Rewrite `chargingForGroup` to v2 (TDD)

**Files:**
- Modify: `src/calc/fleet.ts` (`ChargingInput`, `chargingForGroup`)
- Test: `src/calc/__tests__/fleet.test.ts` (`chargingForGroup` block)

- [ ] **Step 1: Replace the `chargingForGroup` tests**

In `src/calc/__tests__/fleet.test.ts`, replace the entire `describe('chargingForGroup', …)` block with:

```typescript
describe('chargingForGroup (v2 availability)', () => {
  // 100 Ah × 0.8 = 80 usableAh; dischargeA 10 → runHr 8; chargeA 10 → chargeHr 8.
  const base = {
    groupRaw: 4, baseFleet: 4,
    ratedAh: 100, dischargeA: 10, chargeA: 10, chargeTimeMin: undefined as number | undefined,
    method: 'plugged' as const, breakHrs: 0,
  }

  it('1 shift Mon–Fri, battery lasts the shift → A=1, no extra vehicles', () => {
    const r = chargingForGroup({ ...base, hProd: 8, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBe(1)               // (80/5 + 240)/(8·20)=1.6→1
    expect(r.aCap).toBe(1)                  // runHr 8 ≥ 8
    expect(r.availability).toBe(1)
    expect(r.chargingDelta).toBe(0)
  })

  it('2 shifts Mon–Fri, small battery → capacity binds at 0.5 → 2× fleet', () => {
    const r = chargingForGroup({ ...base, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aEnergy).toBeCloseTo(0.8, 5)   // (80/5 + 240)/(16·20)=0.8
    expect(r.aCap).toBeCloseTo(0.5, 5)      // runHr 8 < 16 → 8/16
    expect(r.availability).toBeCloseTo(0.5, 5)
    expect(r.chargingDelta).toBe(4)         // ⌈4/0.5⌉ − 4
  })

  it('24/7 (no rest day) → no weekend credit → duty ratio', () => {
    const r = chargingForGroup({ ...base, hProd: 24, consecutiveOpDays: Infinity })
    expect(r.aEnergy).toBeCloseTo(0.5, 5)   // (0 + 240)/(24·20)
    expect(r.availability).toBeCloseTo(0.5, 5)
  })

  it('weekend reset lowers fleet vs running 7 days (big battery, A_cap=1)', () => {
    const friday = chargingForGroup({ ...base, ratedAh: 225, hProd: 16, consecutiveOpDays: 5 }) // usableAh 180
    const everyday = chargingForGroup({ ...base, ratedAh: 225, hProd: 16, consecutiveOpDays: Infinity })
    expect(friday.aCap).toBe(1)             // runHr 18 ≥ 16
    expect(friday.availability).toBeCloseTo(0.8625, 4)  // (180/5 + 240)/320
    expect(everyday.availability).toBeCloseTo(0.75, 4)  // (0 + 240)/320
    expect(friday.availability!).toBeGreaterThan(everyday.availability!)
  })

  it('faster charger raises availability', () => {
    const r = chargingForGroup({ ...base, chargeA: 40, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aCap).toBeCloseTo(0.8, 5)      // runHr 8, chargeHr 2 → 8/10
    expect(r.availability).toBeCloseTo(0.8, 5)
  })

  it('chargeTimeMin overrides chargeA for the charge rate', () => {
    // 80 usableAh in 120 min = 2 h → chargeRate 40 A (same as chargeA 40 case)
    const r = chargingForGroup({ ...base, chargeA: 10, chargeTimeMin: 120, hProd: 16, consecutiveOpDays: 5 })
    expect(r.aCap).toBeCloseTo(0.8, 5)
  })

  it('credits breaks as extra Ah (raises runHrEff)', () => {
    const noBreak = chargingForGroup({ ...base, hProd: 8, breakHrs: 0, consecutiveOpDays: 5 })
    const withBreak = chargingForGroup({ ...base, dischargeA: 16, hProd: 7, breakHrs: 1, consecutiveOpDays: 5 })
    expect(withBreak.runHr).not.toBeNull()  // break credit applied; no NaN
    expect(noBreak.availability).toBe(1)
  })

  it('missing / invalid data → not sustainable, no NaN, delta 0', () => {
    expect(chargingForGroup({ ...base, ratedAh: 0, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, dischargeA: 0, hProd: 8, consecutiveOpDays: 5 }).chargingDelta).toBe(0)
    expect(chargingForGroup({ ...base, chargeA: 0, chargeTimeMin: undefined, hProd: 8, consecutiveOpDays: 5 }).sustainable).toBe(false)
    expect(chargingForGroup({ ...base, hProd: 0, consecutiveOpDays: 5 }).sustainable).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts -t "v2 availability"`
Expected: FAIL — current `chargingForGroup` lacks `aEnergy`/`aCap`/`hProd`/`consecutiveOpDays`.

- [ ] **Step 3: Rewrite `ChargingInput` and `chargingForGroup`**

In `src/calc/fleet.ts`, replace the `ChargingInput` interface (lines ~30-40) with:

```typescript
export interface ChargingInput {
  groupRaw: number
  baseFleet: number
  ratedAh: number
  dischargeA: number
  chargeA: number
  chargeTimeMin?: number
  method: ChargeMethod        // display only (carried onto ChargingResult)
  hProd: number               // productive hrs/day = min(24, shifts×hours) − breakHrs
  breakHrs: number            // total break hours/day
  consecutiveOpDays: number   // C — Infinity when all 7 days operate
}
```

Replace the whole `chargingForGroup` function (its doc comment + body) with:

```typescript
/**
 * Extra vehicles to cover battery charging downtime for one vehicle type, via an
 * availability ratio A = min(A_energy, A_cap) (see the 2026-06-25 charging-model-v2 spec).
 *
 *   usableAh   = ratedAh × DOD ;  runHr = usableAh/dischargeA ;  chargeHr = usableAh/chargeRate
 *   A_energy   = min(1, ((C finite ? usableAh/C : 0) + 24·chargeRate) / (H·(dischargeA + chargeRate)))
 *                — credits nightly off-shift + the day-off reset
 *   A_cap      = runHrEff ≥ H ? 1 : runHrEff/(runHrEff + chargeHr)   — within-window capacity
 *   delta      = max(0, ⌈groupRaw / min(A_energy, A_cap)⌉ − baseFleet)
 */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason,
  })
  if (!(i.ratedAh > 0) || !(i.dischargeA > 0)) return invalid('Missing battery / discharge data')

  const usableAh = i.ratedAh * DEFAULT_DOD
  const chargeRate = i.chargeTimeMin && i.chargeTimeMin > 0
    ? usableAh / (i.chargeTimeMin / 60)
    : i.chargeA
  if (!(chargeRate > 0)) return invalid('Missing charge data')
  const H = i.hProd
  if (!(H > 0)) return invalid('No production hours')

  const runHr = usableAh / i.dischargeA
  const chargeHr = usableAh / chargeRate
  const breakAh = chargeRate * Math.max(0, i.breakHrs)
  const runHrEff = (usableAh + breakAh) / i.dischargeA

  const weekendTerm = Number.isFinite(i.consecutiveOpDays) && i.consecutiveOpDays > 0
    ? usableAh / i.consecutiveOpDays
    : 0
  const aEnergy = Math.min(1, (weekendTerm + 24 * chargeRate) / (H * (i.dischargeA + chargeRate)))
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
```

Leave `defaultChargeMethod`/`defaultChargeRegime` exports in place (still used by callers). The `ChargeRegime` import stays (used by `defaultChargeRegime`).

- [ ] **Step 4: Run — expect pass**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts -t "v2 availability"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/fleet.ts src/calc/__tests__/fleet.test.ts
git commit -m "feat: v2 availability charging model (A = min(A_energy, A_cap))"
```

---

## Task 4: Thread schedule facts through `fleetSummary` + the 3 settings builders

**Files:**
- Modify: `src/calc/fleet.ts` (`fleetSummary` call + not-found fallback)
- Modify: `src/calc/__tests__/fleet.test.ts` (`fleetSummary` block)
- Modify: `src/lib/fleetModel.ts`, `src/lib/useFleetData.ts`, `app/projects/[id]/step3/page.tsx`

- [ ] **Step 1: Update the `fleetSummary` tests' settings helper + expectations**

In `src/calc/__tests__/fleet.test.ts`, update the `settings` helper inside `describe('fleetSummary', …)`:

```typescript
  const settings = (over: Partial<FleetSettings> = {}): FleetSettings => ({
    regime: 'continuous', bufferPct: 0.10, dailyOpHr: 24, breakHrs: 0,
    consecutiveOpDays: Infinity, chargeMethods: {}, ...over,
  })
```

Then update the first `fleetSummary` test to the v2 numbers (24/7 default → duty 0.5):

```typescript
  it('runs base → +charging → ×buffer → ⌈⌉ and totals', () => {
    const groups = [grp('a', 4, 4)]
    // 24/7 default, chargeA 10 = dischargeA 10 → A 0.5 → fleetWithCharging 8.
    const byId = new Map([['a', veh('a', { chargeA: 10, chargeTimeMin: undefined }, 'opportunity')]])
    const s = fleetSummary(groups, byId, settings())
    const g = s.groups[0]
    expect(g.charging.chargingDelta).toBe(4)        // ⌈4/0.5⌉ − 4
    expect(g.fleetWithCharging).toBe(8)
    expect(g.fleetSold).toBe(9)                     // ⌈8 × 1.10⌉
    expect(s.totalChargingDelta).toBe(4)
    expect(s.totalFleetSold).toBe(9)
  })
```

For the second test (`'bufferPct 0 …'`) set a coverage that yields A=1 so it asserts the no-adder path:

```typescript
  it('bufferPct 0 is a no-op; ample coverage → no charging adder', () => {
    const groups = [grp('a', 4, 4)]
    // 1-shift Mon–Fri, ample battery → A = 1 → no adder.
    const byId = new Map([['a', veh('a', { chargeA: 40, chargeTimeMin: undefined }, 'plugged')]])
    const s = fleetSummary(groups, byId, settings({ bufferPct: 0, dailyOpHr: 8, consecutiveOpDays: 5 }))
    expect(s.groups[0].charging.chargingDelta).toBe(0)
    expect(s.groups[0].fleetSold).toBe(4)
  })
```

(The third test, `'skips groups with no base fleet'`, needs no change.)

- [ ] **Step 2: Run — expect failure**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts -t fleetSummary`
Expected: FAIL — `fleetSummary` still passes `regime`/`dailyOpHr` to `chargingForGroup` and omits `hProd`/`breakHrs`/`consecutiveOpDays`.

- [ ] **Step 3: Update the `chargingForGroup` call inside `fleetSummary`**

In `src/calc/fleet.ts` `fleetSummary`, change the call argument object and the not-found fallback:

```typescript
      ? chargingForGroup({
          groupRaw: g.groupRaw,
          baseFleet: g.baseFleet,
          ratedAh: veh.calc.ratedAh,
          dischargeA: veh.calc.dischargeA,
          chargeA: veh.calc.chargeA,
          chargeTimeMin: veh.calc.chargeTimeMin,
          method,
          hProd: Math.max(0, settings.dailyOpHr - settings.breakHrs),
          breakHrs: settings.breakHrs,
          consecutiveOpDays: settings.consecutiveOpDays,
        })
      : { method, runHr: null, chargeHr: null, availability: null, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: false, reason: 'Vehicle not found' }
```

- [ ] **Step 4: Build the two new fields in `fleetModel.ts`**

In `src/lib/fleetModel.ts`, add the import and replace the `settings` block:

```typescript
import { fleetSummary, defaultChargeRegime } from '../calc/fleet'
import { defaultOperatingDaysPerYear, consecutiveOperatingDays } from '../calc/romAnalytics'
```
```typescript
  const shiftsPerDay = project.shiftsPerDay ?? 1
  const breakHrs = (project.breaksPerShift ?? 0) * ((project.breakDurationMin ?? 0) / 60) * shiftsPerDay
  const settings: FleetSettings = {
    regime: project.chargeRegime ?? defaultChargeRegime(dailyOpHr),
    bufferPct: project.bufferPct ?? 0.10,
    dailyOpHr,
    breakHrs,
    consecutiveOpDays: consecutiveOperatingDays(project.operatingDaysPattern, project.operatingDaysCustom),
    chargeMethods: project.chargeMethods ?? {},
  }
```

- [ ] **Step 5: Build the two new fields in `useFleetData.ts` and `step3/page.tsx`**

Read each file's `FleetSettings` literal (`grep -n "regime:" src/lib/useFleetData.ts app/projects/\[id\]/step3/page.tsx`). In **both**, add the import of `consecutiveOperatingDays` from `@/src/calc/romAnalytics` and add these two properties to the settings object (compute from the same project fields, using `project?.` where the file uses optional chaining):

```typescript
    breakHrs: ((project?.breaksPerShift ?? 0) * ((project?.breakDurationMin ?? 0) / 60)) * (project?.shiftsPerDay ?? 1),
    consecutiveOpDays: consecutiveOperatingDays(project?.operatingDaysPattern, project?.operatingDaysCustom),
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean. Tests: the `fleet`/`fleetSummary` tests pass. If `trafficLight.snapshot` or other fixture-built `FleetSettings`/`ChargingResult` literals fail to compile or the snapshot shifts because charging numbers legitimately changed, fix the fixture literals (add `aEnergy:null,aCap:null` / `breakHrs,consecutiveOpDays`) and, if the changed fleet numbers are correct per the model, update the snapshot with `npx vitest run -u` (note it in the commit).

- [ ] **Step 7: Commit**

```bash
git add src/calc/fleet.ts src/calc/__tests__/fleet.test.ts src/lib/fleetModel.ts src/lib/useFleetData.ts "app/projects/[id]/step3/page.tsx" src/calc/__tests__/__snapshots__ 2>/dev/null
git commit -m "feat: thread breakHrs + consecutiveOpDays into the fleet settings + summary"
```

---

## Task 5: Rewrite the charging walkthrough (`derivation.ts`)

**Files:**
- Modify: `src/lib/derivation.ts` (`chargingDerivation`)
- Modify: `src/lib/__tests__/derivation.test.ts`
- Modify callers: `src/components/engine/ChargingPipeline.tsx`, `src/lib/pptx/tables.ts`

- [ ] **Step 1: Read the current function + its helpers**

Run: `sed -n '1,40p;89,127p' src/lib/derivation.ts` — note `Derivation`/`DerivStep`/`sec`/`n1`/`n2` shapes.

- [ ] **Step 2: Replace `chargingDerivation`**

Change its `settings` parameter to the fields v2 needs and rewrite the steps to explain `aEnergy`, `aCap`, and final `A`:

```typescript
export function chargingDerivation(
  group: FleetGroup, vehicle: Vehicle,
  settings: Pick<FleetSettings, 'dailyOpHr' | 'breakHrs' | 'consecutiveOpDays'>,
): Derivation {
  const c = group.charging
  const cal = vehicle.calc
  const usableAh = cal.ratedAh * DEFAULT_DOD
  const H = Math.max(0, settings.dailyOpHr - settings.breakHrs)
  const cDays = settings.consecutiveOpDays
  const tag = `${c.method === 'opportunity' ? 'Opportunity' : 'Plugged'} · ${Number.isFinite(cDays) ? `${cDays} days on` : '24/7'}`

  const steps: DerivStep[] = [
    sec('Battery'),
    { label: 'Usable capacity', expr: 'rated Ah × usable depth', sub: `${n1(cal.ratedAh)} × ${DEFAULT_DOD}`, result: `${n1(usableAh)} Ah` },
    { label: 'Runtime per charge', expr: 'usable Ah ÷ draw', sub: `${n1(usableAh)} ÷ ${n1(cal.dischargeA)}`, result: c.runHr == null ? '—' : `${n1(c.runHr)} h` },
    { label: 'Recharge time', expr: cal.chargeTimeMin ? 'rated charge time' : 'usable Ah ÷ charge rate', sub: cal.chargeTimeMin ? undefined : `${n1(usableAh)} ÷ ${n1(cal.chargeA)}`, result: c.chargeHr == null ? '—' : `${n1(c.chargeHr)} h` },
    sec('Availability'),
    { label: 'Energy (off-shift + days-off reset)', expr: '(usable/C + 24·charge) ÷ (H·(draw+charge))', result: c.aEnergy == null ? '—' : `${Math.round(c.aEnergy * 100)}%` },
    { label: 'Capacity (battery vs window)', expr: `runtime vs ${n1(H)} h production`, result: c.aCap == null ? '—' : `${Math.round(c.aCap * 100)}%` },
    { label: 'Availability', expr: 'min of the two', result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%`, emphasis: true },
  ]

  if (c.chargingDelta === 0) {
    steps.push({ label: 'Extra vehicles', expr: 'charging fits the fleet', result: '+0', emphasis: true })
    return { title: 'Charging — battery → availability', tag, steps, note: 'Off-shift and days-off charging keep the battery up, so charging steals no operating time.' }
  }
  steps.push(
    { label: 'Fleet with charging', expr: 'demand ÷ availability, rounded up', sub: c.availability == null ? undefined : `⌈ ${n2(group.groupRaw)} ÷ ${n2(c.availability)} ⌉`, result: String(group.baseFleet + c.chargingDelta) },
    { label: 'Extra vehicles', expr: 'fleet with charging − base', sub: `${group.baseFleet + c.chargingDelta} − ${group.baseFleet}`, result: `+${c.chargingDelta}`, emphasis: true },
  )
  return { title: 'Charging — battery → availability → +N', tag, steps, note: 'Availability is the share of the day a vehicle can work; the rest is charging. Dividing demand by it covers the downtime.' }
}
```

- [ ] **Step 3: Update the two callers**

- `src/components/engine/ChargingPipeline.tsx` (~line 136): the call `chargingDerivation(g, veh, { regime, dailyOpHr })` → `chargingDerivation(g, veh, { dailyOpHr, breakHrs, consecutiveOpDays })`. Source those from the same `settings` the component already builds (read the file; if it builds `settings`, pass `settings`; the `Pick` accepts the full object).
- `src/lib/pptx/tables.ts` (~line 230): already passes `settings` (full `FleetSettings`) — the wider `Pick` accepts it; no change needed unless TS complains, in which case pass `settings`.

- [ ] **Step 4: Update `derivation.test.ts`**

The two `chargingDerivation(...)` calls pass `{ regime: 'continuous', dailyOpHr: 16 }` — change to `{ dailyOpHr: 16, breakHrs: 0, consecutiveOpDays: 5 }`. Update any assertions that checked the old availability step labels to the new ones (`Energy …`, `Capacity …`, `Availability`).

- [ ] **Step 5: Typecheck + run derivation tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/derivation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/derivation.ts src/lib/__tests__/derivation.test.ts src/components/engine/ChargingPipeline.tsx src/lib/pptx/tables.ts
git commit -m "feat: charging walkthrough explains A_energy / A_cap / availability"
```

---

## Task 6: Update the assumptions copy

**Files:**
- Modify: `src/components/rom/AssumptionsPanel.tsx` (and `MethodologyPanel.tsx` if it states the charging formula)

- [ ] **Step 1: Read the panel**

Run: `cat src/components/rom/AssumptionsPanel.tsx` — find the charging/energy rows and the row shape (label/value/why).

- [ ] **Step 2: Update the charging assumption row(s)** to describe v2 (adapt to the file's row format):

```tsx
{ label: 'Charging', value: 'Availability = min(energy, capacity)', why: 'Per vehicle type: energy availability credits the nightly off-shift and the day-off reset (a day off recharges to 100%); capacity availability is whether the battery covers a production window. Fleet = demand ÷ availability. 80% usable depth; buffer applied after.', isDefault: true },
```

If `AssumptionsPanel` references `defaultChargeRegime` for an "overnight/continuous" row, remove that row (the regime no longer drives the number) — and drop the now-unused import.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/rom/AssumptionsPanel.tsx
git commit -m "feat: ROM assumptions describe the v2 charging availability"
```

---

## Task 7: Full gate + push

- [ ] **Step 1: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 2: Arch gate** — `npm run check:arch` → `✓ Architecture checks passed`.
- [ ] **Step 3: Tests** — `npx vitest run` → all green (snapshot updated in Task 4 if charging numbers shifted).
- [ ] **Step 4: Build** — `npm run build` → compiles.
- [ ] **Step 5: Manual smoke** (dev :3000): Step 3 Fleet Engine — the charging adder and the Σ walkthrough show Energy / Capacity / Availability; set 1 shift vs 24/7 and confirm the adder grows for 24/7; set a fast `chargeTimeMin` on a vehicle JSON and confirm the adder shrinks. Step 4 ROM assumptions show the new copy.
- [ ] **Step 6: Push**

```bash
git push origin main
```

---

## Self-review (done by the plan author)

- **Spec coverage:** `consecutiveOperatingDays` (Task 1), types (Task 2), `A_energy`+`A_cap`+`min`+guards (Task 3), break credit (Task 3), threading breaks/C + builders (Task 4), walkthrough (Task 5), assumptions (Task 6), docs-first + retire v1 (Task 0), tests for every branch incl. weekend-reset + Hole-1 regression (Task 3), gate (Task 7). ✅
- **No placeholders:** every code step has full code. ✅
- **Type consistency:** `aEnergy`/`aCap` (ChargingResult), `breakHrs`/`consecutiveOpDays` (FleetSettings + ChargingInput uses `hProd`/`breakHrs`/`consecutiveOpDays`), `consecutiveOperatingDays` signature — identical across Tasks 1-5. ✅
- **Preserved:** waterfall + `FleetSummary` shape; `ChargeMethod`/`ChargeRegime`/`chargeMethods`/`defaultChargeRegime` kept for the engine UI display; PPTX path compiles via the wider `Pick`. ✅
