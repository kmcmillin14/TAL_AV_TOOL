# Shift-Coverage-Aware Charging Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fleet Engine's charging availability with one closed-form, shift-coverage-aware energy balance so the "vehicles added for charging" number is accurate across 1-shift, 2-shift, and 24 h operations (and sustains a full 7-day week).

**Architecture:** Keep the existing waterfall `base → +charging → ×buffer` and the `fleetWithCharging = ⌈groupRaw / A⌉` shape; only the availability `A` changes. New `A = min(1, A_energy, A_cap)` where `A_energy` is a daily charge-vs-discharge balance (breaks + idle + off-shift all charge) and `A_cap` is an endurance check on the longest run between break top-ups (can force an adder). Breaks finally reach the sizing path. The pure-`calc/` purity, the PPTX/Excel series, and the `ChargingResult`/`FleetSummary` shapes are preserved (fields are added, not removed).

**Tech Stack:** TypeScript (strict), Vitest, Next.js App Router. Pure functions in `src/calc/`. Spec: `docs/superpowers/specs/2026-06-23-charging-model-design.md`.

---

## Background the engineer needs

- The charging math is a **pure** function `chargingForGroup` in `src/calc/fleet.ts`. It must not import React/fetch/localStorage/fs (enforced by `npm run check:arch`).
- `usableAh = ratedAh × DEFAULT_DOD` where `DEFAULT_DOD = 0.80` (in `src/calc/types.ts`).
- Today the function branches on a `regime: 'overnight' | 'continuous'`. The new model does **not** branch on regime, but we **keep** the `ChargeRegime` type, `defaultChargeRegime`, and `FleetSettings.regime` because other files (`derivation.ts`, `AssumptionsPanel.tsx`, `step3/page.tsx`, `ChargingPipeline.tsx`, `useFleetData.ts`) still reference them for display. Do **not** delete them.
- The model math (from the spec):
  ```
  usableAh  = ratedAh × 0.80
  chargeA   = chargeTimeMin>0 ? usableAh/(chargeTimeMin/60) : chargeA(spec)
  runHr     = usableAh / dischargeA
  chargeHr  = usableAh / chargeA
  D         = min(24, dailyOpHr)                 clock hrs/day
  B         = clamp(breakHrs, 0, D)              break hrs/day
  Wp        = D − B                              production window
  segment   = Wp / (breaksPerDay + 1)            longest run between break top-ups
  A_energy  = min(1, chargeA·24 / (Wp·(dischargeA + chargeA)))
  A_cap     = runHr ≥ segment ? 1 : runHr/(runHr + chargeHr)
  A         = min(1, A_energy, A_cap)
  fleetWithCharging = ⌈ groupRaw / A ⌉
  chargingDelta     = max(0, fleetWithCharging − baseFleet)
  bufferTight       = A_cap < 1
  ```
- Run all tests with `npx vitest run`. Typecheck with `npx tsc --noEmit`. Arch gate with `npm run check:arch`.

## File structure (what changes and why)

- `src/calc/types.ts` — extend `FleetSettings` (`breakHrs`, `breaksPerDay`) and `ChargingResult` (`aEnergy`, `aCap`, `segmentHr`, `bufferTight`). Pure type changes.
- `src/calc/fleet.ts` — rewrite `chargingForGroup` internals to the energy balance; extend `ChargingInput`; thread `breakHrs`/`breaksPerDay` through `fleetSummary`.
- `src/calc/__tests__/fleet.test.ts` — rewrite the charging expectations to the new model.
- `src/lib/fleetModel.ts` — compute `breakHrs` + `breaksPerDay` from the project schedule and pass into `FleetSettings`.
- `src/lib/useFleetData.ts` and `app/projects/[id]/step3/page.tsx` — same `FleetSettings` additions (these build settings independently for the React path).
- `src/lib/derivation.ts` — update the charging walkthrough mirror to the new math.
- `src/components/rom/AssumptionsPanel.tsx` — add the new assumption rows.
- `docs/SPECIFICATION.md`, `docs/CHANGELOG.md` — docs-first.

---

