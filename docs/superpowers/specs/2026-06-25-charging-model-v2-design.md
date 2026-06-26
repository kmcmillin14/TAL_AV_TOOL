# Charging / battery model v2 — availability ratio with weekend reset

**Date:** 2026-06-25
**Status:** Design (approved in brainstorming; pending user spec review)
**Supersedes:** `docs/superpowers/specs/2026-06-23-charging-model-design.md` (the weekly
energy-balance design — replaced after a hole-poking pass found it over-credited weekend
"banking") and the current `chargingForGroup` in `src/calc/fleet.ts`.

## 1. Purpose

The Fleet Engine adds vehicles per type to cover battery charging downtime. We need a model
that answers one question accurately: **what is the fewest vehicles of a type such that the
pool meets throughput AND every vehicle stays charged across the operating week?** Discharge
is driven by how hard vehicles work (throughput); charge comes from off-shift time plus the
recharge-to-100% on days off. The result feeds the existing waterfall slot
(`base → +charging → ×buffer`), so the post-buffer absorbs second-order variability.

## 2. Scope and fixed assumptions (confirmed with user)

- **Per vehicle type only** — like vehicles pool; a type shares its own throughput demand and
  its own charging downtime. A forklift's slack never covers a tugger's. All math is per type.
- **Charger always available** — a vehicle charges whenever it is not working (no charger-count
  or queueing constraint).
- **DOD fixed at 80%**; **no battery degradation** (nameplate Ah).
- **A day off recharges to 100%** — a rest day is a full *reset*, not energy "banking." The
  binding requirement is surviving the consecutive operating days *between* resets.
- **Buffer applied afterward** (`×(1+bufferPct)`) absorbs demand peaks, charge taper, round-trip
  loss, and imperfect rotation — so the charge model itself stays a transparent ROM estimate.
- **No simulation** — closed-form, deterministic, unit-tested.

Non-goals: Monte-Carlo / discrete-event simulation, charger-count modelling, battery-swap spare
counts, sub-shift demand-peak modelling, per-chemistry rules.

## 3. Why not the v1 (2026-06-23) model

v1 used a single weekly energy balance `A = chargeA·168 / (Wp·(d+c))`. A hole-poking pass
showed it **over-credits the weekend**: a net-energy week can "balance" only by treating a
day-off's charge as flowing backward into mid-week discharge — but a battery cannot bank a
weekend's energy (it caps at 100%). For multi-day high-duty operations with only partial nightly
recovery, v1 **undersizes** (battery dies mid-week). v2 fixes this by treating the day off as a
*reset* and bounding the mid-week **drawdown by battery capacity**.

## 4. The model

Per vehicle type. Inputs are all data we already have (vehicle `calc` + Step 1 schedule).

### 4.1 Derived quantities

```
usableAh   = ratedAh × 0.80
chargeRate = chargeTimeMin>0 ? usableAh/(chargeTimeMin/60) : chargeA        Ah/hr
dischargeRate = dischargeA                                                  Ah/hr
breakAh    = chargeRate × (breaksPerShift × breakDurationMin/60 × shiftsPerDay)   Ah/day from breaks
runHr_eff  = usableAh/dischargeRate + breakAh/dischargeRate     continuous run + break credit (real Ah, not a reset)
chargeHr   = usableAh / chargeRate                              time to refill
H_prod     = min(24, shiftsPerDay × hoursPerShift) − (breaksPerShift × breakDurationMin/60 × shiftsPerDay)
             productive hrs/day (≤ 24)
C          = consecutive operating days before a rest day, from operatingDaysPattern:
             Mon–Fri → 5 · Mon–Sat → 6 · Mon–Sun → ∞ (no rest) · Custom → longest consecutive run in the week
```

### 4.2 Two availability checks, take the worse

**Energy availability** — credits nightly off-shift (the `24·chargeRate` term) and the
weekend reset (the `usableAh/C` term; a bigger battery and/or more frequent days off allow a
larger survivable drawdown). `C = ∞` (no rest day) drops the weekend term to 0:
```
A_energy = min(1,  (usableAh/C + 24·chargeRate) / ( H_prod · (dischargeRate + chargeRate) ))
```

**Within-window capacity** — the battery must cover a production window before recharging; if
it can't, the vehicle must charge mid-window and is duty-cycle limited:
```
A_cap = runHr_eff ≥ H_prod ? 1 : runHr_eff / (runHr_eff + chargeHr)
```

**Combine and solve the fleet:**
```
A     = min(A_energy, A_cap)            ∈ (0, 1]
fleetWithCharging = ⌈ groupRaw / A ⌉
chargingDelta     = max(0, fleetWithCharging − baseFleet)
```
The buffer is applied after, unchanged: `fleetSold = ⌈ fleetWithCharging × (1 + bufferPct) ⌉`.

