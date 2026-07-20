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
- `calc.runTimeHr` (v3, 2026-07-18) — hours of operation per full charge. Replaces the derived
  `dischargeA`/`chargeA` amps (deleted). Current values are [estimate] back-derivations of the
  same assumed runtimes the amps encoded (`ratedAh × 0.80 ÷ dischargeA`): CB18 8.0 · 8TB50A 8.0 ·
  8HBC40A 6.0 · E7 6.0 · ML2 10.0 · M10 11.8. Replace each with the [cutsheet] runtime as
  verified — a JSON edit, no model change. `chargeTimeMin` remains [cutsheet] where noted below.

## ESTIMATES for every vehicle (not on any cutsheet)
- `calc.priceRange` (minUsd / maxUsd)
- `calc.runTimeHr`, `calc.chargerType` (see Ah/runtime migration note above; `dischargeA`/`chargeA` deleted)
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

## 2026-07-19 — ML2 + E7 pin-tow additions (owner-confirmed; data [estimate])

- **ML2** — added `towsCarts: true` and `cartPayloads: ["Tote", "Cart"]`.
  Owner confirmed ML2 can pin-tow carts carrying totes or carts. Cart payload types and
  tow handling times are `[estimate]` pending cutsheet confirmation. Transfer method
  "Pin" already present (unchanged).
- **E7 / Ebase7** — added `transferMethods[].Pin` (loadTimeSec 5 / unloadTimeSec 5,
  NO `lifts` flag — matches M10 Pin placeholder times per project estimate baseline),
  plus `towsCarts: true` and `cartPayloads: ["Tote", "Cart"]`. Owner confirmed
  E7 pin-tow capability; all three additions are `[estimate]` pending E7 cutsheet
  (capability confirmed, exact handling times and cart payload set TBD).
- **ML2 + E7 payloadTypes** — added `"Cart"` to both (ML2: Tote → Tote, Cart; E7: Standard
  Pallet, Rack → + Cart). Owner direction 2026-07-19: the pin is an accessory to these
  vehicles, so a towed cart is itself a payload (as on the M10). `[estimate]`.
- **M10** — unchanged; `towsCarts: true`, `cartPayloads: ["Standard Pallet", "Tote", "Cart"]`,
  and Pin method (loadTimeSec 5 / unloadTimeSec 5) are `[cutsheet]` (30 mm retractable
  pin, 2,200 lb towing capacity — per M10 Cutsheet 3).

## 2026-07-20 — Certifications corrected (owner-confirmed)

- ALL six vehicles: `ANSI B56.5` + `VDA 5050` `[owner]`. Only the Oppent E7 additionally
  holds `ISO 3691-4` `[owner]`. No vehicle holds RIA R15.08 / Cleanroom / Food Grade /
  ATEX / IECEx (those remain SELECTABLE customer requirements — requiring one correctly
  YELLOW-flags every vehicle for review).

## Accessories (transfer methods) — per the engineer, handling times estimated
- **CB18:** Lift (lifts)
- **ML2:** Conveyor · Lift (lifts) · Pin · Custom
- **M10:** Pin
- **E7:** Lift (lifts) · Conveyor · Pin  ← Pin added 2026-07-19 [estimate]
- **8TB50A:** Custom · Powered Conveyor Cart
- **8HBC40A:** Lift (lifts; 6-in stroke → `maxLiftHeightFt` 0.5 ft)

Everything else (names, manufacturer, partnership, category, capacities, speeds,
dimensions, lift heights, temps/ramp where listed) is `[cutsheet]` / `[derived]`.
Speed convention: automated full-load max used for both loaded and empty.
