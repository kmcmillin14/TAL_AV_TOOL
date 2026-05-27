# TAL Fleet Calculator — Specification

The functional spec ("what the app does"). For architectural rules ("how it's built"), see `ARCHITECTURE.md`. For decision history, see `docs/CHANGELOG.md`.

---

## Step 3 — Material Flows

### Purpose

Step 3 decomposes the facility's material movement into discrete **flows** (origin → destination pairs) and derives, live as the user types, the cycle time and raw fractional vehicle demand per flow, plus per-vehicle aggregate `baseFleet`. Step 3's output is a pure-engineering number with **no safety multipliers**; Step 4 (charging) and Step 5 (buffer) layer on top, each with named scope so the proposal team can defend every multiplier individually.

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

In the current library: CB18 and 8tb50a (counterbalance forklifts) get `liftSpeedFps` and the `lifts: true` flag on **both** their Fork and Lift Platform transfer methods — forks physically rise to clear the load, so the lift action consumes time even when the engineer thinks of it as "just forking." Other vehicles are unchanged.

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

`liftTimeSec` is 0 for non-lifting transfers (Tow/Tugger, Conveyor Interface). For lifting transfers (now including Fork on counterbalance forklifts), the engineer enters the per-cycle total `liftHeightFt`; the vehicle's `liftSpeedFps` does the conversion.

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

### Step 4 preview (not built in this plan)

Adds `chargingDelta` per group, derived from:
- `vehicle.calc.batteryKwh`
- `vehicle.calc.energyKwhPerFt`
- `vehicle.calc.chargeKw` or `chargeTimeMin`
- `vehicle.calc.chargerType` ("opportunity" vs "swap")
- Daily operating hours (from Step 1)

`chargingDelta` is a non-negative integer added to `baseFleet`.

### Step 5 preview (not built in this plan)

```
fleetPerGroup = ceil( (baseFleet + chargingDelta) × (1 + project.bufferPct) )
fleetTotal    = Σ fleetPerGroup
```

`project.bufferPct` defaults to 0.10. Step 5 surfaces it as a project-level slider. It is the **only** multiplier in the entire pipeline; it covers maintenance, training, demand spikes, and anything not modeled by Step 3 (engineering) or Step 4 (physics).

### Hard gates per flow

Step 3 imposes **no** per-flow hard gates. Step 2 already qualifies the vehicle library against the project-wide `maxLoadWeightLbs`; engineers picking a vehicle here have already seen that qualification matrix. Per-flow weight is not collected.

### UI behavior

- Table is fully inline-editable. Every keystroke writes to storage (using the same `watch()` save pattern from Step 1).
- The table is centered on the page (`margin-inline: auto`).
- Columns are organized into three visual bands: **Vehicle** (`# · Vehicle · Transfer Type`), **Route Input** (`Route Average Speed · Origin · Destination · Distance (Round Trip) · Throughput (Moves per Hour)`), and **Output** (`Cycle Time · Vehicle Count`). The Output band is visually distinct.
- The leading **`#`** column and the trailing **action** column are **borderless gutters that sit outside the bordered data grid** — no cell borders, no shading. The grid (Vehicle … Vehicle Count) keeps its dividers; the two flanks read as clean gutters.
- Top-right action cluster: **`+Group`** (creates a new group) and **`+Flow`** (appends an ungrouped row). Each flow row has a trailing **duplicate** and **delete** control (aligned, borderless icon buttons), so the engineer copies the specific flow they want.
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
- A group renders as a full-width **header row** (color swatch · inline-editable name · flow count · its own **`+ Add flow`** button) above its flows. `+ Add flow` drops a new flow straight into that group.
- Flows with no `sectionName` render as plain rows (no header) after the group sections.
- Deleting a group (× on its header) un-assigns its member flows (`sectionName → undefined`); it does not delete the flows.

### Headroom color thresholds (display only)

- ≥ 30 % — green (comfortable)
- 15–30 % — green
- 5–15 % — yellow (tight)
- < 5 %   — red (no margin — likely needs another vehicle or workload re-balance)

### Acceptance criteria

1. Adding the 8 rows from the verification table (with `routeLayout = 'medium'` (factor 0.5), `liftHeightFt = 0`, default transfer method) produces:
   - CB18: `groupRaw ≈ 9.31`, `baseFleet = 10`.
   - ML2:  `groupRaw ≈ 2.68`, `baseFleet = 3`.
2. Editing any flow field instantly re-derives all downstream numbers — no save button, no page reload.
3. Every vehicle is selectable in every row's dropdown. Step 2's traffic-light matrix already qualifies vehicles against project-wide weight.
4. Reloading the page restores all flows and computed values.
5. Calc engine (`src/calc/flowMetrics.ts`) has zero React, fetch, or localStorage imports.
6. All Vitest cases for cycle / raw / group / project pass.
7. A flow with a lifting transfer method and `liftHeightFt = 10` against a vehicle with `liftSpeedFps = 0.5` adds exactly 20 s to its `cycleSeconds` (independent of `routeLayout`, since lift time is not derated).
8. Changing a flow from `routeLayout = 'medium'` to `'high'` (factor 0.5 → 0.7) reduces travel time by ~29% (`(0.7-0.5)/0.7 = 28.6%`).

### Verification table (test data)

Vehicles: **CB18** (Fork, sL = 9.84 fps, sU = 11.5 fps, load+unload = 10s) · **ML2** (Conveyor Interface, sL = 5.9 fps, sU = 6.5 fps, load+unload = 6s). All rows: `routeLayout = 'medium'` (factor 0.5), `liftHeightFt = 0`.

| Row | Vehicle | Distance (ft) | Thru/hr | cycle (s) | rawVehicles |
|-----|---------|-----:|-----:|--------:|-----------:|
| 1   | CB18    |  590 |   45 | 232.53  | 2.907 |
| 2   | CB18    |  394 |   30 | 158.60  | 1.322 |
| 3   | ML2     |  295 |   15 | 196.77  | 0.820 |
| 4   | CB18    |  722 |   38 | 282.31  | 2.980 |
| 5   | CB18    |  476 |   25 | 189.53  | 1.316 |
| 6   | CB18    |  312 |   22 | 127.68  | 0.780 |
| 7   | ML2     |  197 |   28 | 133.40  | 1.038 |
| 8   | ML2     |  246 |   18 | 165.08  | 0.825 |

| Group | groupRaw | baseFleet | headroom |
|-------|---------:|----------:|---------:|
| CB18 (1, 2, 4, 5, 6) | 9.305 | **10** | (10 − 9.305) / 10 ≈ 7.0% |
| ML2  (3, 7, 8)       | 2.683 | **3** | (3 − 2.683) / 3 ≈ 10.6% |

Project totals: `totalFlows = 8`, `totalThru = 221`, `totalRawFleet ≈ 11.99`, `totalBaseFleet = 13`.

Both groups land in the **yellow** headroom band (5–15%) — tight but workable. Compared to the prior model where `medium = 0.7`, dropping the medium route-average factor to `0.5` (R6: 70% is the realistic best-case *average*, not 90%) raises CB18 from 7 → 10 and ML2 from 2 → 3 (total 9 → 13). The calc team's position is that a sustained-cruise assumption materially undercounts on real routes.