## Task 0: Docs-first — SPECIFICATION + CHANGELOG

**Files:**
- Modify: `docs/SPECIFICATION.md` (Step 4 / Fleet Engine charging section)
- Modify: `docs/CHANGELOG.md` (prepend new entry)

- [ ] **Step 1: Find the charging description in SPECIFICATION.md**

Run: `grep -n "charging\|chargingForGroup\|overnight\|availability" docs/SPECIFICATION.md`
Read the matched section (around the Step 4 / Fleet Engine waterfall).

- [ ] **Step 2: Update the charging paragraph in SPECIFICATION.md**

Replace the description of the overnight/availability model with the new one. Use this text (adapt surrounding wording to match the file's voice):

```markdown
Charging adder per vehicle group uses a shift-coverage-aware energy balance. The
charging availability is `A = min(1, A_energy, A_cap)`:
`A_energy = chargeA·24 / (Wp·(dischargeA + chargeA))` (daily charge-vs-discharge,
where breaks, idle and the off-shift window all charge; `Wp = D − breaks`,
`D = min(24, shifts×hours)`), and `A_cap = runHr/(runHr+chargeHr)` when the battery
cannot survive the longest run between break top-ups (`segment = Wp/(breaksPerDay+1)`),
else 1. Then `fleetWithCharging = ⌈groupRaw/A⌉`. Breaks now enter sizing (previously
they only affected the SoC chart). The model sustains a single shift, a full 24 h day,
and a full 7-day week by construction; a battery cannot bank energy, so the
operating-days pattern affects only annual cost, not the adder.
```

- [ ] **Step 3: Prepend a CHANGELOG.md entry**

Add at the top (under `# Changelog`):

```markdown
## 2026-06-23 — Shift-coverage-aware charging model

- Replaced the Fleet Engine's overnight/availability charging logic with a
  closed-form energy balance: `A = min(1, A_energy, A_cap)`. Breaks, idle time and
  the off-shift window now all count as charge windows, and breaks finally enter the
  fleet sizing (previously they only touched the SoC chart). An endurance check
  (`runHr` vs the run between break top-ups) can force an adder. Sustains single
  shift / 24 h day / 7-day week by construction. PPTX/Excel series unchanged.
```

- [ ] **Step 4: Commit**

```bash
git add docs/SPECIFICATION.md docs/CHANGELOG.md
git commit -m "docs: shift-coverage-aware charging model (spec + changelog)"
```

---

## Task 1: Extend the calc types

**Files:**
- Modify: `src/calc/types.ts:149-183` (`ChargingResult`, `FleetSettings`)

- [ ] **Step 1: Add the new `ChargingResult` fields**

In `src/calc/types.ts`, replace the `ChargingResult` interface body so it reads:

```typescript
export interface ChargingResult {
  method: ChargeMethod
  runHr: number | null        // operating hours one charge sustains
  chargeHr: number | null     // hours to a full recharge
  availability: number | null // final A ∈ (0,1]
  aEnergy: number | null      // daily energy-balance availability
  aCap: number | null         // endurance-limited availability (battery vs longest run)
  segmentHr: number | null    // longest productive run between break top-ups
  bufferTight: boolean        // endurance binds (aCap < 1) — battery buffer tight
  chargingDelta: number       // extra vehicles for charging (≥ 0)
  sustainable: boolean        // false when inputs invalid/zero
  reason: string              // human explanation
}
```

- [ ] **Step 2: Add the new `FleetSettings` fields**

Replace the `FleetSettings` interface so it reads:

```typescript
export interface FleetSettings {
  regime: ChargeRegime
  bufferPct: number
  dailyOpHr: number           // clock day D = min(24, shifts × hours)
  breakHrs: number            // total break hours per day (B)
  breaksPerDay: number        // number of break windows per day
  chargeMethods: Record<string, ChargeMethod>
}
```

- [ ] **Step 3: Verify it compiles (expect errors only in fleet.ts and settings builders)**

Run: `npx tsc --noEmit`
Expected: errors about missing `breakHrs`/`breaksPerDay` in object literals (fleet.ts, fleetModel.ts, useFleetData.ts, step3/page.tsx) and missing `ChargingResult` fields in fleet.ts. These are fixed in later tasks. No errors inside `types.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add src/calc/types.ts
git commit -m "feat: extend ChargingResult and FleetSettings for energy-balance charging"
```

---

## Task 2: Rewrite `chargingForGroup` to the energy balance (TDD)

**Files:**
- Modify: `src/calc/fleet.ts:30-90` (`ChargingInput`, `chargingForGroup`)
- Test: `src/calc/__tests__/fleet.test.ts:15-54` (`chargingForGroup` block)

- [ ] **Step 1: Replace the `chargingForGroup` tests with the new model's expectations**

In `src/calc/__tests__/fleet.test.ts`, replace the entire `describe('chargingForGroup', …)` block (lines ~15-54) with:

```typescript
describe('chargingForGroup', () => {
  // ratedAh 100 × 0.8 DoD = 80 usableAh; dischargeA 10 → runHr 8; chargeTimeMin 120 → chargeHr 2, chargeA 40.
  const base = {
    groupRaw: 4, baseFleet: 4,
    ratedAh: 100, dischargeA: 10, chargeA: 40, chargeTimeMin: 120,
    method: 'plugged' as const,
  }

  it('single shift with ample off-shift → A=1, no extra vehicles', () => {
    // D=8, B=0, Wp=8. A_energy = 40·24/(8·50)=2.4→1. segment=8, runHr 8≥8 → A_cap=1.
    const r = chargingForGroup({ ...base, dailyOpHr: 8, breakHrs: 0, breaksPerDay: 0 })
    expect(r.aEnergy).toBe(1)
    expect(r.aCap).toBe(1)
    expect(r.availability).toBe(1)
    expect(r.chargingDelta).toBe(0)
    expect(r.bufferTight).toBe(false)
    expect(r.sustainable).toBe(true)
  })

  it('a break splits the shift so the battery endures → still +0 (cliff fixed)', () => {
    // runHr 5 (dischargeA 16 → 80/16=5). D=8,B=0,Wp=8,breaksPerDay=1 → segment=4. runHr 5≥4 → A_cap=1.
    const r = chargingForGroup({ ...base, dischargeA: 16, dailyOpHr: 8, breakHrs: 0, breaksPerDay: 1 })
    expect(r.segmentHr).toBeCloseTo(4, 5)
    expect(r.aCap).toBe(1)
    expect(r.availability).toBe(1)
    expect(r.chargingDelta).toBe(0)
  })

  it('no break to bridge a short battery → endurance binds, adder forced', () => {
    // runHr 5, D=8,B=0,Wp=8,breaksPerDay=0 → segment=8. runHr 5<8 → A_cap=5/(5+chargeHr).
    // chargeHr: chargeTimeMin 120 → 2. A_cap = 5/7 ≈ 0.714. A_energy=40·24/(8·56)=2.14→1. A=0.714.
    const r = chargingForGroup({ ...base, dischargeA: 16, dailyOpHr: 8, breakHrs: 0, breaksPerDay: 0 })
    expect(r.chargeHr).toBeCloseTo(2, 5)
    expect(r.aCap).toBeCloseTo(5 / 7, 4)
    expect(r.bufferTight).toBe(true)
    expect(r.chargingDelta).toBe(2)               // ⌈4 / (5/7)⌉ − 4 = ⌈5.6⌉ − 4 = 2
  })

  it('24h continuous, slow charge → energy balance limits availability', () => {
    // chargeA 10 (override chargeTimeMin away). D=24,B=0,Wp=24. A_energy=10·24/(24·20)=0.5.
    // runHr 8, segment=24 → A_cap=8/(8+chargeHr). chargeHr=80/10=8 → A_cap=0.5. A=0.5.
    const r = chargingForGroup({ ...base, chargeA: 10, chargeTimeMin: undefined, dailyOpHr: 24, breakHrs: 0, breaksPerDay: 0 })
    expect(r.aEnergy).toBeCloseTo(0.5, 5)
    expect(r.availability).toBeCloseTo(0.5, 5)
    expect(r.chargingDelta).toBe(4)               // ⌈4/0.5⌉ − 4 = 4
  })

  it('breaks shrink the production window → A_energy falls', () => {
    // chargeA 10, D=24, B=4, Wp=20. A_energy = 10·24/(20·20) = 0.6.
    const r = chargingForGroup({ ...base, chargeA: 10, chargeTimeMin: undefined, dailyOpHr: 24, breakHrs: 4, breaksPerDay: 2 })
    expect(r.aEnergy).toBeCloseTo(0.6, 5)
  })

  it('missing data → not sustainable, no NaN, delta 0', () => {
    const r = chargingForGroup({ ...base, ratedAh: 0, dailyOpHr: 24, breakHrs: 0, breaksPerDay: 0 })
    expect(r.sustainable).toBe(false)
    expect(r.runHr).toBeNull()
    expect(r.aEnergy).toBeNull()
    expect(r.chargingDelta).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts -t chargingForGroup`
Expected: FAIL — current implementation lacks `aEnergy`/`aCap`/`segmentHr`/`bufferTight` and uses the old `regime` input.

- [ ] **Step 3: Rewrite `ChargingInput` and `chargingForGroup` in `src/calc/fleet.ts`**

Replace the `ChargingInput` interface (lines ~30-40) with:

```typescript
export interface ChargingInput {
  groupRaw: number
  baseFleet: number
  ratedAh: number
  dischargeA: number
  chargeA: number
  chargeTimeMin?: number
  method: ChargeMethod
  dailyOpHr: number       // clock day D
  breakHrs: number        // total break hours per day (B)
  breaksPerDay: number    // number of break windows per day
}
```

Replace the whole `chargingForGroup` function (lines ~42-90, including its doc comment) with:

```typescript
/**
 * Extra vehicles to cover battery charging downtime for one vehicle group, via a
 * shift-coverage-aware energy balance (see the 2026-06-23 charging-model spec).
 *
 *   usableAh = ratedAh × DOD ;  runHr = usableAh/dischargeA ;  chargeHr = usableAh/chargeA
 *   D = min(24, dailyOpHr) ;  B = clamp(breakHrs,0,D) ;  Wp = D − B
 *   segment  = Wp / (breaksPerDay + 1)
 *   A_energy = min(1, chargeA·24 / (Wp·(dischargeA + chargeA)))   (breaks+idle+off-shift charge)
 *   A_cap    = runHr ≥ segment ? 1 : runHr/(runHr + chargeHr)     (endurance; can force an adder)
 *   A        = min(1, A_energy, A_cap)
 *   delta    = max(0, ⌈groupRaw / A⌉ − baseFleet)
 */
export function chargingForGroup(i: ChargingInput): ChargingResult {
  const invalid = (reason: string): ChargingResult => ({
    method: i.method, runHr: null, chargeHr: null, availability: null,
    aEnergy: null, aCap: null, segmentHr: null, bufferTight: false,
    chargingDelta: 0, sustainable: false, reason,
  })
  if (!(i.ratedAh > 0) || !(i.dischargeA > 0)) return invalid('Missing battery / discharge data')

  const usableAh = i.ratedAh * DEFAULT_DOD
  const runHr = usableAh / i.dischargeA
  const chargeA = i.chargeTimeMin && i.chargeTimeMin > 0
    ? usableAh / (i.chargeTimeMin / 60)
    : i.chargeA
  if (!(chargeA > 0)) return invalid('Missing charge data')
  const chargeHr = usableAh / chargeA

  const D = Math.min(24, i.dailyOpHr)
  const B = Math.max(0, Math.min(D, i.breakHrs))
  const Wp = D - B
  if (!(Wp > 0)) return invalid('No production hours')

  const segmentHr = Wp / (Math.max(0, i.breaksPerDay) + 1)
  const aEnergy = Math.min(1, (chargeA * 24) / (Wp * (i.dischargeA + chargeA)))
  const aCap = runHr >= segmentHr ? 1 : runHr / (runHr + chargeHr)
  const bufferTight = aCap < 1

  const A = Math.min(1, aEnergy, aCap)
  if (!(A > 0)) return invalid('Cannot determine availability')

  const fleetWithCharging = Math.ceil(i.groupRaw / A)
  const chargingDelta = Math.max(0, fleetWithCharging - i.baseFleet)
  const pct = `${Math.round(A * 100)}%`
  return {
    method: i.method, runHr, chargeHr, availability: A,
    aEnergy, aCap, segmentHr, bufferTight, chargingDelta, sustainable: true,
    reason: chargingDelta > 0
      ? `+${chargingDelta} for charging (availability ${pct})`
      : `Charging fits within the fleet (availability ${pct})`,
  }
}
```

Then remove the now-unused `ChargeRegime` import usage **inside** `chargingForGroup` only. Keep the top-level `ChargeRegime` import and `defaultChargeRegime` function — they are still exported and used elsewhere.

- [ ] **Step 4: Run the charging tests to verify they pass**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts -t chargingForGroup`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/fleet.ts src/calc/__tests__/fleet.test.ts
git commit -m "feat: energy-balance charging availability in chargingForGroup"
```

---

## Task 3: Thread breaks through `fleetSummary` and its callers

**Files:**
- Modify: `src/calc/fleet.ts:97-132` (`fleetSummary`)
- Test: `src/calc/__tests__/fleet.test.ts:56-95` (`fleetSummary` block)

- [ ] **Step 1: Update the `fleetSummary` tests for the new settings + expectations**

In `src/calc/__tests__/fleet.test.ts`, update the `settings` helper inside `describe('fleetSummary', …)` to include the new fields, and fix the expected numbers. Replace the `settings` helper and the first test with:

```typescript
  const settings = (over: Partial<FleetSettings> = {}): FleetSettings => ({
    regime: 'continuous', bufferPct: 0.10, dailyOpHr: 24, breakHrs: 0, breaksPerDay: 0,
    chargeMethods: {}, ...over,
  })

  it('runs base → +charging → ×buffer → ⌈⌉ and totals', () => {
    const groups = [grp('a', 4, 4)]
    // chargeA 10, dischargeA 10, 24h: A_energy = 10·24/(24·20)=0.5; runHr 8, segment 24 → A_cap 8/16=0.5; A=0.5.
    const byId = new Map([['a', veh('a', { chargeA: 10, chargeTimeMin: undefined }, 'opportunity')]])
    const s = fleetSummary(groups, byId, settings())
    const g = s.groups[0]
    expect(g.charging.chargingDelta).toBe(4)        // ⌈4/0.5⌉ − 4
    expect(g.fleetWithCharging).toBe(8)
    expect(g.fleetSold).toBe(9)                     // ⌈8 × 1.10⌉ = 9
    expect(s.totalChargingDelta).toBe(4)
    expect(s.totalFleetSold).toBe(9)
  })
```

Then update the second test (`'bufferPct 0 is a no-op; per-vehicle method override applies'`) — the method override no longer changes the math (charger-always-available collapses method for sizing), so assert the waterfall directly:

```typescript
  it('bufferPct 0 is a no-op; method override still recorded', () => {
    const groups = [grp('a', 4, 4)]
    // chargeA 10 → A=0.5 → delta 4 → fleetWithCharging 8; buffer 0 → fleetSold 8.
    const byId = new Map([['a', veh('a', { chargeA: 10, chargeTimeMin: undefined }, 'opportunity')]])
    const s = fleetSummary(groups, byId, settings({ bufferPct: 0, chargeMethods: { a: 'plugged' } }))
    expect(s.groups[0].charging.method).toBe('plugged')   // method still recorded for display
    expect(s.groups[0].fleetWithCharging).toBe(8)
    expect(s.groups[0].fleetSold).toBe(8)                 // buffer 0 → no change
  })
```

(The third test, `'skips groups with no base fleet'`, needs no change.)

- [ ] **Step 2: Run to verify the new `fleetSummary` tests fail**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts -t fleetSummary`
Expected: FAIL — `fleetSummary` still passes `regime` to `chargingForGroup` and omits `breakHrs`/`breaksPerDay`.

- [ ] **Step 3: Update the `chargingForGroup` call inside `fleetSummary`**

In `src/calc/fleet.ts`, inside `fleetSummary`, change the `chargingForGroup({ … })` argument object: remove `regime: settings.regime` and add the break fields. The call becomes:

```typescript
      ? chargingForGroup({
          groupRaw: g.groupRaw,
          baseFleet: g.baseFleet,
          ratedAh: veh.calc.ratedAh,
          dischargeA: veh.calc.dischargeA,
          chargeA: veh.calc.chargeA,
          chargeTimeMin: veh.calc.chargeTimeMin,
          method,
          dailyOpHr: settings.dailyOpHr,
          breakHrs: settings.breakHrs,
          breaksPerDay: settings.breaksPerDay,
        })
```

Also update the `else` fallback `ChargingResult` literal (vehicle-not-found case) to include the new fields:

```typescript
      : { method, runHr: null, chargeHr: null, availability: null, aEnergy: null, aCap: null, segmentHr: null, bufferTight: false, chargingDelta: 0, sustainable: false, reason: 'Vehicle not found' }
```

- [ ] **Step 4: Run the full fleet test file**

Run: `npx vitest run src/calc/__tests__/fleet.test.ts`
Expected: PASS (all `chargingForGroup`, `fleetSummary`, `defaultChargeMethod`, `defaultChargeRegime` tests).

- [ ] **Step 5: Commit**

```bash
git add src/calc/fleet.ts src/calc/__tests__/fleet.test.ts
git commit -m "feat: thread breaks (breakHrs, breaksPerDay) through fleetSummary"
```

---

## Task 4: Build `breakHrs`/`breaksPerDay` in the three settings builders

**Files:**
- Modify: `src/lib/fleetModel.ts:34-40`
- Modify: `src/lib/useFleetData.ts:60-65`
- Modify: `app/projects/[id]/step3/page.tsx:80-85`

- [ ] **Step 1: Update `fleetModel.ts` settings**

In `src/lib/fleetModel.ts`, replace the `settings` block (the `const settings: FleetSettings = { … }`) with one that computes the break fields from the project schedule:

```typescript
  const shiftsPerDay = project.shiftsPerDay ?? 1
  const breaksPerDay = (project.breaksPerShift ?? 0) * shiftsPerDay
  const breakHrs = breaksPerDay * ((project.breakDurationMin ?? 0) / 60)
  const settings: FleetSettings = {
    regime: project.chargeRegime ?? defaultChargeRegime(dailyOpHr),
    bufferPct: project.bufferPct ?? 0.10,
    dailyOpHr,
    breakHrs,
    breaksPerDay,
    chargeMethods: project.chargeMethods ?? {},
  }
```

- [ ] **Step 2: Update `useFleetData.ts` settings**

In `src/lib/useFleetData.ts`, find where it builds `FleetSettings` (around line 60-65, the `regime: project?.chargeRegime ?? defaultChargeRegime(dailyOpHr)` literal). Add the break fields. The object becomes:

```typescript
      regime: project?.chargeRegime ?? defaultChargeRegime(dailyOpHr),
      bufferPct: project?.bufferPct ?? 0.10,
      dailyOpHr,
      breakHrs: ((project?.breaksPerShift ?? 0) * (project?.shiftsPerDay ?? 1)) * ((project?.breakDurationMin ?? 0) / 60),
      breaksPerDay: (project?.breaksPerShift ?? 0) * (project?.shiftsPerDay ?? 1),
      chargeMethods: project?.chargeMethods ?? {},
```

(Match the exact existing property names/indentation in that file — read lines 55-70 first with `sed -n '55,70p' src/lib/useFleetData.ts`. Keep any other existing properties.)

- [ ] **Step 3: Update `step3/page.tsx` settings**

In `app/projects/[id]/step3/page.tsx`, find the `FleetSettings` literal (around line 80-85, the `regime: project?.chargeRegime ?? defaultChargeRegime(dailyOpHr)` line) and add the same two fields:

```typescript
      breakHrs: ((project?.breaksPerShift ?? 0) * (project?.shiftsPerDay ?? 1)) * ((project?.breakDurationMin ?? 0) / 60),
      breaksPerDay: (project?.breaksPerShift ?? 0) * (project?.shiftsPerDay ?? 1),
```

(Read lines 75-90 first to place them inside the existing object literal.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If an error points at another `FleetSettings` literal, add the same two fields there — search with `grep -rn "regime:" src/ app/`.)

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS (208 + the rewritten charging tests). If a snapshot test for fleet numbers fails because the adder changed, inspect the diff; if the new numbers match the model, update the snapshot with `npx vitest run -u` and note it in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fleetModel.ts src/lib/useFleetData.ts "app/projects/[id]/step3/page.tsx"
git commit -m "feat: compute breakHrs/breaksPerDay in the fleet settings builders"
```

---

## Task 5: Update the charging walkthrough mirror (`derivation.ts`)

**Files:**
- Modify: `src/lib/derivation.ts:89-127` (`chargingDerivation`)

- [ ] **Step 1: Read the current function and its `Derivation`/`DerivStep`/`sec` helpers**

Run: `sed -n '1,40p;89,127p' src/lib/derivation.ts`
Note the helper shapes (`sec(...)`, `{ label, expr, sub?, result, emphasis? }`).

- [ ] **Step 2: Replace `chargingDerivation` with the energy-balance walkthrough**

Replace the whole `chargingDerivation` function with one that reads the new `ChargingResult` fields (`aEnergy`, `aCap`, `segmentHr`, `availability`, `bufferTight`). It must not reference `settings.regime` for the math (keep the `tag` for display only):

```typescript
export function chargingDerivation(
  group: FleetGroup, vehicle: Vehicle, settings: Pick<FleetSettings, 'regime' | 'dailyOpHr'>,
): Derivation {
  const c = group.charging
  const cal = vehicle.calc
  const usableAh = cal.ratedAh * DEFAULT_DOD
  const tag = `${c.method === 'opportunity' ? 'Opportunity' : 'Plugged'} · ${settings.dailyOpHr >= 24 ? '24 h' : `${settings.dailyOpHr} h/day`}`

  const steps: DerivStep[] = [
    sec('Battery'),
    { label: 'Usable capacity', expr: 'rated Ah × usable depth', sub: `${n1(cal.ratedAh)} × ${DEFAULT_DOD}`, result: `${n1(usableAh)} Ah` },
    { label: 'Runtime per charge', expr: 'usable Ah ÷ draw', sub: `${n1(usableAh)} ÷ ${n1(cal.dischargeA)}`, result: c.runHr == null ? '—' : `${n1(c.runHr)} h` },
    { label: 'Recharge time', expr: cal.chargeTimeMin ? 'rated charge time' : 'usable Ah ÷ charge rate', sub: cal.chargeTimeMin ? undefined : `${n1(usableAh)} ÷ ${n1(cal.chargeA)}`, result: c.chargeHr == null ? '—' : `${n1(c.chargeHr)} h` },
    sec('Availability'),
    { label: 'Energy balance', expr: 'charge ÷ (charge + draw) over the day', result: c.aEnergy == null ? '—' : `${Math.round(c.aEnergy * 100)}%` },
    { label: 'Endurance', expr: c.segmentHr == null ? 'battery vs longest run' : `runtime vs ${n1(c.segmentHr)} h run`, result: c.aCap == null ? '—' : (c.aCap >= 1 ? '100%' : `${Math.round(c.aCap * 100)}%`) },
    { label: 'Availability', expr: 'min of energy & endurance', result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%`, emphasis: true },
  ]

  if (c.chargingDelta === 0) {
    steps.push({ label: 'Extra vehicles', expr: 'charging fits the fleet', result: '+0', emphasis: true })
    return { title: 'Charging — battery → availability', tag, steps, note: 'Breaks, idle time and the off-shift window keep the battery charged, so charging steals no operating time.' }
  }

  steps.push(
    { label: 'Fleet with charging', expr: 'demand ÷ availability, rounded up', sub: c.availability == null ? undefined : `⌈ ${n2(group.groupRaw)} ÷ ${n2(c.availability)} ⌉`, result: String(group.baseFleet + c.chargingDelta) },
    { label: 'Extra vehicles', expr: 'fleet with charging − base', sub: `${group.baseFleet + c.chargingDelta} − ${group.baseFleet}`, result: `+${c.chargingDelta}`, emphasis: true },
  )
  return { title: 'Charging — battery → availability → +N', tag, steps, note: 'Availability is the share of clock time a vehicle can work; the rest is charging. Dividing demand by it covers the charging downtime.' }
}
```

- [ ] **Step 3: Typecheck + run derivation tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/__tests__/derivation.test.ts`
Expected: PASS. If `derivation.test.ts` asserts the old availability strings/steps, update those assertions to the new step labels/results (read the test, fix the expected text to match the new steps). Commit the test update together with the source.

