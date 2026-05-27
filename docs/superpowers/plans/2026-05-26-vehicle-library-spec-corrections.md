# Vehicle Library Spec-Sheet Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct all six vehicle spec sheets (`src/content/vehicles/*.json`) to match the manufacturer cutsheets in `Vehicle Cutsheets/`, including names, OEM/manufacturer, categories, accessory (transfer-method) types, and every stat — converted to the imperial storage standard.

**Architecture:** Vehicle data is the single source of truth read by `src/lib/vehicleLibrary.ts`; Step 2 qualification and Step 3 cycle math consume it. This is a **data + docs** change only — no calc-engine, schema, or component changes. The Step 2 card already renders `display.manufacturer` under `vehicle.name` (`VehicleCard.tsx:77-79`), so correcting the data surfaces the OEM with no UI work.

**Tech Stack:** Next.js 16 / TypeScript (strict), JSON content files, Vitest.

> **Status: EXECUTED 2026-05-27.** Final accessory (transfer-method) sets per the engineer
> superseded the drafts in Tasks 2–6 below — authoritative values are the committed
> `src/content/vehicles/*.json` and `docs/VEHICLE-DATA-PROVENANCE.md`:
> CB18 = Lift · ML2 = Conveyor/Lift/Pin/Custom · M10 = Pin · E7 = Lift/Pin ·
> 8TB50A = Custom/Powered Conveyor Cart · 8HBC40A = Lift.

---

## Context

The stored vehicle values were placeholder/seed data with large errors and four mis-categorized vehicles. The real cutsheets (`Vehicle Cutsheets/`) were read with `pypdf` and reveal, e.g., the M10 is a **Bastian** cart tugger (not a Toyota fork truck), the Ebase7 is a **lift-platform** AGV (not a tugger), the 8TB50A is a **tow tractor** (not a reach truck), and the 8HBC40A is a **low-lift pallet truck** with a 6-inch lift (not a 25-ft reach truck). Speeds, capacities, dimensions, temps, and ramps were also wrong (M10 speed was ~2.5× too high; Ebase7 capacity ~6× too high).

**Decisions locked with the user:**
- **Speed convention:** automated full-load max used for BOTH `speedLoadedFps` and `speedUnloadedFps` (AGVs run a programmed speed; sheets give automated full-load).
- **Reclassifications applied** per the cutsheets, with the user's type names + synced `display.category`: CB18 "AGF", ML2 "Mini Load", M10 "Tunnel Type", E7 "Unit Load", 8TB50A "Automated Tugger", 8HBC40A "Automated Pallet Truck".
- **Names:** `CB18 AGF` (unchanged), `ML2 Mini Load`, `M10 Tunnel Type`, `E7 Unit Load`, `8TB50A Automated Tugger`, `8HBC40A Automated Pallet Truck`.
- **M10 is a Bastian product** → manufacturer Bastian Solutions, partnership **TAL Integrated**, fleetSoftware BlueBotics ANT, tHive true (matching CB18/ML2).
- **Off-sheet fields kept as current estimates and flagged** (price, charge kW, energy/ft, charger type, lift speeds, battery kWh where not derivable, accessory handling times, and temps/ramps/load-dims where a sheet is silent). Battery kWh is **derived** (V×Ah) where the sheet lists it: 8TB50A/8HBC40A = 18 kWh, Ebase7 = 2.4 kWh.

**Unit conversions used:** kg×2.20462=lb · m/s×3.28084=ft/s · mph×1.46667=ft/s · mm÷304.8=ft · mm÷25.4=in.

## File Structure