### 4.3 Guards (no garbage on partial data)

Return a non-sustainable result (`sustainable:false`, `chargingDelta:0`, nulls) — matching the
current behaviour for partial projects — when any of: `ratedAh ≤ 0`, `dischargeA ≤ 0`,
`chargeRate ≤ 0`, or `H_prod ≤ 0` (e.g. breaks ≥ shift hours). Never divide by zero; never
return a negative or non-finite fleet.

### 4.4 Behaviour table (chargeRate = dischargeRate, for intuition)

| Operation | A_energy | A_cap | A | Note |
|---|---|---|---|---|
| 1-shift Mon–Fri, ample battery | →1 | 1 | **1** | +0; off-shift recharges nightly |
| 24/7 (C=∞), runHr < 24 | 0.5 | 0.5 | **0.5** | no off-shift, no weekend → duty cycle |
| 16 h Mon–Sat, small battery | 0.78 | **0.5** | **0.5** | capacity binds → survives (v1 undersized this) |
| 24 h Mon–Fri, 24 h battery | **0.6** | 1 | **0.6** | weekend reset legitimately lowers fleet |
| 2-shift Mon–Fri, big battery | **0.86** | 1 | **0.86** | small daily deficit forgiven by the weekend reset |

## 5. Integration

- **`src/calc/types.ts`** — `FleetSettings` gains the schedule facts the model needs:
  `breakHrs`, `breaksPerDay`, `consecutiveOpDays` (C; `Infinity` for no rest), keeping
  `dailyOpHr`. `ChargingResult` gains `aEnergy`, `aCap`, `availability` (= final A), `runHr`,
  `chargeHr` (already present), and a human `reason`. Drop the v1-only `segmentHr`/`bufferTight`.
- **`src/calc/fleet.ts`** — rewrite `chargingForGroup` to §4. `fleetSummary` waterfall and the
  `FleetSummary` shape are unchanged. The old overnight/regime branch and `defaultChargeRegime`
  are removed if no longer referenced (verify; delete orphans per folder-hygiene).
- **`src/lib/fleetModel.ts`** — compute `breakHrs`, `breaksPerDay`, and `consecutiveOpDays`
  from the project schedule + `operatingDaysPattern`/`operatingDaysCustom`, and pass them in.
- **Consumers** — `derivation.ts` (Step 3 walkthrough) and `AssumptionsPanel`/`MethodologyPanel`
  updated to explain the two terms (off-shift + weekend reset) and the final A.

A new pure helper `consecutiveOperatingDays(pattern, customDays)` (in `romAnalytics.ts` or
`fleet.ts`) returns C — the longest consecutive run of operating days in a 7-day week (wrapping),
or `Infinity` when all 7 days operate.

## 6. Testing (deterministic — no simulation)

Pure unit tests in `src/calc/__tests__/fleet.test.ts`, each a hand-computed A and fleet:
- 1-shift Mon–Fri, ample battery → A = 1, +0.
- 24/7, runHr < 24 → A = duty ratio; correct adder.
- **Hole-1 regression**: 16 h Mon–Sat, small battery → `A_cap` binds (0.5), fleet survives (the
  case v1 undersized).
- Weekend reset lowers fleet: same op run 7 days (C=∞) needs more vehicles than Mon–Fri (C=5).
- Capacity cliff at `runHr_eff = H_prod`.
- Guards: `dischargeA=0` / `chargeA=0` / `ratedAh=0` / breaks ≥ shift → not-sustainable, +0.
- `consecutiveOperatingDays`: Mon–Fri→5, Mon–Sat→6, Mon–Sun→∞, a Custom pattern→its longest run.
Existing `rom`/`romCharts`/`trafficLight` tests stay green; the `trafficLight` snapshot updates
only where charging numbers legitimately change.

## 7. Constraints honored

Pure `calc/` (no React/IO) · imperial · Ah-based (voltage-independent) · DOD 80% · no
degradation · charger assumed available · per-vehicle-type pooling · buffer applied after · no
new *required* user fields (all derived from existing Step 1 inputs) · no backend · docs-first.

## 8. Accepted limitations (documented, not modelled)

- Demand **peaks** above average `groupRaw`, charge **taper** near full, ~10–15% round-trip
  **loss**, and imperfect **rotation** are not modelled — the post-buffer is the cushion.
- `A_cap` is a step at `runHr_eff = H_prod` (a hair more battery can drop a vehicle). Accepted
  for a ROM quoting tool.
- Within-day depletion is approximated by the daily energy delta + the capacity check, not a
  minute-by-minute SoC trace; bursty within-window duty can dip lower than the average.
- Custom operating-day patterns use the longest consecutive run as C (conservative for
  scattered days off).