- [ ] **Step 4: Commit**

```bash
git add src/lib/derivation.ts src/lib/__tests__/derivation.test.ts
git commit -m "feat: energy-balance charging walkthrough in derivation"
```

---

## Task 6: Surface the new assumptions in the dashboard

**Files:**
- Modify: `src/components/rom/AssumptionsPanel.tsx`

- [ ] **Step 1: Read the panel to learn its row shape**

Run: `cat src/components/rom/AssumptionsPanel.tsx`
Note how a row (label + value + `why`, `isDefault`) is constructed and which group ("Operations"/"Energy") to add to.

- [ ] **Step 2: Add charging-model rows to the Operations/Energy group**

In the Energy group, add rows for the model's key levers. Use the panel's existing row format (adapt to the actual prop names you saw in Step 1):

```tsx
{ label: 'Usable battery depth', value: '80% DOD', why: 'Fixed depth-of-discharge floor used for runtime and charge math.', isDefault: true },
{ label: 'Charge windows', value: 'Breaks + idle + off-shift', why: 'Vehicles charge during breaks, idle time and off-shift; per-cycle station dwell is too short to count.', isDefault: true },
{ label: 'Weekly horizon', value: 'Sustains 7-day week', why: 'Each operating day balances at the sized availability, so charge holds across a full week; rest days cannot bank energy, so they do not reduce the fleet.', isDefault: true },
```