- `src/content/vehicles/{cb18,ml2,m10,ebase7,8tb50a,8hbc40a}.json` — corrected data (one file = one vehicle).
- `docs/VEHICLE-DATA-PROVENANCE.md` — **new**; per-field source tag (`[cutsheet]` / `[derived]` / `[estimate]`) so estimates are flagged for later replacement.
- `docs/SPECIFICATION.md` — refresh the Step 3 verification table + acceptance criteria #1 (CB18/ML2 empty speeds changed 11.5→9.84 and 6.5→5.9).
- `docs/CHANGELOG.md` — add an entry.
- **No code changes.** `VehicleCard.tsx` already shows manufacturer under the name; `vehicleLibrary.ts` types already permit every field/value used here (`category: string`, `navigationType` includes `natural`, `maxLiftHeightFt: number|null`, `liftSpeedFps?`, `lifts?`).

> NOTE: `src/calc/__tests__/flowMetrics.test.ts` uses **inline** CB18/ML2 fixtures (sU 11.5 / 6.5) to test the math; they are self-contained and do NOT read the JSON, so they stay green and need no change. Only `docs/SPECIFICATION.md`'s narrative table (which presents those speeds as the real vehicles) is refreshed.

---

### Task 1: Correct `cb18.json`

**Files:**
- Modify: `src/content/vehicles/cb18.json`

- [ ] **Step 1: Write the corrected file**

```json
{
  "id": "cb18",
  "name": "CB18 AGF",
  "display": {
    "manufacturer": "Bastian Solutions",
    "partnership": "TAL Integrated",
    "tHive": true,
    "fleetSoftware": "BlueBotics ANT",
    "heroImage": "/images/vehicles/cb18.png",
    "typicalLoad": "Standard Pallet",
    "category": "AGF",
    "navigationType": "lidar_slam"
  },
  "transferMethods": [
    { "method": "Lift", "loadTimeSec": 5, "unloadTimeSec": 5, "lifts": true }
  ],
  "payloadTypes": ["Standard Pallet", "Rack", "IBC"],
  "calc": {
    "maxWeightLbs": 4000,
    "widthFt": 4.19,
    "lengthFt": 6.13,
    "heightFt": 6.91,
    "turningRadiusFt": 4.82,
    "maxLiftHeightFt": 14.67,
    "maxLoadLengthIn": 48,
    "maxLoadWidthIn": 48,
    "maxLoadHeightIn": 72,
    "speedLoadedFps": 9.84,
    "speedUnloadedFps": 9.84,
    "liftSpeedFps": 0.65,
    "batteryKwh": 25.6,
    "energyKwhPerFt": 0.019,
    "chargeKw": 5.0,
    "chargeTimeMin": 90,
    "chargerType": "opportunity",
    "priceRange": { "minUsd": 165000, "maxUsd": 210000 }
  },
  "specs": {
    "tempMinF": 14,
    "tempMaxF": 113,
    "outdoorCapable": true,
    "freezerCapable": false,
    "maxRampGrade": 10,
    "certifications": ["ISO 3691-4", "ANSI B56.5"]
  }
}
```

Changed [cutsheet]: `maxWeightLbs` 3968→4000 (1800 kg) · `speedUnloadedFps` 11.5→9.84 (3 m/s, same as loaded) · `turningRadiusFt` 7.5→4.82 (57.85 in) · `maxLiftHeightFt` 14.7→14.67 (176 in) · `widthFt`→4.19 (50.3 in) · `lengthFt`→6.13 (73.5 in to fork face) · `heightFt`→6.91 (mast lowered 82.9 in) · `category`→"AGF". Unchanged [estimate]: liftSpeed, battery, charge, price, temps, ramp, load dims.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/content/vehicles/cb18.json','utf8')); console.log('cb18 OK')"`
Expected: `cb18 OK`

- [ ] **Step 3: Commit**

```bash
git add src/content/vehicles/cb18.json
git commit -m "data: correct CB18 spec sheet from cutsheet (capacity, speeds, dims)"
```

---

### Task 2: Correct `ml2.json`

**Files:**
- Modify: `src/content/vehicles/ml2.json`

- [ ] **Step 1: Write the corrected file**

