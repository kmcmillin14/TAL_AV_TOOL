# Charging / battery model — shift-coverage-aware energy balance

**Date:** 2026-06-23
**Status:** Design (approved in brainstorming; pending user spec review)
**Supersedes:** the charging logic in `src/calc/fleet.ts` (`chargingForGroup`)

## 1. Purpose

The Fleet Engine adds vehicles to cover battery charging downtime. The current
model is right in two corners and wrong everywhere between them, because it never
sees **breaks**, the **off-shift window**, or **idle time**, and because its
overnight test is an all-or-nothing cliff. This redesign replaces the charging
**availability** with one closed-form, **shift-coverage-aware energy balance** so
the vehicles-added number stays accurate across 1-shift, 2-shift, and 24 h
operations — while keeping the same waterfall shape and the pure-`calc/` contract.

## 2. Scope and fixed assumptions (confirmed with user)

In scope: a better charging **availability** `A` per vehicle group, feeding the
existing `fleetWithCharging = ⌈groupRaw / A⌉` step.

Fixed assumptions (out of scope to vary):

- **DOD fixed at 80%** (`DEFAULT_DOD`), no per-chemistry rules.
- **No battery degradation** over service life (nameplate Ah).
- **Charger always available** — a reachable charger whenever the vehicle is not
  productive (auto-dock / opportunity). This collapses the plug-in vs opportunity
  distinction for sizing; the `chargeMethods`/`chargerType` fields are retained for
  display and future use but no longer change the adder.
- **100% round-trip efficiency** (no η loss factor).
- **Off-shift charging assumed** — when the operation is < 24 h/day, the vehicle
  recharges during the off-shift window.
- **Must last three horizons** — the fleet must sustain charge across a **single
  shift**, a **full 24 h day**, and a **full 7-day week**. Rest days count as a
  full-recharge recovery window (per `operatingDaysPattern`), but — because a
  battery cannot bank more than its own usable capacity — recovery only relaxes
  operations that already balance within their longest continuous run; it cannot
  reduce vehicles for a 24 h operation that does not balance daily.

Non-goals: discrete-event simulation, charger-count/queueing, battery-swap spare
counts, demand-peak modeling (the buffer % already hedges variability).

## 3. Problem statement — what today's model lacks

Today (`chargingForGroup`): `runHr = usableAh/dischargeA`; regime from
`dailyOpHr = shifts × hours` (**breaks not subtracted**); overnight →
`runHr ≥ dailyOpHr ? +0 : full duty-cycle penalty`; else
`A = runHr/(runHr+chargeHr)` (plugged) or `chargeA/(chargeA+dischargeA)`
(opportunity).

Ranked gaps (sizing impact):

1. **Breaks absent from sizing.** `dailyOpHr = shifts × hours`; breaks only feed
   the SoC chart. Demand is spread over too many hours and breaks give zero charge
   credit.
2. **Overnight test is an all-or-nothing cliff.** A 7.9 h battery on an 8 h shift
   is treated like one needing constant charging, when a single 10-min break
   top-up bridges the gap.
3. **No credit for opportunity charging to *extend* runtime within a shift** (the
   break/idle top-ups that stretch a 5 h battery across an 8 h shift).
4. **Off-shift window is implicit** — `(24 − dailyOpHr)` is never used, so
   multi-shift partial coverage falls back to a steady duty-cycle ratio.
5. **Idle / utilization slack ignored** — `groupRaw/baseFleet` is never read, so
   the model can add vehicles when there is ample idle to charge in.
6. **Opportunity formula is physically weak** — `chargeA/(chargeA+dischargeA)`
   uses neither runHr, shift length, idle, nor breaks.
7. **Full-cycle charging assumption** — `A` assumes full discharge→full charge
   cycles; Li-ion partial opportunity charging yields higher real availability.

Net: safe at (1 shift, runHr ≥ shift) → +0 and at true 24 h continuous; mis-sizes
everywhere between — over-sizing when runHr is just short of the shift or idle/break
time exists, mis-sizing multi-shift because off-shift and breaks aren't represented.

## 4. The model