- [ ] **Step 3: Typecheck + restart dev clean (CSS not changed, but verify render)**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/rom/AssumptionsPanel.tsx
git commit -m "feat: charging-model assumptions rows in the ROM panel"
```

---

## Task 7: Full gate + push

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Architecture gate**

Run: `npm run check:arch`
Expected: `✓ Architecture checks passed`.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all green (count ≥ 208; the charging tests were rewritten, not removed).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 5: Manual smoke (dev)**

If CSS was touched (it was not in this plan), restart dev clean (`rm -rf .next && npm run dev`). Open a project's Step 3 (Fleet Engine) and Step 4 (ROM): the charging adder and the "How the fleet is calculated" walkthrough show the new availability (energy + endurance); the Assumptions panel shows the new rows. Set breaks in Step 1 and confirm the adder responds.

- [ ] **Step 6: Commit any smoke fixes, then push**

```bash
git add -A
git commit -m "chore: charging model gate fixes" || true
git push origin main
```

---

## Self-review checklist (done by the plan author)

- **Spec coverage:** types (Task 1), energy balance `A_energy`+`A_cap`+`segment` (Task 2), breaks into sizing (Tasks 3-4), off-shift via the `24` constant (Task 2), walkthrough (Task 5), assumptions (Task 6), weekly horizon as a documented property (Tasks 0/6), tests for every branch (Tasks 2-3), docs-first (Task 0), gate (Task 7). ✅
- **No placeholders:** every code step has full code. ✅
- **Type consistency:** `breakHrs`/`breaksPerDay` (FleetSettings + ChargingInput) and `aEnergy`/`aCap`/`segmentHr`/`bufferTight` (ChargingResult) named identically across Tasks 1-5. ✅
- **Preserved:** `ChargeRegime`/`regime`/`defaultChargeRegime` kept for display; `FleetSummary` shape unchanged; PPTX/Excel series untouched. ✅