```json
{
  "id": "ml2",
  "name": "ML2 Mini Load",
  "display": {
    "manufacturer": "Bastian Solutions",
    "partnership": "TAL Integrated",
    "tHive": true,
    "fleetSoftware": "BlueBotics ANT",
    "heroImage": "/images/vehicles/ml2.png",
    "typicalLoad": "Tote",
    "category": "Mini Load",
    "navigationType": "lidar_slam"
  },
  "transferMethods": [
    { "method": "Conveyor Interface", "loadTimeSec": 3, "unloadTimeSec": 3 }
  ],
  "payloadTypes": ["Tote"],
  "calc": {
    "maxWeightLbs": 440,
    "widthFt": 1.98,
    "lengthFt": 3.38,
    "heightFt": 0.9,
    "turningRadiusFt": 0,
    "maxLiftHeightFt": null,
    "maxLoadLengthIn": 24,
    "maxLoadWidthIn": 16,
    "maxLoadHeightIn": 14,
    "speedLoadedFps": 5.9,
    "speedUnloadedFps": 5.9,
    "batteryKwh": 8.0,
    "energyKwhPerFt": 0.008,
    "chargeKw": 1.5,
    "chargeTimeMin": 30,
    "chargerType": "opportunity",
    "priceRange": { "minUsd": 95000, "maxUsd": 130000 }
  },
  "specs": {
    "tempMinF": 32,
    "tempMaxF": 104,
    "outdoorCapable": false,
    "freezerCapable": false,
    "maxRampGrade": 5,
    "certifications": ["ISO 3691-4", "ANSI/RIA R15.08-1"]
  }
}
```

Changed [cutsheet]: `name`→"ML2 Mini Load" (drop "AV") · `category`→"Mini Load" · `maxWeightLbs` 770→440 (200 kg) · `speedUnloadedFps` 6.5→5.9 (1.8 m/s, same as loaded) · `widthFt`→1.98 (23.8 in) · `lengthFt`→3.38 (40.5 in) · `heightFt`→0.9 (10.8 in, base w/o appliance — [estimate] for with-deck) · `turningRadiusFt`→0 (ZTR). Load dims, battery, charge, price, ramp = [estimate].

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/content/vehicles/ml2.json','utf8')); console.log('ml2 OK')"`
Expected: `ml2 OK`

- [ ] **Step 3: Commit**

```bash
git add src/content/vehicles/ml2.json
git commit -m "data: correct ML2 spec sheet from cutsheet (rename, capacity, speed, dims)"
```

---

### Task 3: Correct `m10.json` (re-brand to Bastian + tunnel tugger)

**Files:**
- Modify: `src/content/vehicles/m10.json`

- [ ] **Step 1: Write the corrected file**

```json
{
  "id": "m10",
  "name": "M10 Tunnel Type",
  "display": {
    "manufacturer": "Bastian Solutions",
    "partnership": "TAL Integrated",
    "tHive": true,
    "fleetSoftware": "BlueBotics ANT",
    "heroImage": "/images/vehicles/m10.png",
    "typicalLoad": "Cart",
    "category": "Tunnel Type",
    "navigationType": "lidar_slam"
  },
  "transferMethods": [
    { "method": "Tow / Tugger", "loadTimeSec": 4, "unloadTimeSec": 4 }
  ],
  "payloadTypes": ["Cart"],
  "calc": {
    "maxWeightLbs": 2200,
    "widthFt": 1.22,
    "lengthFt": 6.56,
    "heightFt": 0.58,
    "turningRadiusFt": 0.33,
    "maxLiftHeightFt": null,
    "maxLoadLengthIn": null,
    "maxLoadWidthIn": null,
    "maxLoadHeightIn": null,
    "speedLoadedFps": 2.72,
    "speedUnloadedFps": 2.72,
    "batteryKwh": 14.0,
    "energyKwhPerFt": 0.011,
    "chargeKw": 3.0,
    "chargeTimeMin": 75,
    "chargerType": "opportunity",
    "priceRange": { "minUsd": 85000, "maxUsd": 115000 }
  },
  "specs": {
    "tempMinF": 50,
    "tempMaxF": 104,
    "outdoorCapable": false,
    "freezerCapable": false,
    "maxRampGrade": 7,
    "certifications": ["ISO 3691-4", "ANSI B56.5"]
  }
}
```

