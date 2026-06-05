# Vehicle Data Provenance

Per-vehicle source for each stored field. `[cutsheet]` = read from the manufacturer
cutsheet in `Vehicle Cutsheets/`; `[derived]` = computed from sheet values (battery
kWh = V×Ah, unit conversions); `[estimate]` = NOT on the sheet, placeholder to be
replaced. Corrected 2026-05-27 from the cutsheets.

## 2026-06-04 — Battery model migrated kWh → Ah/A (Fleet Engine)
`calc` now stores `ratedAh`, `voltageV`, `dischargeA`, `chargeA` (dropped `batteryKwh`,
`energyKwhPerFt`, `chargeKw`). Voltage/Ah seeded from the notes below; the rest are **`[estimate]`**:
- `ratedAh` / `voltageV`: CB18 533 Ah @ 48 V · ML2 63 Ah @ 48 V · M10 28 Ah @ 48 V · E7 100 Ah @ 24 V ·
  8TB50A 750 Ah @ 24 V · 8HBC40A 750 Ah @ 24 V. (kWh ≈ V×Ah/1000; these correct the earlier suspect
  M10/ML2 kWh figures.)
- `chargeA = ratedAh × 0.80 / (chargeTimeMin/60)` (consistent with the listed recharge time).
- `dischargeA = ratedAh × 0.80 / targetRunHr`, with an assumed runtime per charge of ~6–12 operating
  hours per class (CB18 8, ML2 10, M10 12, E7 6, 8TB50A 8, 8HBC40A 6). **To be cutsheet-verified.**

## ESTIMATES for every vehicle (not on any cutsheet)
- `calc.priceRange` (minUsd / maxUsd)
- `calc.dischargeA`, `calc.chargeA`, `calc.chargerType` (see Ah migration note above)
- `transferMethods[].loadTimeSec` / `unloadTimeSec` — accessory **handling times**
  (Conveyor 3/3, Lift 8/8 [CB18 5/5, 8HBC40A 6/6], Pin 5/5, Custom 8–10, Powered
  Conveyor Cart 5/5). All placeholders.

## Per-vehicle estimate flags (beyond the above)
- **CB18** (Bastian, TAL Integrated) — `liftSpeedFps`, `batteryKwh` (48 V, Ah not on sheet),
  `tempMin/Max`, `outdoorCapable`, `maxRampGrade`, `maxLoad*In`.
- **ML2** (Bastian, TAL Integrated) — `liftSpeedFps` (Lift appliance; not on sheet),
  `batteryKwh` (63 Ah, voltage not on sheet), `heightFt` (base w/o appliance), `maxLoad*In`,
  `maxRampGrade`.
- **M10** (Bastian, TAL Integrated) — `batteryKwh` (28 Ah AGM — current 14 kWh is likely too
  high; revisit), `maxRampGrade`.
- **E7 / Ebase7** (Oppent, TAL 3rd Party) — `liftSpeedFps`, `maxLiftHeightFt` null (stroke
  "customisable"). `batteryKwh` = [derived] 24 V × 100 Ah = 2.4; `chargeTimeMin` = [cutsheet]
  2.5 h = 150.
- **8TB50A** (Toyota, TAL 3rd Party) — `tempMin/Max`. `batteryKwh` = [derived] 24 V × 750 Ah = 18.
  `maxWeightLbs` 10000 = [cutsheet] towing capacity.
- **8HBC40A** (Toyota, TAL 3rd Party) — `liftSpeedFps`, `tempMin/Max`, `maxLoad*In`. `batteryKwh` =
  [derived] 18. `maxWeightLbs` 8000 = [cutsheet] rated (automated max ~7054 lb).

## Accessories (transfer methods) — per the engineer, handling times estimated
- **CB18:** Lift (lifts)
- **ML2:** Conveyor · Lift (lifts) · Pin · Custom
- **M10:** Pin
- **E7:** Lift (lifts) · Pin
- **8TB50A:** Custom · Powered Conveyor Cart
- **8HBC40A:** Lift (lifts; 6-in stroke → `maxLiftHeightFt` 0.5 ft)

Everything else (names, manufacturer, partnership, category, capacities, speeds,
dimensions, lift heights, temps/ramp where listed) is `[cutsheet]` / `[derived]`.
Speed convention: automated full-load max used for both loaded and empty.
