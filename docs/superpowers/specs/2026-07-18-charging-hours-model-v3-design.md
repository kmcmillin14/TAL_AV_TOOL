# Charging model v3 — hours-based availability + overlap-aware buffer

**Date:** 2026-07-18
**Status:** Design (approved in brainstorming)
**Supersedes:** `docs/superpowers/specs/2026-06-25-charging-model-v2-design.md` and the
amp-based `chargingForGroup` in `src/calc/fleet.ts`.

## 1. Purpose

Re-parameterize the charging model on the two battery facts we actually trust —
**runtime per charge** and **charge time**, both cutsheet hours — and fix the two
composition problems found in the 2026-07-18 engineering evaluation:

1. The buffer multiplied the *energy* constraint, buying robots for energy demand that
   doesn't exist (buffer robots don't add missions; they spread fixed work thinner).
2. Charge taper / round-trip loss was paid multiple times: the v2 design assigned it to
   the buffer, `CHARGE_EFFICIENCY = 0.85` derated the charge rate for it anyway, and the
   cutsheet `chargeTimeMin` already includes it.

Key insight: the v2 Ah/A model was always an hours model in disguise — every amp and
amp-hour cancels algebraically, leaving only `runTimeHr` and `chargeHr`. v3 keeps v2's
two availability checks (including the weekend-reset fix that motivated v2) with the
shaky inputs and stacked derates removed. The historical hand rule (`raw ÷ 0.75` from a
flat 3:1 run:charge guess, then buffer) is the special case of this model where every
vehicle is assumed 3:1 and the schedule is assumed 24/7.

## 2. Decisions (from brainstorming, 2026-07-18)

- **Goal: right-size, simply.** The tool may quote fewer robots than the historical
  flat 3:1 + 20% practice; that is the point.
- **Trusted inputs:** per-vehicle `runTimeHr` + `chargeTimeMin` (cutsheet hours). No
  amps in the fleet calc.
- **Buffer:** keep the 80 % target-utilization default; composition becomes
  overlap-aware (idle headroom doubles as charge time for the energy constraint).
- **Schedule-aware:** off-shift hours, breaks, and days off are credited — a
  single-shift Mon–Fri fleet gets a charging adder of ~0.
- **Charge method stays display-only.** One uniform assumption for all vehicles:
  *a vehicle charges whenever it is not working* (charger always available). No
  opportunity-vs-manual math split, no per-group override.

Non-goals (unchanged from v2): simulation, charger-count modelling, battery-swap
spares, per-chemistry rules, battery degradation.

## 3. The model

Per vehicle type. Inputs: `runTimeHr` (hours of operation per full charge),
`chargeTimeMin` (minutes to full recharge), `H` = productive hrs/day
(`min(24, shifts×hours) − breaks`), `breakHrs`, `C` = consecutive operating days
before a rest day (∞ when all 7 days operate).

```
chargeHr  = chargeTimeMin / 60                          cutsheet, taken at face value
runHrEff  = runTimeHr + breakHrs × (runTimeHr / chargeHr)    breaks credited as top-up

A_cap     = runHrEff ≥ H ? 1 : runHrEff / (runHrEff + chargeHr)
            rotation: the run:charge ratio — fraction of the pool on the floor
            while the rest recharge

A_energy  = min(1, (24 + chargeHr/C) / (H × (1 + chargeHr/runTimeHr)))
            weekly balance: the 24-vs-H gap is the nightly off-shift credit; the
            chargeHr/C term is the day-off reset (one free full battery amortized
            over C operating days); C = ∞ drops it to 0
```

Both formulas are the v2 checks with `runTimeHr = usableAh/dischargeA` and
`chargeHr = usableAh/chargeRate` substituted through. `DEFAULT_DOD` and
`CHARGE_EFFICIENCY` are deleted from the calc: a measured runtime and charge time
already contain DOD policy, round-trip loss, and CV taper.

### 3.1 Composition with the buffer (overlap-aware)

```
A         = min(A_energy, A_cap)                        reported availability
fleetWithCharging = ⌈ groupRaw / A ⌉                    reported stage (Section 02)
chargingDelta     = max(0, fleetWithCharging − baseFleet)

fleetSold = max(baseFleet, ⌈ max( groupRaw / A_energy ,
                                  groupRaw × (1 + bufferPct) / A_cap ) ⌉)
```

Rationale: the energy constraint scales with *average work* (`groupRaw`), which buffer
vehicles do not increase — an idle robot charges, so utilization headroom and energy
recovery overlap. The rotation constraint is *instantaneous* — a robot on a charger is
not available at peak — so it still stacks with the buffer. The utilization floor
`groupRaw × (1+bufferPct)` is subsumed by the rotation term (A_cap ≤ 1).

The binding constraint (**Energy / Rotation / Utilization**) is computed and surfaced:
Rotation when the second max-argument wins with `A_cap < 1`, Utilization when it wins
with `A_cap = 1`, Energy when the first wins.

### 3.2 Guards (unchanged pattern)