Changed [cutsheet]: `name`→"M10 Tunnel Type" · `manufacturer` Toyota→**Bastian Solutions** · `partnership` OEM→**TAL Integrated** · `tHive` false→**true** · `fleetSoftware`→**BlueBotics ANT** · `category`→"Tunnel Type" · `navigationType`→lidar_slam · transferMethod `Fork`→**`Tow / Tugger`** (pin cart hitch) · `typicalLoad`/`payloadTypes`→Cart · `speedLoadedFps`/`speedUnloadedFps` 6.56/7.5→**2.72** (0.83 m/s fwd) · `widthFt`→1.22 (14.6 in) · `lengthFt`→6.56 (78.7 in) · `heightFt`→0.58 (7 in) · `turningRadiusFt`→0.33 (4 in) · load dims→null (tows carts) · `tempMinF` 32→50 (10 °C). **[estimate flag]** `batteryKwh` 14.0 is implausibly high for the sheet's 28 Ah AGM — left as estimate per decision; revisit.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/content/vehicles/m10.json','utf8')); console.log('m10 OK')"`
Expected: `m10 OK`

- [ ] **Step 3: Commit**

```bash
git add src/content/vehicles/m10.json
git commit -m "data: correct M10 — Bastian tunnel tugger (was mislabeled Toyota fork truck)"
```

---

### Task 4: Correct `ebase7.json` (lift-platform unit-load AGV)

**Files:**
- Modify: `src/content/vehicles/ebase7.json`

- [ ] **Step 1: Write the corrected file**

```json
{
  "id": "ebase7",
  "name": "E7 Unit Load",
  "display": {
    "manufacturer": "Oppent",
    "partnership": "3rd Party",
    "tHive": false,
    "fleetSoftware": "Oppent Fleet Manager",
    "heroImage": "/images/vehicles/ebase7.png",
    "typicalLoad": "Unit Load",
    "category": "Unit Load",
    "navigationType": "natural"
  },
  "transferMethods": [
    { "method": "Lift Platform", "loadTimeSec": 10, "unloadTimeSec": 10, "lifts": true }
  ],
  "payloadTypes": ["Standard Pallet", "Rack"],
  "calc": {
    "maxWeightLbs": 2645,
    "widthFt": 2.68,
    "lengthFt": 4.59,
    "heightFt": 1.14,
    "turningRadiusFt": 0,
    "maxLiftHeightFt": null,
    "maxLoadLengthIn": 47,
    "maxLoadWidthIn": 47,
    "maxLoadHeightIn": 59,
    "speedLoadedFps": 4.59,
    "speedUnloadedFps": 4.59,
    "liftSpeedFps": 0.5,
    "batteryKwh": 2.4,
    "energyKwhPerFt": 0.012,
    "chargeKw": 2.0,
    "chargeTimeMin": 150,
    "chargerType": "opportunity",
    "priceRange": { "minUsd": 70000, "maxUsd": 95000 }
  },
  "specs": {
    "tempMinF": 41,
    "tempMaxF": 95,
    "outdoorCapable": false,
    "freezerCapable": false,
    "maxRampGrade": 3,
    "certifications": ["ISO 3691-4"]
  }
}
```

