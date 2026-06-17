# TAL Fleet Calculator — Specification

The functional spec ("what the app does"). For architectural rules ("how it's built"), see `ARCHITECTURE.md`. For decision history, see `docs/CHANGELOG.md`.

---

## Step 1 — Application Questionnaire

Thirteen flat sections became **three labeled tiers** (2026-06-10) so an applications
engineer can see which answers move the Step 2 traffic lights:

1. **VEHICLE QUALIFICATION** — every field the gate engine reads:
   01 *What are you moving?* (weight, unit type, load L×W×H, pallet subtype/custom),
   02 *How is it transferred?* (transfer method, delivery pattern, conditional lift height),
   03 *Environment & site* (temp min/max, outdoor, freezer, ramp grade + ramp distance,
   aisle width — informational only), 04 *Certifications* (soft gate).
2. **FLEET SIZING & ECONOMICS** — 05 schedule, 06 throughput & distance, 07 labor.
3. **PROPOSAL DETAILS** (collapsed by default; consumers arrive in future revisions) —
   08 site details (floor condition, dust/moisture), 09 integration (interlocks, WMS,
   other AGVs), 10 dealer & contact (facility, TAL engineer, proposal date, OEM dealer,
   dealership, rep), 11 timeline (install date), 12 notes.

**Qualification readiness meter** (SectionNav): counts answered gate inputs —
`maxLoadWeightLbs, typicalUnitType, loadLengthIn, loadWidthIn, loadHeightIn,
transferMethod, deliveryPattern, tempMinF, tempMaxF, maxRampGrade, minAisleWidthFt`
(11, always). Pick/Drop heights are **not** counted (floor-to-floor — both 0 — is a valid
answer, not a gap). "Answered" = non-empty string / finite **nonzero** number — 0 is the app-wide
"no requirement" sentinel, for temps too (real freezer specs are negative °F; the
temp gates likewise skip at 0 — see gates.ts). Cleared fields don't count.
Checkboxes (outdoor/freezer) and certifications are excluded — unchecked is an answer.
The meter is informational; no field is required to advance (architecture rule).

**Canonical vocabularies** (`src/lib/constants/enums.ts` — single source of truth,
asserted against the vehicle JSONs by `src/lib/__tests__/enumAlignment.test.ts`):
- `TRANSFER_METHODS = ['Lift', 'Pin', 'Conveyor', 'Custom', 'Powered Conveyor Cart']`
  — identical to the union of vehicle `transferMethods[].method`.
- Every vehicle `payloadTypes` entry appears in `TYPICAL_UNIT_TYPES` (the form may
  offer extra types — Roll, Coil, Other — for which "no vehicle applies" is the
  correct matrix answer).
- Every vehicle certification token appears in `CERTIFICATIONS`.

### Multiple loads (matrix-only)

A project may declare up to 4 **loads** (`loads: LoadSpec[]`), each with its own
`unitType`, optional L×W×H, and optional `weightLbs` (falls back to the project
`maxLoadWeightLbs`). Loads exist **only to evaluate the Step 2 matrix** (and print in
the PDF) — flows never reference a load and Step 3 is untouched: vehicle assignment
remains entirely the applications engineer's choice. The 5 load-coupled hard gates
(payload type, 3 load dims, weight) run once per load; rollup: passes **all** loads →
GREEN (soft gates may yellow), passes **some** → YELLOW with the compatible loads named,
passes **none** → RED. With a single load, results are identical to the pre-loads model.
Legacy singular fields (`typicalUnitType`, `loadLengthIn/Width/Height`, pallet fields)
stay in the schema; `loads[0]` mirrors into them on save, and projects without `loads`
synthesize one load from them on read (`effectiveLoads`).

### Step 1 flows (shared with Step 3)

Section 06 (*Throughput & distance*) is a **flow-row list that edits the same
`flows[]` array Step 3 uses** — Origin · Destination · Distance (one-way) ·
Moves/hr per row, plus add/duplicate/remove. **No vehicle column**: vehicles are
assigned only in Step 3 (hard rule — never auto-selected). New rows carry flow
defaults (`routeLayout 'medium'`, `liftHeightFt 0`). Porting Step 1 ↔ Step 3 is
therefore live in both directions; the old Step 3 "seed from Step 1" button is
removed. Legacy projects with only `requiredThroughputPerHour`/`avgDistanceFt` and
zero flows get one prefilled row (round-trip distance ÷ 2), persisted on first edit.

### Tier-2 → downstream porting (derived defaults, never locks)

Step 1 sizing data seeds downstream values only while the user hasn't overridden them:
- `shiftsPerDay × hoursPerShift` → `dailyOpHr` (Fleet Engine charging + ROM energy).
- `operatorsPerShift × shiftsPerDay` → ROM "Operators displaced" default.
- `breaksPerShift`/`breakDurationMin` → ROM effective op-hours.
- `operatingDaysPattern` → ROM `operatingDaysPerYear` default via
  `defaultOperatingDaysPerYear`: Mon–Fri 260 · Mon–Sat 312 · Mon–Sun 364 ·
  Custom = selected days × 52 · unset 312. Editable override always wins.