Return `sustainable: false`, `chargingDelta: 0`, nulls — never NaN — when any of:
`runTimeHr ≤ 0` (or missing), `chargeHr ≤ 0`, `H ≤ 0`. `A_energy` capped at 1.
`baseFleet` remains the physical floor of `fleetSold`.

### 3.3 Behaviour table (CB18: 8.0 hr run, 1.5 hr charge; raw = 8; buffer 25 %)

| Scenario | A_cap | A_energy | fleetSold | Binding | Old flat 3:1+20 % |
|---|---|---|---|---|---|
| Single shift 8 h, Mon–Fri | 1 | 1 (capped) | 10 | Utilization | 13 |
| 24/7 (C = ∞) | 0.842 | 0.842 | 12 | Rotation | 13 |
| 24 h/day Mon–Fri, battery covers day | 1 | < 1 | ⌈raw/A_energy⌉ vs ⌈raw×1.25⌉, max | Energy or Utilization | 13 |

The v2 fix is preserved: a day off is a *reset*, not banking; the binding requirement
is surviving the consecutive operating days between resets.

## 4. Explaining the model to a colleague

Two facts about the robot (runs 8.0 hr on a charge, recharges in 1.5 hr — cutsheet),
two facts about the site (staffed hours/day, days on before a day off). Three
questions in order:

1. **Does the battery outlast the working day?** Single shift: 8 hr battery, 8 hr
   shift, 16 idle hours overnight vs a 1.5 hr recharge → charging costs nothing,
   adder = 0. (The flat 3:1 rule over-quoted exactly here.)
2. **If not, robots rotate through chargers — what fraction is on the floor?**
   24/7: available 8/(8+1.5) = 84 %. Same idea as 3:1, but this robot's real ratio.
3. **Does the week balance?** Nightly off-shift + the free full battery from a day
   off must refill what the operating days burn. Edge-case check (e.g. 24 h/day
   Mon–Fri on a big battery); the tool checks it so nobody has to.

Worked output, 24/7, workload 8.0, 80 % utilization:

```
Peak need    = 8.0 × 1.25 = 10 robots' worth on the floor
Availability = 84 % of robots on the floor (rest charging)
Fleet        = ⌈10 ÷ 0.842⌉ = 12        binding: Rotation
```

Same job single-shift Mon–Fri → 10 robots: "your robots charge at night — you don't
buy steel to cover time the building is dark."

## 5. Integration

- **`src/calc/types.ts`** — `ChargingInput` drops `ratedAh`/`dischargeA`/`chargeA`,
  gains `runTimeHr`; `chargeTimeMin` becomes required-for-sustainable. `ChargingResult`
  keeps `runHr`/`chargeHr`/`aEnergy`/`aCap`/`availability`/`reason`; `FleetGroup` gains
  the binding-constraint tag. Delete `DEFAULT_DOD` and `CHARGE_EFFICIENCY` after
  grepping for other consumers (battery display code may still show ratedAh/voltage —
  display keeps its own fields).
- **`src/calc/fleet.ts`** — rewrite `chargingForGroup` to §3; `fleetSummary` applies
  the §3.1 composition. `defaultChargeMethod` stays (badge display).
- **`src/content/vehicles/*.json`** — add `calc.runTimeHr`: CB18 8.0 · 8TB50A 8.0 ·
  8HBC40A 6.0 · E7 6.0 · ML2 10.0 · M10 11.8 (back-derived from the same runtime
  assumptions the amps encoded; mark each cutsheet-vs-estimate in
  `VEHICLE-DATA-PROVENANCE.md`). Delete `calc.dischargeA`/`calc.chargeA` (invented
  values, now unused). Keep `ratedAh`/`voltageV`/`chargeTimeMin`/`chargerType`.
- **UI (Step 3 Sections 02–03)** — Section 02 copy becomes the hours story
  ("runs 8.0 hr, charges in 1.5 → 84 % available; off-shift and day-off charging
  credited"). Section 03 shows the composition and names the binding constraint next
  to the total; the `base · +charging · ×headroom` build-up bar keeps its segments but
  the TOTAL is the max-composition, and the label states which constraint bound.
- **Consumers** — `src/lib/fleetModel.ts` passes `runTimeHr`; `derivation.ts`
  walkthrough, Assumptions/Methodology panels, PDF/PPTX formula views, and the Excel
  export formula strings updated to the three-line story.
- **Docs** — SPECIFICATION.md Fleet Engine §02–03 rewritten; CHANGELOG entry; this doc
  supersedes 2026-06-25.

## 6. Testing

Rewrite `src/calc/__tests__/fleet.test.ts` + `utilization.test.ts` against §3.3
re-expressed in hours: single-shift → A = 1 / adder 0 · 24/7 → rotation ratio ·
24 h Mon–Fri big battery → energy binds · 16 h small battery → capacity binds ·
break credit · weekend-reset term · each binding-constraint branch of the §3.1
composition · all §3.2 guard cases · `baseFleet` floor. Existing arch/enum checks
unaffected.

## 7. Migration

None. localStorage stores user input only (no vehicle data, no results); existing
projects recompute under v3 on load. Vehicle JSON edits ship with the code.