Changed [cutsheet]: `name`→"E7 Unit Load" · `category` Tugger→"Unit Load" · transferMethod `Tow / Tugger`→**`Lift Platform`** (lifts:true; integrated lift platform) · `typicalLoad`/`payloadTypes`→unit-load/pallet · `navigationType` magnetic→**natural** · `maxWeightLbs` 15000→**2645** (1200 kg nominal; max 3307 lb at 30% available) · `widthFt`→2.68 · `lengthFt`→4.59 · `heightFt`→1.14 · `turningRadiusFt`→0 (ZTR) · load dims→47/47/59 (1200/1200/1500 mm) · `speedLoadedFps`/`speedUnloadedFps`→**4.59** (1.4 m/s) · `tempMinF/MaxF`→41/95 (5–35 °C) · `outdoorCapable` true→**false** · `maxRampGrade` 12→**3** (3% slope) · `certifications`→ISO 3691-4 only (drop ANSI; European unit). [derived] `batteryKwh`→2.4 (24 V×100 Ah); `chargeTimeMin`→150 (2.5 h). [estimate] liftSpeed, `maxLiftHeightFt` null (stroke "customisable"), chargeKw, energy/ft, price, handling times.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/content/vehicles/ebase7.json','utf8')); console.log('ebase7 OK')"`
Expected: `ebase7 OK`

- [ ] **Step 3: Commit**

```bash
git add src/content/vehicles/ebase7.json
git commit -m "data: correct Ebase7 — Oppent lift-platform unit-load AGV (was mislabeled tugger)"
```

---

### Task 5: Correct `8tb50a.json` (automated tow tractor — no lift)

**Files:**
- Modify: `src/content/vehicles/8tb50a.json`

- [ ] **Step 1: Write the corrected file**

```json
{
  "id": "8tb50a",
  "name": "8TB50A Automated Tugger",
  "display": {
    "manufacturer": "Toyota Material Handling",
    "partnership": "OEM",
    "tHive": false,
    "fleetSoftware": "Toyota Fleet Manager",
    "heroImage": "/images/vehicles/8tb50a.png",
    "typicalLoad": "Cart Train",
    "category": "Automated Tugger",
    "navigationType": "natural"
  },
  "transferMethods": [
    { "method": "Tow / Tugger", "loadTimeSec": 10, "unloadTimeSec": 10 }
  ],
  "payloadTypes": ["Cart"],
  "calc": {
    "maxWeightLbs": 10000,
    "widthFt": 3.33,
    "lengthFt": 4.83,
    "heightFt": 2.69,
    "turningRadiusFt": 4.65,
    "maxLiftHeightFt": null,
    "maxLoadLengthIn": null,
    "maxLoadWidthIn": null,
    "maxLoadHeightIn": null,
    "speedLoadedFps": 5.87,
    "speedUnloadedFps": 5.87,
    "batteryKwh": 18.0,
    "energyKwhPerFt": 0.024,
    "chargeKw": 6.0,
    "chargeTimeMin": 90,
    "chargerType": "shift_swap",
    "priceRange": { "minUsd": 200000, "maxUsd": 275000 }
  },
  "specs": {
    "tempMinF": 14,
    "tempMaxF": 113,
    "outdoorCapable": false,
    "freezerCapable": false,
    "maxRampGrade": 3,
    "certifications": ["ISO 3691-4", "ANSI B56.5"]
  }
}
```

Changed [cutsheet]: `name`→"8TB50A Automated Tugger" · `category` Reach Truck→"Automated Tugger" · transferMethods `Fork`+`Lift Platform`→**`Tow / Tugger`** · removed `liftSpeedFps`; `maxLiftHeightFt` 30→**null** (does not lift) · `typicalLoad`/`payloadTypes`→cart · `maxWeightLbs` 5000→**10000** (towing capacity) · `speedLoadedFps`/`speedUnloadedFps` 8.2/9.5→**5.87** (automated full-load 4.0 mph) · `widthFt`→3.33 · `lengthFt`→4.83 · `heightFt`→2.69 · `turningRadiusFt`→4.65 (55.84 in) · load dims→null · `maxRampGrade` 8→**3** (automated rated slope). [derived] `batteryKwh`→18 (24 V×750 Ah). [estimate] charge, energy/ft, price, temps, handling times.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/content/vehicles/8tb50a.json','utf8')); console.log('8tb50a OK')"`
Expected: `8tb50a OK`

- [ ] **Step 3: Commit**