- Shift coverage → `chargeRegime` default: schema field is optional (unset
  representable); effective regime = stored value, else `continuous` when
  `dailyOpHr ≥ 24`, else `overnight`. The engine toggle writes the explicit choice.

---

## Fleet Engine (Step 3)

The sizing calculation lives in **one scrolling page** (`app/projects/[id]/step3`) with **all three
sub-stages always visible** — **01 Raw Fleet · 02 Charging · 03 Buffer** — sharing a single live
recompute. The engineer sees the entire waterfall at once; nothing is hidden behind a wizard.
Navigation: `0 Start · 1 Application · 2 Vehicles · 3 Fleet Engine · 4 ROM Dashboard` (ROM consumes
the engine's total; KPIs belong to it). Combines the former Flows/Charging/Buffer steps — see the
`ARCHITECTURE.md` exception. *(2026-06-12: replaced the staged wizard — stage rail, Back/Next, View
Transitions morphing — with this questionnaire-style layout.)*

**Scroll-spy side nav** (questionnaire pattern, reusing the `.section-nav` styles): a sticky left
rail lists the three sections (`01 Raw Fleet · 02 Charging · 03 Buffer`), highlights the section in
view via IntersectionObserver, scrolls on click, and shows the live **TOTAL fleet** figure at the
top. Sections render as full-width blocks with numbered headers, visually matching the Step 1
form sections. Both pieces are the shared `src/components/ScrollSpyNav.tsx` /
`src/components/ScrollSection.tsx`, also used by the Step 4 ROM dashboard's scrolling layout.

**Hero** (`.engine-result`): the headline is always the **total fleet sold**; the
`base · +charging · ×buffer = total` build-up bar shows every segment lit (all stages are visible).
Right side: per-vehicle **raw → rounded base** mix with thumbnails.

**Waterfall (per vehicle group `g`, one per `vehicleId`):**
`baseFleet → + chargingDelta → × (1 + bufferPct) → ⌈⌉ = fleetSold`; project **TOTAL** = `Σ fleetSold`.

### Section 01 — Raw Fleet
The material-flow table that produces the **base fleet** (`groupRaw`, `baseFleet = ⌈groupRaw⌉`) —
pure engineering, no multipliers. Fully specified in **Step 3 — Material Flows** below.

### Section 02 — Charging (Ah/A battery model)
Pure calc in `src/calc/fleet.ts`. Battery specs are amp-hours / amps (`ratedAh`, `voltageV`,
`dischargeA`, `chargeA`, optional `chargeTimeMin`). `DEFAULT_DOD = 0.80`.

```
usableAh  = ratedAh × DOD
runHr     = usableAh / dischargeA            (op-hours per charge)
chargeHr  = chargeTimeMin/60  |  usableAh / chargeA
dailyOpHr = min(24, shiftsPerDay × hoursPerShift)         (Step 1)

A = plugged:     runHr / (runHr + chargeHr)
    opportunity: chargeA / (chargeA + dischargeA)

chargingDelta = (regime='overnight' AND runHr ≥ dailyOpHr) ? 0
              : max(0, ⌈groupRaw / A⌉ − baseFleet)
```
- **Regime** (`chargeRegime`, project-level): `overnight` (a daily off-shift window exists — a charge
  that lasts the operating day adds nothing) vs `continuous` (24/7 — always uses the availability model).
- **Method** (`chargeMethods[vehicleId]`, default from the vehicle's `chargerType`: `opportunity` →
  opportunity, else `plugged`): *opportunity* tops up during idle; *plugged* takes the vehicle offline
  to charge. Two methods only.
- Inputs missing/zero → a non-sustainable result shown as `—` (never NaN).

### Section 03 — Buffer (buffer + total)
A single project **buffer %** (`bufferPct`, default `0.10`) — the only multiplier in the pipeline —
applied after charging: `fleetSold = ⌈(baseFleet + chargingDelta) × (1 + bufferPct)⌉`. The section
shows a **buffer preset dropdown** — `Standard (10%) · Medium (20%) · Conservative (25%) · Custom…`
(Custom reveals a % input; a stored value that matches no preset displays as Custom automatically;
`bufferPct` stays a plain number in the schema) — and the per-flow waterfall
(`base → +charging → ×buffer → fleet`); the binding TOTAL is the hero number.

---

## Step 3 — Material Flows

### Purpose

Step 3 decomposes the facility's material movement into discrete **flows** (origin → destination pairs) and derives, live as the user types, the cycle time and raw fractional vehicle demand per flow, plus per-vehicle aggregate `baseFleet`. Step 3's output is a pure-engineering number with **no safety multipliers**; the Charging and Fleet (buffer) sub-tabs layer on top, each with named scope so the proposal team can defend every multiplier individually.

### Pipeline overview

```
Step 3:  per-flow cycle → per-flow rawVehicles → per-group baseFleet (ceil of sum)
Step 4:  baseFleet → chargingDelta (additive, from battery physics)
Step 5:  (baseFleet + chargingDelta) × (1 + bufferPct) → ⌈ceil⌉ → fleetSold
```

Each stage models a distinct cause: Step 3 is engineering, Step 4 is physics, Step 5 is policy. There is no productivity factor η and no congestion multiplier — those conflate causes and create double-counting risk against Step 5.

### Per-flow inputs

- `origin` — free text (e.g. "Dock A")
- `destination` — free text (e.g. "Storage 1")
- `distanceFt` — **one-way** distance in feet, ≥ 0. The cycle multiplies by 2: vehicle travels loaded out and empty back.
- `thruPerHr` — cycles per hour, ≥ 0. One cycle = one full round-trip pick-and-place.
- `routeLayout` — `'low' | 'medium' | 'high'`. The vehicle's **route-average** speed as a fraction of its rated cruise. This is an *average over the whole route*, not an instantaneous cap: a vehicle accelerates, decelerates, and rounds corners, so it never sustains rated cruise end-to-end. **70% (High/Open) is the realistic ceiling** — open lanes, low traffic, few turns. Medium/Mixed (50%): typical warehouse mix of straightaways and turns. Low/Congested (30%): heavy traffic, lots of turns, tight corners, blind intersections, frequent slowdowns. Defaults to `'medium'`. Surfaced in the UI as **Route Average Speed** — a tiered dropdown listing each tier's % and condition (highest first).
- `liftHeightFt` — total vertical travel of the load per cycle, feet, ≥ 0. 0 when transfer method does not lift. Engineer enters the per-cycle total (e.g., 4 ft for a single Floor→Height delivery; 8 ft for Height-Height = 4 up + 4 down).
- `vehicleId` — id of a vehicle from `src/content/vehicles/*.json`
- `transferMethodIdx` — index into `vehicle.transferMethods[]`; defaults to 0. Surfaced in the UI as a dedicated **Transfer Method** column whose options are scoped to the selected vehicle.

### Vehicle JSON additions for Step 3

Vehicles with a lift-capable transfer method gain two fields:

- `calc.liftSpeedFps` — vertical lift speed in feet per second (e.g., 0.5 fps for a standard mast).
- `transferMethods[i].lifts: true` — flag identifying which transfer methods derive their cycle time from height. Vehicles without any lifting transfer method omit both.

In the current library, the lifting transfer methods are the `Lift` appliances on **CB18, ML2, E7, and 8HBC40A**, each flagged `lifts: true`. CB18 (0.65), E7 (0.5), and 8HBC40A (0.6) declare a `liftSpeedFps`; ML2's lift appliance uses an estimated `liftSpeedFps` (0.5) pending a real value. Non-lifting methods — Pin, Conveyor, Custom, Powered Conveyor Cart — omit the flag and add 0 lift time.

### Constants

- `ROUTE_LAYOUT_FACTORS = { low: 0.3, medium: 0.5, high: 0.7 }` — route-average speed multipliers applied to rated cruise. The scale tops out at `0.7`: even the best-case open-lane *average* is ~70% of rated, because no route sustains full cruise (accel/decel/turns).
- `T_hr = 3600` — seconds per hour.
- `DEFAULT_BUFFER_PCT = 0.10` — used in Step 5, declared in `src/calc/types.ts` for cross-step visibility.

### Per-flow derived

```
factor           = ROUTE_LAYOUT_FACTORS[routeLayout]            // 0.5 / 0.7 / 0.9
travelLoadedSec  = distanceFt / (vehicle.calc.speedLoadedFps × factor)
travelEmptySec   = distanceFt / (vehicle.calc.speedUnloadedFps × factor)
transfer         = vehicle.transferMethods[transferMethodIdx ?? 0]
loadSec          = transfer.loadTimeSec
unloadSec        = transfer.unloadTimeSec
liftTimeSec      = (transfer.lifts && vehicle.calc.liftSpeedFps > 0)
                   ? liftHeightFt / vehicle.calc.liftSpeedFps
                   : 0

cycleSeconds     = travelLoadedSec + travelEmptySec
                 + loadSec + unloadSec
                 + liftTimeSec

rawVehicles      = thruPerHr × cycleSeconds / 3600
```

`distanceFt` is **one-way**; the cycle includes the empty return trip (both travel components run at the route-layout-derated speed).

`liftTimeSec` is 0 for non-lifting transfers (Pin, Conveyor, Custom, Powered Conveyor Cart). For lifting transfers (`Lift`), the engineer enters the per-cycle total `liftHeightFt`; the vehicle's `liftSpeedFps` does the conversion.

`rawVehicles` is fractional. `0.94` means this flow alone consumes 94 % of one vehicle's hour; `1.72` means a single vehicle cannot serve it — vehicles must pool.

### Per-group derived (per unique `vehicleId`)

```
groupRaw    = Σ rawVehicles  over flows with this vehicleId
baseFleet   = ceil(groupRaw)
headroom    = baseFleet > 0 ? (baseFleet − groupRaw) / baseFleet : null
baseThru    = Σ thruPerHr
avgCycleSec = baseThru > 0 ? Σ(thruPerHr × cycleSeconds) / baseThru : null
```

`baseFleet` is Step 3's output: the integer number of vehicles of this type required to pool-serve all assigned flows, **before** charging or buffer.

### Project totals

```
totalFlows     = flows.length
totalThru      = Σ thruPerHr across all flows
totalRawFleet  = Σ groupRaw across groups
totalBaseFleet = Σ baseFleet across groups
```

### Charging & buffer

Built as the Charging and Fleet sub-tabs of the Fleet Engine — see the **Fleet Engine (Step 3)**
section above for the Ah/A charging model (`chargingDelta`) and the buffer waterfall.

### Hard gates per flow

Step 3 imposes **no** per-flow hard gates. Step 2 already qualifies the vehicle library against the project-wide `maxLoadWeightLbs`; engineers picking a vehicle here have already seen that qualification matrix. Per-flow weight is not collected.

### UI behavior

- Table is fully inline-editable. Every keystroke writes to storage (using the same `watch()` save pattern from Step 1).
- The table is centered on the page (`margin-inline: auto`).
- Columns are organized into three visual bands: **Vehicle** (`# · Vehicle · Transfer Type`), **Route Input** (`Route Average Speed · Origin · Destination · Distance (Round Trip) · Throughput (Moves per Hour)`), and **Output** (`Cycle Time · Vehicle Count`). The Output band is visually distinct.
- The leading **`#`** column and the trailing **action** column are **borderless gutters that sit outside the bordered data grid** — no cell borders, no shading. The grid (Vehicle … Vehicle Count) keeps its dividers; the two flanks read as clean gutters.
- Top-right action cluster: **`+Group`** (creates a new group) and **`+Flow`** (appends an ungrouped row). Each flow row has a trailing **fleet-math** (Σ), **duplicate**, and **delete** control (aligned, borderless icon buttons).
- **Fleet-math derivation panel.** The Σ icon in a flow's action cluster opens a `DerivationPanel` (anchored popover) showing the live, value-substituted formulas that produce the flow's fleet demand — each step as *label · symbolic form · substituted form → result*: travel out/back = `distance ÷ (speed × pace)`, load/unload from the transfer method, lift = `height ÷ lift speed`, then **Cycle time** = the sum and **Vehicle count** = `throughput × cycle ÷ 3600` (both emphasized). All values come from the engine's `CycleBreakdown` + flow inputs, so they update live as the flow is edited; the panel is imperial (one-way leg · seconds). A closing note reminds that the integer fleet pools per vehicle at the project level. The trigger is disabled when the cycle is undefined.
- **Drag to reorder.** A grip handle in the `#` gutter drags a flow to a new position (insertion line shows where it lands). Dropping onto another group's rows — or onto a group header — moves the flow into that group, so drag doubles as the regroup gesture.
- **Route Average Speed** is a tier picker: the trigger shows **High / Medium / Low** (highest-first); a click-through panel explains each tier (`High — Open lanes, few turns · 70%`, `Medium — Mixed warehouse traffic · 50%`, `Low — Congested, many turns · 30%`). Beneath the trigger the cell shows the resulting **Avg** speed and the vehicle's **Max** (rated) speed, loaded / empty, in the active unit — **ft/s** (imperial) or **m/s** (metric). Backed by the unchanged `routeLayout` enum.
- **Transfer Type** is a single, constant-height cell that reads uniformly as `Method +Ns` (the time the transfer adds = load + unload, plus height-derived lift time for lifting methods) — like any fixed accessory. For **lifting** methods the `+Ns` badge is a button that opens a small **popover** to set the lift height (an accent dot hints when height is still 0); the height is never an always-visible field. Fixed methods show a static badge.
- **Cycle Time** renders as whole seconds (e.g. `234s`) with the inline anatomy bar and click-through breakdown popover. **Vehicle Count** renders fractional `rawVehicles` to 2 dp (e.g. `2.34 vehicles`); the integer `⌈baseFleet⌉` appears only in the summary box.
- Distance shown in m when the unit toggle is metric, ft in imperial. **Storage always imperial** per ARCHITECTURE.md §3.
- The Vehicle cell renders the vehicle's `heroImage` thumbnail, falling back to a deterministic per-vehicle color dot (hash → palette) on image error.

### Groups (organizational zones)

Groups are named, organizational zones (e.g. "ASRS", "Dock") — they structure the table visually but do **not** change fleet sizing: demand still pools **per `vehicleId`** across the whole project (`⌈Σ raw CB18⌉`, `⌈Σ raw ML2⌉`). A CB18 used in two different groups shares one pool.

- **No grouping UI appears until a group is created.** With zero groups the table is a plain flat list of flows.
- Group names live at the project level in `flowGroups: string[]` (ordered; Zod `.default([])`). The effective group list is `flowGroups ∪ distinct flow.sectionName` so legacy projects that only carry `sectionName` still display.
- Each flow references its group via the existing `flow.sectionName` (no flow-schema change).
- **`+Group`** appends a new group with a placeholder name and focuses its header for **inline renaming** (a real text input committed on blur/Enter — no browser prompt).
- A group renders as a full-width **header row** (color swatch · inline-editable name · flow count · **total vehicle demand** · its own **`+ Add flow`** button) above its flows. `+ Add flow` drops a new flow straight into that group. The total vehicle demand is `Σ rawVehicles` over the group's flows (the per-flow Vehicle-Count math, summed) — fractional, informational; the binding integer fleet still pools per `vehicleId` across the project (see `FleetRibbon`).
- **Group color is user-selectable.** The header swatch is a button that opens a small palette popover (the same 6 curated, color-blind-safe brand colors as the hash default; TAL red is reserved). The chosen color drives the header swatch, left bar, and row tint (`--group-color`). Overrides live at the project level in `flowGroupColors: Record<groupName, hex>` (Zod `.default({})`); a group with no override falls back to the deterministic `sectionColor(name)` hash. The override follows the group across an inline rename and is dropped when the group is deleted.
- Flows with no `sectionName` render as plain rows (no header) after the group sections.
- Deleting a group (× on its header) un-assigns its member flows (`sectionName → undefined`); it does not delete the flows.

### Headroom color thresholds (display only)

- ≥ 30 % — green (comfortable)
- 15–30 % — green
- 5–15 % — yellow (tight)
- < 5 %   — red (no margin — likely needs another vehicle or workload re-balance)

### Acceptance criteria

1. Adding the 8 rows from the verification table (with `routeLayout = 'medium'` (factor 0.5), `liftHeightFt = 0`, default transfer method) produces:
   - CB18: `groupRaw ≈ 9.99`, `baseFleet = 10`.
   - ML2:  `groupRaw ≈ 2.81`, `baseFleet = 3`.
2. Editing any flow field instantly re-derives all downstream numbers — no save button, no page reload.
3. Every vehicle is selectable in every row's dropdown. Step 2's traffic-light matrix already qualifies vehicles against project-wide weight.
4. Reloading the page restores all flows and computed values.
5. Calc engine (`src/calc/flowMetrics.ts`) has zero React, fetch, or localStorage imports.
6. All Vitest cases for cycle / raw / group / project pass.
7. A flow with a lifting transfer method and `liftHeightFt = 10` against a vehicle with `liftSpeedFps = 0.5` adds exactly 20 s to its `cycleSeconds` (independent of `routeLayout`, since lift time is not derated).
8. Changing a flow from `routeLayout = 'medium'` to `'high'` (factor 0.5 → 0.7) reduces travel time by ~29% (`(0.7-0.5)/0.7 = 28.6%`).

### Verification table (test data)

Vehicles: **CB18** (Lift, sL = 9.84 fps, sU = 9.84 fps, load+unload = 10s) · **ML2** (Conveyor, sL = 5.9 fps, sU = 5.9 fps, load+unload = 6s). All rows: `routeLayout = 'medium'` (factor 0.5), `liftHeightFt = 0`. *(Empty speed now equals loaded — AGVs run a programmed speed; per the cutsheet correction. Handling times here are representative fixture values; the JSON per-accessory times are estimates — see `VEHICLE-DATA-PROVENANCE.md`.)*

| Row | Vehicle | Distance (ft) | Thru/hr | cycle (s) | rawVehicles |
|-----|---------|-----:|-----:|--------:|-----------:|
| 1   | CB18    |  590 |   45 | 249.84  | 3.123 |
| 2   | CB18    |  394 |   30 | 170.16  | 1.418 |
| 3   | ML2     |  295 |   15 | 206.00  | 0.858 |
| 4   | CB18    |  722 |   38 | 303.50  | 3.204 |
| 5   | CB18    |  476 |   25 | 203.50  | 1.413 |
| 6   | CB18    |  312 |   22 | 136.83  | 0.836 |
| 7   | ML2     |  197 |   28 | 139.56  | 1.085 |
| 8   | ML2     |  246 |   18 | 172.78  | 0.864 |

| Group | groupRaw | baseFleet | headroom |
|-------|---------:|----------:|---------:|
| CB18 (1, 2, 4, 5, 6) | 9.994 | **10** | (10 − 9.994) / 10 ≈ 0.1% |
| ML2  (3, 7, 8)       | 2.808 | **3** | (3 − 2.808) / 3 ≈ 6.4% |

Project totals: `totalFlows = 8`, `totalThru = 221`, `totalRawFleet ≈ 12.80`, `totalBaseFleet = 13`.

CB18 is effectively at capacity (~0.1% headroom — a hair from needing an 11th), ML2 sits in the **yellow** band (6.4%). Two model corrections drive the longer cycles vs. early rounds: the medium route-average factor is `0.5` (70% is the best-case *average*, not 90%), and **empty travel now uses the same speed as loaded** (the cutsheets give one automated speed; no faster empty-return assumption). Both push fleet counts up relative to a sustained-cruise model.

---

## Step 4 — ROM Dashboard

Customer-facing summary fed by the Fleet Engine `FleetSummary`. Read-only except the
economic assumptions.

**Fleet KPIs:** total fleet sold, vehicle-type count, total throughput (moves/hr),
total base→sold build-up.

**ROM pricing (range, never a point):** for each vehicle group,
`fleetSold × priceRange` → line range; summed to `totalMin`/`totalMax`; `totalMid =
(min+max)/2` used for downstream math only (never shown as "the price").

**Economic assumptions (persisted, editable, defaulted):**
- `operatorsPerShift` (from Step 1; default 0) × `shiftsPerDay` = total operators
  displaced. `fullyBurdenedRateUsdPerYear` (default 65 000), `energyCostUsdPerKwh`
  (0.12), `annualMaintenancePctOfCapex` (0.08), `operatingDaysPerYear` (312 or derived
  from `operatingDaysPattern`). The `numberOfOperators` legacy override field is
  schema-optional and cleared by the ROI card on edit (the derived product is always
  authoritative).

**Annual OPEX:** energy = Σ over groups of `(dischargeA × voltageV / 1000) kW ×
dailyOpHr × operatingDaysPerYear × fleetSold × energyCostUsdPerKwh`; maintenance =
`totalMid × annualMaintenancePctOfCapex`.

**Simple ROI card (`RomEconomics`):** two editable inputs — *Operators replaced per
shift* and *Fully-burdened cost* (displayed as currency `$65,000` at rest, raw number
on focus). Local React state owns the live values; `onPatch` persists to storage
asynchronously. Computation is inline (no dependency on the parent `costs` memo):
`totalOps = localOps × shiftsPerDay`, `annualOffset = totalOps × localRate`,
`payback = capexMid / annualOffset` (— when offset = 0). OPEX is informational only
— not netted against the offset.

**Export:** proposal PDF (embedded-JSON pattern, with a fleet/ROM page) · project
JSON · **Branded PowerPoint** (see below) · **Excel workbook** (`.xlsx`, client-side via
SheetJS — Summary, Requirements, Flows, Fleet waterfall, ROM sheets). Excel builds on
`src/lib/fleetModel.ts` (`computeFleetModel`) and is dynamically imported.

**Branded PowerPoint (template-fill).** The `.pptx` export fills the official 35-slide TAL
deck (`public/templates/tal-rom-template.pptx`) rather than building slides from scratch —
preserving its theme, masters, and media (Toyota Type, TAL red). Client-side via **PizZip**
(`src/lib/pptxTemplateExport.ts` + `src/lib/pptx/*`). A **Section Picker**
(`PptxSectionPicker`, from the Step 4 export bar and the header menu) chooses which sections
to include; **Product Overview slides are auto-limited to the fleet chassis** (vehicles
assigned to flows; Cleanfix always dropped). The builder removes unselected slides via OOXML
(`presentation.xml` sldIdLst + rels + `[Content_Types]`). Content is filled two ways: cover
(S1) + contact (S34) **bracket replacement**, and the step slides — Fleet Engine math (Raw
S21 / Charging S22 / Buffer S23), KPIs (S25/26), Investment (S27), ROI (S28) — by **writing
into each slide's existing body Content Placeholder** (`<p:ph idx="1"/>`, via
`fillBodyPlaceholder`) so the text inherits the branded layout instead of a free-floating box
(`src/lib/pptx/content.ts`, from `computeFleetModel`). The matrix and data slides — App
Requirements (S18), Vehicle Selection Matrix (S19 verdicts + S20 gate×vehicle grid, from
`qualifyVehicle`), Material Flow (S24) — are filled with **native editable `<a:tbl>` tables**
(`src/lib/pptx/tables.ts`; `table()` in `ooxml.ts`). Filename: `Rev# Opp# Customer
Project.pptx`. **P3** (pending): a rendered material-flow *diagram* image, charts, and dynamic
pricing/mix table rows. Contract: `docs/PPTX-TOKEN-CONTRACT.md`.

