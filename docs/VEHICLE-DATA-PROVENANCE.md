# Vehicle Data Provenance

## 2026-10-09 — Battery & charging rebuilt from the owner's sheet

The owner supplied a battery/charging spec sheet. `calc` now carries the full
battery picture per platform. **`null` means the cell was BLANK on that sheet —
a placeholder to fill, never a measured zero.** Open items are tracked on the
placeholder checklist.

**Charging is opportunity-only on every platform** (owner, 2026-10-09).
`chargerType` is now `opportunity` for all six — this corrects `8TB50A` and
`8HBC40A`, which were wrongly marked `shift_swap`. **TPPL** (thin plate pure
lead) is the lead-acid chemistry built for opportunity charging, so the data and
the charging method now agree. No swap path is modelled or needed.

### Values taken from the sheet `[owner-sheet]`

| field | cb18 | ml2 | m10 | 8tb50a | 8hbc40a | ebase7 |
|---|---|---|---|---|---|---|
| `batteryChemistry` | Li-ion | Li-ion | AGM | TPPL ⚠ | TPPL ⚠ | Li-ion |
| `voltageV` | 48 | **24** ↺ | **24** ↺ | 24 ⚠ | 24 ⚠ | **48** ↺ |
| `ratedAh` | **564** ↺ | 63 | 28 | **558** ⚠ | **558** ⚠ | **120** ↺ |
| `usableCapacityPct` | 70 | 80 | 80 | 70 ⚠ | 70 ⚠ | 70 |
| `runTimeHr` | **16.67** ↺ | **7** ↺ | **3.5** ↺ | **14** ↺ | **14** ↺ | **7** ↺ |
| `avgCurrentDrawA` | 27 | 8 | — | — | — | 17 |
| `avgPowerDrawKw` | 1.3 | 0.19 | — | — | — | 0.82 |
| `peakCurrentDrawA` | 525 | — | — | — | — | — |
| `idlePowerDrawW` | 150 | — | — | — | — | — |
| `minSocPct` / `maxSocPct` | 20 / 100 | 20 / 100 | — | — | — | 20 / 100 |
| `chargeTime20to80Min` | 336 | — | — | — | — | 48 |
| `chargeTime0to100Hr` | 9.4 | — | — | — | — | — ✕ |
| `chargerVoltage` | 15-60 V DC | 24 V | — | — | — | — ✕ |
| `chargerOutputA` | 60 | 40 | — | — | — | 2.5 ⚠ |
| `chargerPowerKw` | 2.9 | 0.96 | — | — | — | 4.1 |

↺ changed from the prior value · ⚠ unverified (yellow on the sheet, or internally
inconsistent) · — blank on the sheet, **`null` placeholder** · ✕ sheet value
rejected as garbled, left `null`

### `runTimeHr` — every platform moved

`runTimeHr` is the single most sensitive input in the charging model. All six
were `[estimate]` back-derivations; all six are now `[owner-sheet]` "Typical
Runtime":

    cb18 8.0 → 16.67 · ml2 10.0 → 7 · m10 11.8 → 3.5
    8tb50a 8.0 → 14 · 8hbc40a 6.0 → 14 · ebase7 6.0 → 7

**m10 11.8 h → 3.5 h** resolves the long-standing defect: 11.8 h on a 0.67 kWh
AGM pack implied 0.057 kW of continuous draw, which is not physical. m10 was
ranking 2nd-best in the library on the smallest pack in it.

### `chargeTimeMin` — only cb18 has a sheet figure

`chargeTimeMin` is the engine's recharge input. The sheet gives a full-recharge
time for **cb18 only** (9.4 h → 564 min, `[owner-sheet]`). Every other platform
**keeps its prior `[estimate]`** — no value was invented:

| | stored | status |
|---|---|---|
| cb18 | 564 | `[owner-sheet]` 0→100% |
| ebase7 | 150 | `[cutsheet]` Oppent datasheet 2.5 h |
| m10 | 75 | `[estimate]` — sheet blank |
| 8tb50a / 8hbc40a | 90 | `[estimate]` — sheet blank |
| ml2 | 30 | `[estimate]` — **suspect**: the sheet's own 0.96 kW charger on a 1.51 kWh pack implies ~94 min |

### Unresolved conflicts — each is on the checklist

1. **cb18 Ah vs kWh.** Sheet says 564 Ah, but its 28.8 kWh (and the 20.16 kWh
   usable derived from it) implies **600 Ah** at 48 V. Stored 564 as written.
2. **cb18 charge-time band.** `runTimeHr` 16.67 h discharges the 20→100% band,
   but the stored `chargeTimeMin` is the 0→100% figure. Band-consistent would be
   ~451 min (80 SOC points at the sheet's own 5.6 min/point). At 3 shifts this
   is **79 vs 73 vehicles** — the largest single open question in the data.
3. **cb18 usable capacity.** 70% contradicts the 20-100% SOC band (80 points).
4. **ebase7 vs its datasheet.** Sheet: Li-ion 48 V / 120 Ah / 5.76 kWh / 7 h.
   Oppent datasheet: **LiFePO4 24 V / 100 Ah / 2.4 kWh / autonomy 6 h /
   recharge 2.5 h**. Sheet used per owner instruction; conflict unresolved.
5. **ebase7 transposed cells.** "Charge Time (0-100%) 29 hr" and "Charger
   Voltage 1.4 V" appear swapped — 1.4 h is exactly 5.76 kWh ÷ 4.1 kW, and 29 V
   is a standard 24 V-system charging voltage. Both left `null` rather than
   guessed. `chargerOutputA` 2.5 A is also inconsistent with 4.1 kW.
6. **8tb50a / 8hbc40a entire battery block unverified** (yellow on the sheet).
7. **`usableCapacityPct` is now per-platform** (70/80/80/70/70/70) but the calc
   engine still applies one global `DEFAULT_DOD = 0.80`. Only the SoC chart
   floor reads it now that energy OPEX is gone, so no price moves — but the
   chart is wrong for the four 70% platforms.


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