```bash
git add src/content/vehicles/8tb50a.json
git commit -m "data: correct 8TB50A — Toyota automated tow tractor (was mislabeled reach truck)"
```

---

### Task 6: Correct `8hbc40a.json` (low-lift automated pallet truck)

**Files:**
- Modify: `src/content/vehicles/8hbc40a.json`

- [ ] **Step 1: Write the corrected file**

```json
{
  "id": "8hbc40a",
  "name": "8HBC40A Automated Pallet Truck",
  "display": {
    "manufacturer": "Toyota Material Handling",
    "partnership": "OEM",
    "tHive": false,
    "fleetSoftware": "Toyota Fleet Manager",
    "heroImage": "/images/vehicles/8hbc40a.jpg",
    "typicalLoad": "Standard Pallet",
    "category": "Automated Pallet Truck",
    "navigationType": "natural"
  },
  "transferMethods": [
    { "method": "Fork", "loadTimeSec": 6, "unloadTimeSec": 6, "lifts": true }
  ],
  "payloadTypes": ["Standard Pallet", "Rack"],
  "calc": {
    "maxWeightLbs": 8000,
    "widthFt": 2.71,
    "lengthFt": 11.56,
    "heightFt": 2.69,
    "turningRadiusFt": 8.88,
    "maxLiftHeightFt": 0.5,
    "maxLoadLengthIn": 48,
    "maxLoadWidthIn": 48,
    "maxLoadHeightIn": 72,
    "speedLoadedFps": 7.33,
    "speedUnloadedFps": 7.33,
    "liftSpeedFps": 0.6,
    "batteryKwh": 18.0,
    "energyKwhPerFt": 0.018,
    "chargeKw": 4.0,
    "chargeTimeMin": 90,
    "chargerType": "shift_swap",
    "priceRange": { "minUsd": 180000, "maxUsd": 240000 }
  },
  "specs": {
    "tempMinF": 14,
    "tempMaxF": 113,
    "outdoorCapable": false,
    "freezerCapable": false,
    "maxRampGrade": 3,
    "certifications": ["ISO 3691-4", "ANSI B56.5"]
  }
}
```

Changed [cutsheet]: `name`→"8HBC40A Automated Pallet Truck" · `category` Narrow-Aisle Reach Truck→"Automated Pallet Truck" · `maxLiftHeightFt` 25→**0.5** (6-in fork lift!) · `maxWeightLbs` 4000→**8000** (rated; automated max ~7054 lb — [estimate] note) · `speedLoadedFps`/`speedUnloadedFps` 7.5/8.5→**7.33** (automated full-load 5 mph) · `widthFt`→2.71 · `lengthFt`→11.56 (84-in forks) · `heightFt`→2.69 (power unit) · `turningRadiusFt`→8.88 (106.6 in) · `maxRampGrade` 8→**3** (automated). [derived] `batteryKwh`→18 (24 V×750 Ah). [estimate] liftSpeed, charge, energy/ft, price, temps, load dims, handling times.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/content/vehicles/8hbc40a.json','utf8')); console.log('8hbc40a OK')"`
Expected: `8hbc40a OK`

- [ ] **Step 3: Commit**

```bash
git add src/content/vehicles/8hbc40a.json
git commit -m "data: correct 8HBC40A — Toyota low-lift pallet truck (was mislabeled 25ft reach truck)"
```

---

### Task 7: Add `docs/VEHICLE-DATA-PROVENANCE.md` (flag estimates)

**Files:**
- Create: `docs/VEHICLE-DATA-PROVENANCE.md`

- [ ] **Step 1: Write the provenance doc**

