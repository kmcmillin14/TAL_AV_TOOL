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
- `routeLayout` — `'low' | 'medium' | 'high'`. Path geometry slows the vehicle relative to its rated cruise speed. Low (50%): lots of turns, tight corners, blind intersections, frequent slowdowns. Medium (70%): mix of straightaways and turns, typical warehouse traffic. High (90%): mostly straightaways, open lanes, few turns. Defaults to `'medium'`.
- `liftHeightFt` — total vertical travel of the load per cycle, feet, ≥ 0. 0 when transfer method does not lift. Engineer enters the per-cycle total (e.g., 4 ft for a single Floor→Height delivery; 8 ft for Height-Height = 4 up + 4 down).
- `vehicleId` — id of a vehicle from `src/content/vehicles/*.json`
- `transferMethodIdx` — index into `vehicle.transferMethods[]`; defaults to 0. Surfaced in the UI as a dedicated **Transfer Method** column whose options are scoped to the selected vehicle.

### Vehicle JSON additions for Step 3

Vehicles with a lift-capable transfer method gain two fields:

- `calc.liftSpeedFps` — vertical lift speed in feet per second (e.g., 0.5 fps for a standard mast).
- `transferMethods[i].lifts: true` — flag identifying which transfer methods derive their cycle time from height. Vehicles without any lifting transfer method omit both.

In the current library: CB18 and 8tb50a (counterbalance forklifts) get `liftSpeedFps` and the `lifts: true` flag on **both** their Fork and Lift Platform transfer methods — forks physically rise to clear the load, so the lift action consumes time even when the engineer thinks of it as "just forking." Other vehicles are unchanged.

### Constants

- `ROUTE_LAYOUT_FACTORS = { low: 0.5, medium: 0.7, high: 0.9 }` — effective-speed multipliers applied to rated cruise.
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
- "Add Flow" appends an empty row.
- Deleting uses the trailing × control.
- Group cards appear in the order vehicles were first assigned.
- Distance shown in m / weight in kg when the unit toggle is metric, ft / lbs in imperial. **Storage always imperial** per ARCHITECTURE.md §3.
- Each vehicle id gets a deterministic display color (hash → palette).
- The LIFT (FT) column is always present; engineer leaves it at 0 for non-lifting flows.

### Headroom color thresholds (display only)

- ≥ 30 % — green (comfortable)
- 15–30 % — green
- 5–15 % — yellow (tight)
- < 5 %   — red (no margin — likely needs another vehicle or workload re-balance)

### Acceptance criteria

1. Adding the 8 rows from the verification table (with `routeLayout = 'medium'` (factor 0.7), `liftHeightFt = 0`, default transfer method) produces:
   - CB18: `groupRaw ≈ 6.77`, `baseFleet = 7`.
   - ML2:  `groupRaw ≈ 1.95`, `baseFleet = 2`.
2. Editing any flow field instantly re-derives all downstream numbers — no save button, no page reload.
3. Every vehicle is selectable in every row's dropdown. Step 2's traffic-light matrix already qualifies vehicles against project-wide weight.
4. Reloading the page restores all flows and computed values.
5. Calc engine (`src/calc/flowMetrics.ts`) has zero React, fetch, or localStorage imports.
6. All Vitest cases for cycle / raw / group / project pass.
7. A flow with a lifting transfer method and `liftHeightFt = 10` against a vehicle with `liftSpeedFps = 0.5` adds exactly 20 s to its `cycleSeconds` (independent of `routeLayout`, since lift time is not derated).
8. Changing a flow from `routeLayout = 'medium'` to `'high'` (factor 0.7 → 0.9) reduces travel time by ~22% (`(0.9-0.7)/0.9 = 22%`).

### Verification table (test data)

Vehicles: **CB18** (Fork, sL = 9.84 fps, sU = 11.5 fps, load+unload = 10s) · **ML2** (Conveyor Interface, sL = 5.9 fps, sU = 6.5 fps, load+unload = 6s). All rows: `routeLayout = 'medium'` (factor 0.7), `liftHeightFt = 0`, `customDelaySec = 0`.

| Row | Vehicle | Distance (ft) | Thru/hr | cycle (s) | rawVehicles |
|-----|---------|-----:|-----:|--------:|-----------:|
| 1   | CB18    |  590 |   45 | 168.95  | 2.112 |
| 2   | CB18    |  394 |   30 | 116.14  | 0.968 |
| 3   | ML2     |  295 |   15 | 142.26  | 0.593 |
| 4   | CB18    |  722 |   38 | 204.51  | 2.159 |
| 5   | CB18    |  476 |   25 | 138.24  | 0.960 |
| 6   | CB18    |  312 |   22 |  94.05  | 0.575 |
| 7   | ML2     |  197 |   28 |  97.00  | 0.754 |
| 8   | ML2     |  246 |   18 | 119.63  | 0.598 |

| Group | groupRaw | baseFleet | headroom |
|-------|---------:|----------:|---------:|
| CB18 (1, 2, 4, 5, 6) | 6.773 | **7** | (7 − 6.773) / 7 ≈ 3.2% |
| ML2  (3, 7, 8)       | 1.945 | **2** | (2 − 1.945) / 2 ≈ 2.7% |

Project totals: `totalFlows = 8`, `totalThru = 221`, `totalRawFleet ≈ 8.72`, `totalBaseFleet = 9`.

Both groups land in the **red** headroom band (< 5%) — engineers reviewing this should consider another vehicle or workload rebalance. Compared to the pre-R3 model (CB18 = 6, ML2 = 2, total = 8), the route-layout factor adds one CB18; this matches the calc team's view that the prior `distance / cruise_speed` model was optimistic.
