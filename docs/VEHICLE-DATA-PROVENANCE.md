# Vehicle Data Provenance

Per-vehicle source for each stored field. `[cutsheet]` = read from the manufacturer
cutsheet in `Vehicle Cutsheets/`; `[derived]` = computed from sheet values (battery
kWh = V×Ah, unit conversions); `[estimate]` = NOT on the sheet, placeholder to be
replaced. Corrected 2026-05-27 from the cutsheets.

## ESTIMATES for every vehicle (not on any cutsheet)
- `calc.priceRange` (minUsd / maxUsd)
- `calc.chargeKw`, `calc.energyKwhPerFt`, `calc.chargerType`
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