```markdown
# Vehicle Data Provenance

Per-vehicle source for each stored field. `[cutsheet]` = read from the manufacturer
cutsheet in `Vehicle Cutsheets/`; `[derived]` = computed from sheet values (e.g.
battery kWh = V×Ah, unit conversions); `[estimate]` = NOT on the sheet, placeholder
to be replaced. Corrected 2026-05-26.

## Fields that are ESTIMATES for every vehicle (not on any cutsheet)
- `calc.priceRange` (minUsd / maxUsd)
- `calc.chargeKw`, `calc.energyKwhPerFt`, `calc.chargerType`
- `transferMethods[].loadTimeSec` / `unloadTimeSec` (handling times)

## Per-vehicle estimate flags (beyond the above)
- **CB18:** liftSpeedFps, batteryKwh (48 V, Ah not on sheet), tempMin/Max, outdoorCapable, maxRampGrade, maxLoad*In.
- **ML2:** batteryKwh (63 Ah, voltage not on sheet), heightFt (base w/o appliance), maxLoad*In, maxRampGrade.
- **M10:** batteryKwh (28 Ah AGM — current 14 kWh is likely too high; revisit), maxRampGrade.
- **Ebase7:** liftSpeedFps, maxLiftHeightFt (stroke "customisable"). batteryKwh = [derived] 24 V×100 Ah = 2.4; chargeTimeMin = [cutsheet] 2.5 h.
- **8TB50A:** tempMin/Max. batteryKwh = [derived] 24 V×750 Ah = 18.
- **8HBC40A:** liftSpeedFps, tempMin/Max, maxLoad*In, maxWeightLbs (8000 rated; automated max ~7054 lb). batteryKwh = [derived] 18.

Everything else (names, manufacturer, partnership, category, accessories, capacities,
speeds, dimensions, lift heights, temps where listed, ramp where listed) is [cutsheet]/[derived].
```

- [ ] **Step 2: Commit**

```bash
git add docs/VEHICLE-DATA-PROVENANCE.md
git commit -m "docs: add vehicle data provenance (flag estimate fields)"
```

---

### Task 8: Refresh `docs/SPECIFICATION.md` verification table + acceptance criteria

The Step 3 verification table presents CB18 (sU 11.5) and ML2 (sU 6.5) as the real vehicles. Corrected empty speeds are now equal to loaded (CB18 9.84, ML2 5.9), which lengthens cycles. Recompute with `routeLayout = 'medium'` (factor 0.5), load+unload CB18 10 s / ML2 6 s.

