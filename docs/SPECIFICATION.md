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
- `distanceFt` — one-way distance, feet, ≥ 0
- `thruPerHr` — cycles per hour, ≥ 0
- `turns` — number of 90°+ turns per round trip, integer ≥ 0
- `liftHeightFt` — total vertical travel of the load per cycle, feet, ≥ 0. 0 when transfer method does not lift. Engineer enters the per-cycle total (e.g., 4 ft for a single Floor→Height delivery; 8 ft for Height-Height = 4 up + 4 down).
- `vehicleId` — id of a vehicle from `src/content/vehicles/*.json`
- `transferMethodIdx` — index into `vehicle.transferMethods[]`; defaults to 0

### Vehicle JSON additions for Step 3

Vehicles with a lift-capable transfer method gain two fields:

- `calc.liftSpeedFps` — vertical lift speed in feet per second (e.g., 0.5 fps for a standard mast).
- `transferMethods[i].lifts: true` — flag identifying which transfer methods derive their cycle time from height. Vehicles without any lifting transfer method omit both.

In the current library: CB18 ("Lift Platform") and 8tb50a ("Lift Platform") get `liftSpeedFps` and the `lifts: true` flag on the Lift Platform entry. Other vehicles are unchanged.

### Constants

- `TURN_TIME_SEC = 4` — global per-turn penalty.
- `T_hr = 3600` — seconds per hour.
- `DEFAULT_BUFFER_PCT = 0.10` — used in Step 5, declared in `src/calc/types.ts` for cross-step visibility.

### Per-flow derived

```
travelLoadedSec  = distanceFt / vehicle.calc.speedLoadedFps
travelEmptySec   = distanceFt / vehicle.calc.speedUnloadedFps
transfer         = vehicle.transferMethods[transferMethodIdx ?? 0]
loadSec          = transfer.loadTimeSec
unloadSec        = transfer.unloadTimeSec
liftTimeSec      = (transfer.lifts && vehicle.calc.liftSpeedFps > 0)
                   ? liftHeightFt / vehicle.calc.liftSpeedFps
                   : 0
turnPenaltySec   = turns × TURN_TIME_SEC

cycleSeconds     = travelLoadedSec + travelEmptySec
                 + loadSec + unloadSec
                 + liftTimeSec + turnPenaltySec

rawVehicles      = thruPerHr × cycleSeconds / 3600
```

`distanceFt` is one-way; the cycle includes the empty return trip.

`liftTimeSec` is 0 for non-lifting transfers (Fork, Tow/Tugger, Conveyor Interface). For lifting transfers, the engineer enters the per-cycle total `liftHeightFt`; the vehicle's `liftSpeedFps` does the conversion.

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

1. Adding the 8 rows from the verification table (using the spec's cycle values; turns = 0; liftHeightFt = 0) produces:
   - CB18: `groupRaw ≈ 5.58`, `baseFleet = 6`.
   - ML2:  `groupRaw ≈ 1.66`, `baseFleet = 2`.
2. Editing any flow field instantly re-derives all downstream numbers — no save button, no page reload.
3. Every vehicle is selectable in every row's dropdown. Step 2's traffic-light matrix already qualifies vehicles against project-wide weight.
4. Reloading the page restores all flows and computed values.
5. Calc engine (`src/calc/flowMetrics.ts`) has zero React, fetch, or localStorage imports.
6. All Vitest cases for cycle / raw / group / project pass.
7. A flow with a lifting transfer method and `liftHeightFt = 10` against a vehicle with `liftSpeedFps = 0.5` adds exactly 20 s to its `cycleSeconds`.

### Verification table (test data)

| Row | thru | cycle (s) | rawVehicles |
|-----|-----:|----------:|------------:|
| 1   |   45 |  138      | 1.725 |
| 2   |   30 |   98      | 0.817 |
| 3   |   15 |  118      | 0.492 |
| 4   |   38 |  165      | 1.742 |
| 5   |   25 |  115      | 0.799 |
| 6   |   22 |   81      | 0.495 |
| 7   |   28 |   85      | 0.661 |
| 8   |   18 |  101      | 0.505 |

| Group | groupRaw | baseFleet |
|-------|---------:|----------:|
| CB18 (1,2,4,5,6) | 5.578 | 6 |
| ML2  (3,7,8)     | 1.658 | 2 |

Project totals: `totalFlows = 8`, `totalThru = 221`, `totalRawFleet ≈ 7.24`, `totalBaseFleet = 8`.