---

## App-wide help

A single **`?` button** in the persistent header opens a right-side **`HelpDrawer`**
(`src/components/HelpDrawer.tsx`) that explains how to use the tool. It is
context-aware: on every step it defaults to that step's guide, and a left rail
lets the engineer browse an **App Overview** plus every step (0–6). Content lives
as data — `HelpSection[]` in `src/content/help.ts` with `id`, `title`, `summary`,
ordered `howTo`, optional `tips`, and an optional `status: 'coming'` for the
unbuilt Steps 4–6. Closes on outside-click, `Escape`, or the × in the drawer
header.

## Step 2 — Vehicle qualification matrix

Three-column card grid (2 at 1000 px, 1 at 600 px). Each card is one vehicle from
`src/content/vehicles/*.json`. The grid updates live as Step 1 fields change.

### Card visual design

Each card has a **colored border** (1.5 px sides, 4 px top accent) that reflects the
traffic-light status at all times — not just on hover. GREEN cards get the green accent;
YELLOW amber; RED red. Hover adds a subtle glow ring. This replaces the former thin
`veh-status-bar` status strip. `min-height: 720 px`; the image area is `flex-shrink: 0`
so the hero photo holds its 16:9 proportions as the spec list grows.

Traffic-light dots are 14 px with an 8 px glow ring and 700-weight label.