Per vehicle group (the model is shift/day-level, so it needs only the group's
`groupRaw`/`baseFleet` and the vehicle's battery spec — no per-flow weighting).
Same waterfall: `base → +charging → ×buffer`.

### 4.1 Derived quantities (no new user inputs)

```
usableAh = ratedAh × 0.80
chargeA  = chargeTimeMin > 0 ? usableAh / (chargeTimeMin/60) : chargeA(spec)
D    = min(24, shiftsPerDay × hoursPerShift)              clock hrs/day
B    = min(D, breaksPerShift × breakDurationMin/60 × shiftsPerDay)   break hrs/day
Wp   = D − B                                              production window (demand here)
Woff = 24 − D                                             off-shift charge window
runHr    = usableAh / dischargeA                          continuous run capacity
chargeHr = usableAh / chargeA                             full recharge time
breaksPerDay = breaksPerShift × shiftsPerDay              number of break windows
segment   = Wp / (breaksPerDay + 1)     longest continuous productive run between top-ups
```

**Recovery horizon (weekly) — a property, not a separate input.** Because the fleet
is sized to availability `A` (below), each operating day's energy balances at `A`,
so SoC is periodic day-to-day and the model **sustains a full 7-day week by
construction**, for any operating-days pattern. A battery cannot bank beyond
`usableAh`, so a weekly rest day cannot reduce the fleet — it only confirms
survival. Concretely:

```
D < 24  → the off-shift window (encoded as the 24 in A_energy) fully recharges each
          night; the weekly pattern does not change charge sizing.
D = 24  → no off-shift; the day must be self-sustaining on in-day windows (breaks +
          idle). A rest day cannot reduce the fleet; if the day is not self-
          sustaining (A_energy < 1) the adder stands every operating day.
```

`operatingDaysPattern` therefore feeds **only annual operating days (cost)** and a
weekly-horizon note in the Assumptions panel — it is not a charging-calc input.

The cycle breakdown's `moveFrac`/`dwellFrac` are **not** used for charging —
per-cycle station dwell (~10 s) is too short to charge meaningfully. Charging is
modeled at the shift/day level.

### 4.2 Energy availability (breaks + idle + off-shift all charge)

Over 24 h, a vehicle discharges only while productive (`A·Wp`) and charges every
other hour (in-production idle `(1−A)·Wp`, breaks `B`, off-shift `Woff`). Charge ≥
discharge:

```
chargeA · [ (1−A)·Wp + B + Woff ]  ≥  dischargeA · [ A·Wp ]
```

Since `(1−A)·Wp + B + Woff = 24 − A·Wp`, solving for the max sustainable `A`:

```
A_energy = chargeA · 24 / ( Wp · (dischargeA + chargeA) )      , capped at 1
```

Reduces correctly: a single shift (`Wp = 8`) gives `A_energy ≈ 3·chargeA/(…) → 1`
(+0, recharges off-shift); 24 h continuous with no breaks (`Wp = 24`) gives
`chargeA/(dischargeA+chargeA)` — i.e. the old opportunity ratio is just the 24 h
special case, now generalized to all shift coverage.

### 4.3 Endurance / capacity check (can force an adder)

Energy balancing over the day does not guarantee the battery survives the longest
continuous productive stretch without crossing the 80 % floor. The binding stretch
is the production sub-window between break top-ups, `segment`:

```
runHr ≥ segment  → A_cap = 1            (battery endures; top-ups at breaks bridge)
runHr <  segment → A_cap = runHr / (runHr + chargeHr)   (forced mid-stretch charge)
```

This is where the user's "force an adder" decision lives: when the battery
genuinely cannot endure a stretch, `A_cap` drops and vehicles are added.

### 4.4 Combine

```
A = min(1, A_energy, A_cap)
fleetWithCharging = ⌈ groupRaw / A ⌉
chargingDelta     = max(0, fleetWithCharging − baseFleet)
```

`A = 1 → +0`. Worked checks:

- **1 shift, 1 break, runHr 5 h, Wp 8 h:** `segment = 4 h`, `runHr 5 ≥ 4` →
  `A_cap = 1`; `A_energy = 1` → **+0** (break top-up bridges; fixes the cliff).
- **1 shift, no break, runHr 5 h, Wp 8 h:** `segment = 8 h`, `runHr 5 < 8` →
  `A_cap = 5/(5+chargeHr)` → adds vehicles (legitimate: nothing to top up against).
- **24 h continuous, runHr < 24:** `A_energy = chargeA/(dischargeA+chargeA)`,
  `A_cap = runHr/(runHr+chargeHr)`, `A = min` — duty-cycle sized, as today.

## 5. Integration

- **`src/calc/types.ts`** — `FleetSettings` gains `breakHrs` (B) and `breaksPerDay`
  (count) and keeps `dailyOpHr` as clock `D`; `ChargingResult` gains `aEnergy`,
  `aCap`, `segmentHr`, `bufferTight` (true when `A_cap < 1`, i.e. endurance binds);
  `availability` (= final A), `runHr`, `chargeHr` already present.
- **`src/calc/fleet.ts`** — `chargingForGroup` rewritten to §4. The overnight
  branch and the two old `A` formulas are removed; `defaultChargeRegime`/regime are
  no longer needed for sizing (kept only if other call sites use them — verify and
  delete if orphaned per folder-hygiene rule).
- **`src/lib/fleetModel.ts`** — compute `breakHrs` (B) and `breaksPerDay` (count)
  from the schedule and pass them in; `dailyOpHr` stays the clock day. This is the
  fix for gap 1 (breaks reach sizing) and gap 4 (off-shift reaches sizing via the
  24 in `A_energy`). `operatingDaysPattern` keeps feeding only annual operating days
  (cost) — it is not a charging-calc input (weekly survival is a property, §4).
- Waterfall and `FleetSummary` shape unchanged; `romSummary` untouched.

## 6. Dashboard surfacing (web only; PPTX/Excel series untouched)

- **Assumptions panel** — add rows: production window `Wp`, off-shift `Woff`,
  breaks `B`, `A_energy`, `A_cap`, final `A`, and the 80 % DOD, each with a "why".
- **Battery card** — the SoC sawtooth reflects shift-level charging (deep overnight
  recharge, shallow break/idle top-ups); show a "battery buffer tight" note when
  `bufferTight`.
- **Walkthrough ("How the fleet is calculated")** — add an energy-balance step that
  substitutes the real numbers → `A` → adder, so the deck is transparent.
- Pure series builders unchanged → **PPTX/Excel exports unaffected**.

## 7. Testing

Pure unit tests in `src/calc/__tests__/fleet.test.ts`:

- `A_energy = 1` (ample off-shift) → `chargingDelta = 0`.
- 24 h continuous, runHr < shift → adder matches `⌈groupRaw/A⌉ − baseFleet`.
- Break top-up bridges the cliff: runHr just under a no-break shift adds vehicles;
  the same runHr with a break that makes `segment ≤ runHr` adds none.
- Endurance binds (`runHr < segment`) → `bufferTight` true and adder forced.
- Breaks reduce `Wp` → `A_energy` falls → adder can rise (gap 1 regression).
- **Weekly horizon:** a `< 24 h` op gives the same adder for Mon–Fri and Mon–Sun
  (nightly reset governs); a `24 h` op that isn't daily-self-sustaining keeps its
  adder for Mon–Sun *and* Mon–Fri (rest day cannot bank), confirming "lasts a full
  7-day week."
- Existing 208 tests stay green; PPTX/Excel content/parity tests unaffected.

## 8. Constraints honored

Pure `calc/` (no React/IO) · imperial · Ah-based (voltage-independent) · DOD 80% ·
no degradation · charger assumed available · 100% efficiency · no new required
fields (all derived from Step 1) · no backend · Toyota Type · docs-first
(SPECIFICATION + CHANGELOG) · pre-push gate (tsc · check:arch · vitest).

## 9. Accepted limitations (documented, not modeled)

- Assumes a reachable charger during any non-productive time (in-aisle/auto-dock).
  Sites that only charge in a separate bay are more constrained than this model.
- Daily energy balance with a segment-level endurance check, not a minute-by-minute
  SoC simulation; bursty within-segment demand can still dip lower than the average.
- One average `dischargeA` (lift draws more than travel) and constant `chargeA`
  (real Li-ion tapers near full) — both slightly optimistic, accepted for ROM.
- Lead-acid opportunity-charge damage / equalize cycles not modeled (DOD fixed,
  chemistry-agnostic).
- Weekly rest days are recovery windows but cannot bank energy beyond `usableAh`,
  so they do not reduce the fleet for a 24 h operation that fails the daily balance
  — the model treats the longest continuous operating block as binding.