**Files:**
- Modify: `docs/SPECIFICATION.md` (verification table + acceptance criterion #1)

- [ ] **Step 1: Recompute the numbers**

Run:
```bash
node -e '
const f=0.5, cb={sL:9.84,sU:9.84,lu:10}, ml={sL:5.9,sU:5.9,lu:6};
const cyc=(d,v)=>d/(v.sL*f)+d/(v.sU*f)+v.lu;
const rows=[[1,"CB",590,45],[2,"CB",394,30],[3,"ML",295,15],[4,"CB",722,38],[5,"CB",476,25],[6,"CB",312,22],[7,"ML",197,28],[8,"ML",246,18]];
let cbR=0,mlR=0;
for(const[n,t,d,thr]of rows){const v=t==="CB"?cb:ml;const c=cyc(d,v);const r=thr*c/3600;console.log(n,t,d,thr,c.toFixed(2),r.toFixed(3));if(t==="CB")cbR+=r;else mlR+=r;}
console.log("CB18 raw",cbR.toFixed(3),"ceil",Math.ceil(cbR),"ML2 raw",mlR.toFixed(3),"ceil",Math.ceil(mlR),"total",Math.ceil(cbR)+Math.ceil(mlR));
'
```
Expected (reference): CB18 groupRaw ≈ **9.99 → 10**, ML2 ≈ **2.81 → 3**, total **13**. Per-row cycles ≈ 1:249.8, 2:170.2, 3:206.0, 4:303.5, 5:203.5, 6:136.8, 7:139.6, 8:172.8 s.

- [ ] **Step 2: Update the verification table + acceptance criterion #1**

Replace the per-row `cycle (s)` / `rawVehicles` columns and the group `groupRaw` values with the recomputed figures above (use the script's exact output). Update the prose note that cites `sU = 11.5 / 6.5` to `sU = 9.84 / 5.9` and acceptance criterion #1's `groupRaw ≈ 9.31 / 2.68` to `≈ 9.99 / 2.81`. Add a one-line note: "Empty speed now equals loaded speed (AGVs run a programmed speed); see VEHICLE-DATA-PROVENANCE.md."

- [ ] **Step 3: Commit**

```bash
git add docs/SPECIFICATION.md
git commit -m "docs: refresh Step 3 verification table for corrected CB18/ML2 speeds"
```

---

### Task 9: CHANGELOG entry

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Prepend an entry**

```markdown
## 2026-05-26 — Vehicle library corrected from manufacturer cutsheets

All six `src/content/vehicles/*.json` corrected against the cutsheets in `Vehicle Cutsheets/`
(imperial conversions applied). Four were mis-categorized: **M10** is a Bastian tunnel tugger
(was a Toyota fork truck — manufacturer/partnership/software/T-Hive all fixed), **Ebase7** is an
Oppent lift-platform unit-load AGV (was a tugger), **8TB50A** is a Toyota automated tow tractor
(was a reach truck — no lift), **8HBC40A** is a low-lift pallet truck with a 6-inch fork lift
(was a 25-ft reach truck). Speeds use the automated full-load max for both loaded and empty
(M10 was ~2.5× too fast; Ebase7 capacity was ~6× too high). Names/categories updated (e.g.
"ML2 Mini Load", "M10 Tunnel Type"). Off-sheet fields (price, charge, lift speed, handling times,
some battery kWh) kept as estimates — see `docs/VEHICLE-DATA-PROVENANCE.md`. No calc/schema/UI
changes; the Step 2 card already shows manufacturer under the name. Step 3 verification table
refreshed for the corrected CB18/ML2 empty speeds (total base fleet stays 13).
```

- [ ] **Step 2: Commit**

```bash
git add docs/CHANGELOG.md
git commit -m "docs: changelog for vehicle library cutsheet corrections"
```

---

### Task 10: Full verification

- [ ] **Step 1: TypeScript + build**

Run: `npx tsc --noEmit 2>&1 | grep -v "pdfExport.test.ts"` → expect no output.
Run: `npm run build` → expect "Compiled successfully" and TypeScript finished.

- [ ] **Step 2: Tests**

Run: `npx vitest run` → expect **91 passed** (calc fixtures are inline; unaffected by data).

- [ ] **Step 3: Manual sanity (dev server)**

Run: `npm run dev`, open Step 2 — confirm each card shows the corrected **name** with the **OEM beneath it** (M10 = Bastian Solutions, 8TB50A/8HBC40A = Toyota, E7 = Oppent), correct integration badge (M10 = TAL Integrated), and corrected category. Open Step 3 — confirm picking M10/8TB50A/8HBC40A/Ebase7 shows the new accessory (Tow/Tugger, Lift Platform, Fork) and the cycle/speed reflects corrected speeds.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review

- **Spec coverage:** All six vehicles (Tasks 1–6) + estimate flagging (Task 7) + downstream doc consistency (Tasks 8–9) + verification (Task 10). Names, OEM/manufacturer, categories, accessories, and stats all covered.
- **Placeholders:** None — every JSON file is shown in full; recompute step provides the exact script.
- **Type consistency:** All values conform to `vehicleLibrary.ts` types (`category: string`, `navigationType: 'natural'|...`, `maxLiftHeightFt: number|null`, `liftSpeedFps?`, `lifts?`). `partnership` values are within the `Partnership` union.
- **Open items for the user (flagged, not blocking):** M10 `batteryKwh` (14 kWh estimate likely too high vs 28 Ah AGM); Ebase7 `maxWeightLbs` uses nominal 2,645 lb (max 3,307 available); 8HBC40A `maxWeightLbs` uses rated 8,000 lb (automated max ~7,054); all price/charge/lift-speed/handling-time estimates per `VEHICLE-DATA-PROVENANCE.md`.