### Card front face

1. **Hero image** (16:9, `flex-shrink: 0`) with TAL-Integrated logo badge or "3rd Party" pill.
2. **Name / manufacturer** + **status indicator** (`TrafficLight`): a flat semantic icon
   (check / alert-triangle / x) + colored label — GREEN Compatible / YELLOW Review Required
   / RED Not Compatible. No glow or dot. The same component renders the comparison modal's
   Status row.
3. **Segmented gate bar**: **every hard gate is always shown** (answered or not) so the
   full set of hard requirements is visible at a glance, plus any soft gate currently in
   play. Color per segment: `pass` (green) · `fail` (red, hard gate) · `soft` (amber, soft
   gate miss) · `skip`/incomplete (dimmed, hard gate not yet answered). Soft gates appear
   only once evaluated (so an unselected Refrigerated/Ramp doesn't clutter the bar). Count
   shows `passed / total shown`. **Hover or focus** reveals a tooltip listing each segment
   with a status dot, name, Pass/Fail/Review/**Not set** badge, and the reason for any
   fail/review — the at-a-glance replacement for the old always-visible verdict line.
5. **Per-load chips** (YELLOW multi-load only): a chip per load showing compatible/not.
6. **Spec rows** (7 rows):
   - *Capacity* — `maxWeightLbs` in the active unit (no headroom ratio annotation).
   - *Lift* — reflects the vehicle's `liftClass`: a **forklift** shows its reach
     (`maxLiftHeightFt`), a **lift table** shows "Matched height", a **floor** vehicle
     shows "Floor-to-floor". See the lift / transfer gate below.
   - *Max Speed* — `speedLoadedFps` in dual-unit format: `ft/s (mph)` imperial /
     `m/s (km/h)` metric. Shown on every vehicle.
   - *Battery* — `ratedAh Ah` (amp-hours only).
   - *Battery Life* — estimated runtime per charge as a range, `8.5–10.7 hrs`.
     `runtime_h = ratedAh × DoD / dischargeA`; low end uses conservative usable
     depth-of-discharge (80%), high end uses full discharge (100%).
   - *Payloads* — `payloadTypes.join(', ')`.
   - *Transfer* — all `transferMethods[].method` joined.

### Gate indicator pills (Step 1)

Every Step 1 field that feeds the vehicle qualification gate engine carries an inline
`<GatePill>` badge immediately after its label text. Hard gates (red, text `"gate"`)
affect GREEN/RED verdicts; the certifications soft gate (amber, text `"soft"`) affects
YELLOW. Aisle width carries no pill — it is explicitly informational-only (ARCHITECTURE.md).

Gate field → pill mapping:
- §01 Load: Max Load Weight → **gate**; Unit/Load Type → **gate**; Load Length / Load Width / Load Height → *no pill* (informational only — dimension gates removed)
- §02 Transfer: Transfer Method, Delivery Pattern, Drop Height → **gate**; Pick Height → *no pill*
- §03 Environment: Min Temperature, Max Temperature → **gate** (hard). The three
  environment toggles are **tri-state** — nothing pre-selected; unset → skipped ("Not set"):
  **Operating Environment** (Indoor / Outdoor) — Indoor → green PASS, Outdoor → hard RED if
  not outdoor-rated; **Temperature Environment** (Ambient / Refrigerated / Freezer) — ONE
  gate, answer-driven severity: Ambient → green PASS, Refrigerated → **soft** (YELLOW),
  Freezer → **hard** (RED); **Ramps on Site?** (No / Yes) — No → green PASS, Yes → **soft**
  YELLOW site review regardless of grade (grade + distance inputs appear only when Yes,
  informational). Min Aisle Width → *no pill* (informational)
- §04 Certifications: Required Certifications → **soft**
7. **"View details →"** flips the card.

### Card back face

The front footer button reads **Full Spec Sheet →** and flips the card to the full
technical spec sheet (`VehicleSpecSheet`) — there is no qualification tab (the front
gate-bar hover tooltip covers qualification at a glance). Header shows the vehicle name
and a ← close button; top-right **Spec sheet ⤓** link downloads the cutsheet PDF. The
sheet renders from the shared `vehicleSpecSections()` (see below).

### Vehicle comparison tool

Comparison is driven entirely from the **filter toolbar** (cards have no compare control).
A right-aligned **Compare vehicles ▾** button opens a dropdown checklist of all vehicles;
the user picks 2–4, then **Compare specs** opens a **side-by-side modal**
(`ComparisonModal`) with vehicles as columns. It shows a **Status** row (traffic light +
label) followed by the **full spec sheet** grouped into the same sections as the back-of-
card sheet (Physical, Load Capacity, Performance, Power & Charging, Environment, Software
& Navigation, Transfer, Compliance, Commercial). **Rows that differ** across the selected
vehicles are emphasized (neutral shade — identical rows are dimmed so the eye lands on the
differences; red is reserved for "Not Compatible"). For rows with a clear better direction,
the winning vehicle's cell is marked with a green **★** ("best in row"): Max payload, Max
lift height, Speed (loaded/unloaded), Max ramp grade (higher = better); Battery life
(`ratedAh/dischargeA`, higher); Charge time, Turning radius, Price midpoint (lower = better).
A winner is only shown when ≥ 2 vehicles have a value and they aren't all equal. Direction
metadata lives on `SpecRow.compare` in `vehicleSpecSections()`. The modal closes on Escape,
the ✕ button, backdrop click, or when the selection drops below 2.

The back-of-card spec sheet and the comparison modal both render from one shared pure
source, **`vehicleSpecSections(vehicle, unitSystem)`** in `src/lib/vehicleDisplay.ts`,
which returns fixed, aligned sections/rows (single-unit formatting) so the two views can
never drift. Card front-face spec strings use the smaller per-field formatters in the same
module. Comparison is informational only — it never selects a vehicle (ARCHITECTURE.md).

### Traffic-light logic

- **GREEN** — all hard gates pass AND all soft preferences pass (or are skipped).
- **YELLOW** — all hard gates pass AND ≥ 1 soft preference fails (or gate skipped, any
  hard gate passes).
- **RED** — ≥ 1 hard gate fails.
- Gates are skipped (not RED) when the corresponding requirement is empty / 0 (the
  app-wide "no requirement" sentinel). Exception: `outdoor` and `freezer` are boolean —
  unchecked = no requirement, always skipped.

### Lift / transfer gate (lift class)

Each vehicle has a `liftClass` (`src/lib/vehicleLibrary.ts`):
- **forklift** — lifts pick→drop to any height up to `maxLiftHeightFt` (stacking). CB18.
- **lift_table** — transfers only at a *matched* height (pick == drop), e.g. a conveyor /
  roller top. E7/Oppent, ML2.
- **floor** — floor-to-floor only; no above-floor transfer. 8HBC, 8TB, M10.

Step 1 captures **Pick Height** and **Drop Height** (ft above floor; both default 0 =
floor-to-floor). The `lift_height` (hard) gate:
- Skips when `max(pick, drop) ≤ 0` (no above-floor transfer requested).
- **forklift**: passes when `maxLiftHeightFt ≥ max(pick, drop)`.
- **lift_table**: passes when `pick == drop` (matched height); fails any elevation change.
- **floor**: fails any above-floor transfer.

Back-compat: when pick/drop are unset, the gate falls back to the legacy single
`maxLiftHeightFt` requirement (treated as a floor→`maxLiftHeightFt` lift). Pick Height
carries no gate pill; **Drop Height** carries the hard `gate` pill.

> **Vehicle data note:** `liftClass` for CB18 (forklift), E7 (lift table), and 8HBC (floor)
> is confirmed by the user; ML2 (lift table), M10 and 8TB (floor) are inferred from category
> and transfer methods — confirm against cutsheets.

---

## Step 2 — Vehicle cutsheet download

Each vehicle JSON declares a `display.cutsheet` path (e.g.
`/cutsheets/cb18.pdf`). The manufacturer PDFs live in
`public/cutsheets/{id}.pdf`; the 8TB50A/8HBC40A brochure is duplicated under
each vehicle id so each card downloads with a sensible filename. When a
`VehicleCard` is flipped to its back face, a small **`Spec sheet ⤓`** link sits
in the **top-right of the back-face title**. Clicking it downloads (or opens in
a new tab) the vehicle's cutsheet; the click calls `stopPropagation()` so it
does not bubble up and flip the card back.
