# Fleet Simulation ("Simulate") — design v2

**Date:** 2026-11-10
**Status:** Design — owner decisions recorded 2026-11-10 (§12); awaiting approval of the plan
(`docs/superpowers/plans/2026-11-10-fleet-simulation.md`) before Milestone 1.
**Branch:** `feature/fleet-simulation` (from `main` 1ce33f7). Never pushed without owner approval.
**Owner:** Kyle (AV Systems Manager, TAL).
**Supersedes:** design v1 (`2026-11-09-fleet-simulation-design.md`). v1 was never committed to
this repository; the owner's 2026-11-10 Claude Code prompt is the source for this v2 and
supersedes v1 wherever they differ. Also supersedes the exploratory `prototype/fleet-sim`
branch (auto-placed stations, toy engine) — this design never invents a layout.
**Reference:** proof of concept in `docs/superpowers/reference/fleet-simulation-poc/`
(`engine.js`, `sample.js`; `app.js`, sprite and icon sheet not yet received).

---

## 1. Purpose

Validate the Fleet Engine's fleet for a project by running **the engineer-drawn layout**, the
project's **flows** and the **vehicles** through time, and answer one question:

> Does the sized fleet hold the throughput on this layout — and if not, where does it break?

**It is:** ROM-level validation of the Step 3 (Sizing) fleet.
**It is not:** a controls / fleet-manager simulator, a layout design tool, or a quote engine.

- It **never changes the sized fleet or the ROM price by itself.** The engineer may apply a
  simulated fleet with an explicit, **raise-only** "Use simulated fleet" action (§9, decision D-1).
- Every number traces to something the engineer drew or entered, a vehicle JSON value, a Step 1
  answer, or a visible, editable assumption with a source chip.

## 2. Rules (in addition to CLAUDE.md and ARCHITECTURE.md)

1. **Nothing is invented.** Routes, points, areas, chargers, parking and objects are drawn or
   placed by the engineer. Vehicle figures come only from `src/content/vehicles/*.json`. Missing
   data is shown as *missing* and the stated fallback is flagged — never estimated silently.
   No automatic layout, no automatic reading of drawings.
2. **No layout → no simulation.** Simulate opens in Layout with "Draw the routes to simulate";
   Run is disabled and no numbers are shown.
3. **One source per fact.** Flows stay one project list (`flows[]`). They can be typed in Sizing
   (quick ROM) or created by connecting points in Simulate. Layout geometry lives only in
   `simLayout`. Charging availability, payload gates and the engine cycle are **imported from
   the existing calc modules**, never re-implemented.
4. **Imperial storage** (ft, lbs, s, °F); metric only at display. **Pure calc:** all simulation
   code in `src/calc/sim/` — no React, `localStorage`, `fetch`, `next`; `npm run check:arch`
   passes.
5. **Simplicity (CLAUDE.md):** two parameters on the Run screen — fleet per vehicle type and
   demand %. Everything else is one click away in the inspector or the Assumptions view.
   Explanations live in `src/content/help.ts` and the guided tour.
6. **Reproducible:** same inputs + same seed → identical results. Playback speed and frame rate
   never change results (fixed sim step; rendering interpolates).
7. **Gridlock is reported, never hidden.** Vehicles never drive through each other.

## 3. Where it lives

- **Route:** `app/projects/[id]/simulate/page.tsx` — an optional page reached from Sizing, not a
  numbered step. The step ribbon stays `0 Start · 1 Intake · 2 Compatibility · 3 Sizing ·
  4 Pricing · 5 Dashboard`; Sizing gains a **Simulate** button and a verdict chip. (Before
  writing the route, read the routing guide in `node_modules/next/dist/docs/` per AGENTS.md.)
- **Code:**
  - `src/calc/sim/` — engine (pure TS): `graph.ts`, `geometry.ts` (arcs, Béziers, arc length,
    swept envelope), `kinematics.ts`, `traffic.ts`, `engine.ts`, `battery.ts` (wraps
    `src/calc/fleet.ts`), `results.ts`, `clearance.ts`, `types.ts`.
  - `src/components/simulate/` — Simulate page subcomponents (layout editor, run view,
    inspector, assumptions). Shares `src/components/mobile/` and design-system components only.
  - `src/content/help.ts` — every inspector field's one-line instruction and ⓘ text.
- **Architecture doc:** ARCHITECTURE.md §3/§4/§5 gain the `simulate/` route, `src/calc/sim/`
  and `src/components/simulate/` (Milestone 3).
- **Mobile:** Simulate is desktop-first. Below 700 px the page shows the verdict rows and
  results tables read-only with "Open on a desktop to edit the layout".

## 4. Data model

All new fields are **optional**; a project or vehicle without them stays valid (partial
projects, ARCHITECTURE.md). Vehicle data stays in JSON.

### 4.1 Existing vehicle fields the simulation uses (no change)

| Field (`calc.*` unless noted) | Used for |
|---|---|
| `widthFt`, `lengthFt`, `heightFt` | footprint, envelope, sprite scale |
| `turningRadiusFt` | rounded corners, swept path |
| `speedLoadedFps`, `speedUnloadedFps` | top travel speed |
| `liftSpeedFps`, `maxLiftHeightFt` | lift time per height; hard check vs rack levels |
| `maxLoadLengthIn`, `maxLoadWidthIn`, `maxLoadHeightIn`, `maxWeightLbs` | payload compatibility (Step 2 gates, reused) |
| `transferMethods[]` (`method`, `loadTimeSec`, `unloadTimeSec`, `lifts`) | pick/drop time; transfer ↔ point-type compatibility |
| `voltageV`, `ratedAh`, `usableCapacityPct`, `avgPowerDrawKw`, `idlePowerDrawW`, `chargerPowerKw`, `minSocPct`, `maxSocPct`, `batterySpecProvisional` | battery and charging (same formulas as `src/calc/fleet.ts`) |
| `display.category` | glyph fallback per vehicle type |

### 4.2 Gaps in existing fields (audited 2026-11-10 against the JSON files)

| Vehicle | Missing (`null`/absent) | Simulation consequence until filled |
|---|---|---|
| `cb18` | none | — |
| `8hbc40a` | `idlePowerDrawW`, `minSocPct`, `maxSocPct`; battery provisional | charging off + "provisional" flag |
| `ebase7` | `maxLiftHeightFt`, `idlePowerDrawW` | idle drain 0 + flag; height check "not specified" |
| `ml2` | `maxLiftHeightFt`, `idlePowerDrawW` | same as `ebase7` |
| `m10` | `liftSpeedFps`, `maxLiftHeightFt`, `maxLoadLengthIn`, `maxLoadWidthIn`, `maxLoadHeightIn`, `idlePowerDrawW`, `minSocPct`, `maxSocPct`; provisional | charging off; lift n/a; flags |
| `8tb50a` | same set as `m10`; provisional | same |

Correction to the prompt's audit: `maxLoadHeightIn` is also missing on `m10` and `8tb50a`.
Ambiguity to resolve (O-6): `ml2` and `ebase7` store `turningRadiusFt: 0` — "turns in place"
or "blank"? The answer decides whether their corners are rounded.

### 4.3 New vehicle block `calc.sim` (`VehicleCalc.sim?: VehicleSimData`)

Every value `null` until sourced; `calc.sim.dataNote` carries provenance (like
`batteryDataNote`) and `calc.sim.provisional: boolean`. `TransferMethod` gains optional
`orientation`.

| Field | Unit / type | Used by | Fallback when null (always flagged) |
|---|---|---|---|
| `overallLengthFt` | ft, incl. forks/attachments | footprint, envelope, sprite | `lengthFt` + "overall length not specified" |
| `forkLengthFt` | ft | payload position on forks | payload centred on footprint |
| `pathRefPointFt` | `{ x, y }` ft from footprint centre, +x = body | the point that stays on the path | `{0,0}` + "reference point not specified" |
| `accelFps2`, `decelFps2` | ft/s² | motion | instant speed changes (pace % fallback) |
| `turnSpeedFps` | ft/s | speed on arcs below the turn threshold | top speed × pace |
| `approachSpeedFps`, `approachDistanceFt` | ft/s, ft | final approach into a position | no approach phase |
| `reverseSpeedFps` | ft/s | travel against the preferred direction | loaded speed × pace |
| `travelDirection` | `'single' \| 'bi'` | direction rules | `'single'` |
| `preferredTravel` | `{ loaded, empty }`: `'forksLeading' \| 'forksTrailing' \| 'any'` | which end leads | `forksTrailing` both |
| `transferMethods[].orientation` | `'rear' \| 'front' \| 'left' \| 'right' \| 'under'` | pick/drop approach | Lift→rear, Conveyor→left, Pin→under |
| `reorientSec` | s | turn-round to match orientation | 0 |
| `doubleDeep` | boolean | rack depth compatibility | **not capable** |
| `availabilityPct` | % | uptime (faults, recovery) | 100% |
| `tugger` | `{ maxCarts, cartLengthFt, couplingSec, trainLengthFt }` | tugger trains (later branch) | single-unit + "tugger train not modelled" |
| `spriteAsset`, `spriteRefPx` | path, `{ x, y }` px | top-down image + reference pixel | footprint shape + category glyph |

CB18 gets `overallLengthFt: 9.63` (6.13 ft body + 42 in standard forks — **engineer assumption,
owner 2026-11-10, confirm against the cutsheet**; `forkLengthFt: 3.5`) and
`spriteAsset: "/vehicles/cb18-top.png"` once the image is supplied. Every other value stays
`null` until the owner provides it (§12).

### 4.4 Existing project data the simulation uses (no change)

| Source | Field | Used for |
|---|---|---|
| Step 1 | `loads[0]` / `loadLengthIn`, `loadWidthIn`, `loadHeightIn`, weight | payload footprint, envelope, compatibility |
| Step 1 | `shiftsPerDay`, `hoursPerShift` | run length, off-shift charging, start SOC |
| Step 3 | `flows[]` (`origin`, `destination`, `distanceFt`, `thruPerHr`, `vehicleId`, `routeLayout`, `transferMethodIdx`, `transferSecOverride`) | orders; engine comparison |
| Fleet Engine | `fleetSold` per vehicle (`fleetSummary`) | default fleet per type ("Engine sized N") |

### 4.5 New project fields (`schemas.ts`; CHANGELOG entry; all optional)

- `flows[]`: `fromPointId?`, `toPointId?`, `distanceSource?: 'layout'`,
  `hourlyProfile?: number[24]`, `batchSize?`, `priority?`.
- `simLayout?` (Milestone 2, `src/lib/validations/simSchemas.ts`): `points[]` (id, x, y in ft, type,
  role, name, heightFt, footprintFt, approachHeadingDeg, handshakeSec — chargers and parking are point
  types, not separate lists), `segments[]` (a, b, dir, lane, speedLimitFps, curve: arc | bezier) and
  `background` (kind, fileName, page, fingerprint, size, two-click scale; the image `data` only in
  export files, D-4). The scale lives in `background.scale`, so there is no separate `ftPerPx`.
  `objects[]` arrive with the layout editor (Milestone 4) and `areas[]` with racking (Milestone 7),
  each with the code that reads them.
- `simSettings?`: `fleet` per vehicleId, `demandPct`, `seed`, `replications`, and `overrides`
  (`appliedFleet` for D-1 arrives with Milestone 5, where it is used)
  (`vehicleId.field → value`, `pointId.field → value`) so every inspector override lives in one
  place (source chip `Override`). Safety rule:
  `clearance: { thresholdFps: 3.94, lowSpeedIn: 6, fullSpeedIn: 19.69, sharedBetweenVehicles: true, edition }` (D-2).
- Existing projects load unchanged; JSON export/import round-trips the new fields; legacy
  imports without them are valid.
- **Background drawing (D-4):** kept in memory while the page is open; **embedded in the exported
  `.json` revision file** (`simLayout.background.data`, base64, the rendered page or image) so a
  colleague who imports the revision gets it. On import it is held in memory only, never in
  `localStorage`; after a reload the engineer re-selects the file (fingerprint check) or
  re-imports the revision. An export without a loaded drawing simply omits `data`.

## 5. Layout mode

### 5.1 Workflow — points first
1. **Drawing & scale** — optional background: a PDF page (existing `pdfjs-dist`) or PNG/JPG;
   otherwise a blank grid in feet. Scale = click two points of a known dimension, type the
   length. Drawing extents are read out. Run is blocked while a loaded drawing is unscaled.
2. **Drop points** — pick a type from the palette, click (or drag) onto the drawing, name it.
   Points may be placed before routes exist.
3. **Connect with routes** — routes snap to points and to existing routes. A point not on a route
   shows **Not connected**.
4. **Create flows** — Flow tool: click a Pick-capable point, then a Drop-capable point →
   popover: moves/h, vehicle. Distance is measured along the routes.
5. **Run.**

Tools: **Points (P) · Routes (R) · Flows (F) · Select (V) · Direction (D)**, Undo/Redo.
Scale is a step inside the Drawing card, not a tool.

### 5.2 Points = equipment + role (approved icon system)
- **Glyph = what it is.** **Role badge + border colour = what happens there.**
- Roles: **Pick** (↑, `#5fa8e0` dark / `#2274A5` light), **Drop** (↓, `#b18cf2` / `#7c3aed`),
  **Pick & drop** (⇅, border split blue/violet). Colours become design tokens in
  `app/globals.css` (light + dark), not literals.
- Flow points: rounded-square marker. Vehicle points (charger, parking): round marker.
  Junctions: small dot.
- Added to `src/design-system/components/Icon.tsx` (24 grid, 2 px stroke, round caps/joins):
  `pick`, `drop`, `pickDrop`, `stand`, `conveyor`, `machine`, `racking`, `lanes`, `dock`,
  `charger`, `parking` — paths exactly as given in the owner prompt §3.2.

| Type | Kind | Simulation behaviour | Height |
|---|---|---|---|
| Stand | point | N positions, one vehicle each | stand height |
| Conveyor | point | transfer point; handshake time (later: accumulation, rate) | conveyor height |
| Line / machine | point | like a stand (later: pull by consumption) | transfer height |
| Racking | **area** | §5.6 | from level config |
| Floor lanes | **area** | §5.6 | floor / stack |
| Dock door | point | (later: batch arrivals, staging) | floor |
| Charger | vehicle point | charging when idle | — |
| Parking | vehicle point | idle without charging; required only if chargers < vehicles | — |

A flow's lift height is **derived from its pick/drop point heights**, never typed. A point's
name suggests a type in the palette; the engineer confirms it.

### 5.3 Path direction
- Each segment: **two-way**, **one-way A→B** or **B→A**; lane: **single-lane (no passing)** or
  **two-lane (passing)**.
- One-way = chevrons along the path; two-way = paired opposing chevrons plus a centre line;
  single-lane two-way = solid centre with a "no passing" tick. Arrow spacing is in screen space
  so it stays legible at every zoom. Legend in the map corner.
- Set in the Select inspector (segmented control) or by clicking a segment in Direction mode.

### 5.4 Flows from points
- Flow tool creates Pick-capable → Drop-capable only; anything else is refused with a toast.
- Shown as thin curved arrows between points, labelled moves/h (toggle "Show flows").
- Same `flows[]` used by Sizing, with `fromPointId`, `toPointId`, `distanceSource: 'layout'`.
- Typed-only flows (from Sizing) appear in a **Link to points** list; a name match is offered as
  a suggestion and linking is one click.
- Sizing shows a linked flow's distance as "from layout", read-only there; moves/h and vehicle
  stay editable in both places.

### 5.5 Curves and splines
- Default: straight segments with **corners rounded automatically** from the vehicle's
  `turningRadiusFt` (drawn as arcs; toggle in Assumptions → Motion).
- **Bend:** drag a segment's midpoint handle → circular arc through the handle.
- **Spline:** "Convert to spline" exposes two cubic-Bézier handles.
- Lengths by exact arc length (arcs) or numerical integration (Béziers); travel follows the
  curve; speed drops to `turnSpeedFps` (or the fallback) where the radius is below the vehicle's
  turn threshold.

### 5.6 Racking and floor lanes (areas)
- **Racking:** drag a rectangle → aisle direction; sides (one/both); bays per side; bay width;
  **depth single/double-deep**; **levels** with uniform pitch or explicit beam heights; first
  beam height. Generates positions per bay × level × depth; the aisle entry connects to the
  nearest drawn route.
  - Lift time per level = height ÷ `liftSpeedFps`.
  - **Hard check:** a level above `maxLiftHeightFt` → flows to it refused (red), consistent with
    ARCHITECTURE §3 lift gate.
  - Double-deep needs `calc.sim.doubleDeep`; absent → "not specified in vehicle data", **not
    capable**.
  - One vehicle per aisle (aisle = zone, like dead-end spurs).
  - Slot policy (Assumptions → Storage): drop to nearest free slot; pick oldest stock (FIFO)
    default, LIFO option; initial fill % (default 50%).
- **Floor lanes:** lane count, lane depth (pallets), stack height, lane width, entry side,
  **drive-in (LIFO) / drive-through (FIFO)**; one vehicle per lane; travel into lane depth
  counts. Stack height > 1 also runs the existing pallet-stacking gate.

### 5.7 Drag-and-drop, repeat, copy
- Drag a point type from the palette onto the canvas (in addition to click-to-place).
- **Repeat…** (or Alt/Option-drag): count + spacing (ft) + direction, or "along this route".
  Sequential names (`Charger 1…6`, `Stand A1…A10`). One undo removes the whole repeat.
- Copy/paste (⌘C/⌘V) of points, routes and areas; marquee and Shift multi-select.

### 5.8 True scale and fixed objects
- **Everything is drawn to true scale in feet:** vehicles from the JSON footprint (overall
  length incl. forks when present), payloads from the Step 1 load size, equipment from the
  footprint entered when placed, racks and lanes from their configuration. Sprites are scaled to
  the footprint; nothing is decorative.
- **Object** tool (Points palette): rectangle or polyline for walls, columns, rack faces, guards,
  building steel. Objects are what clearances are measured to.

### 5.9 ANSI/ITSDF B56.5 clearance path
- **Envelope:** the swept area of the vehicle footprint **or** the payload footprint, whichever is
  wider at each point; loaded and empty envelopes are separate (from the flows that run on each
  segment). Turns use the true swept path from the path reference point, so forks and pallet
  overhang swing out. Clearance is measured **from the widest point**.
- **Rule** (Assumptions → Safety; source chip "Engineer rule — ANSI/ITSDF B56.5", edition
  selectable; owner-specified 2026-11-10, D-2): below **1.2 m/s (3.94 ft/s)** → minimum **6 in**
  per side; at/above → **0.5 m (19.69 in) per side**, measured from the widest point of vehicle
  or payload. **Between two vehicles on a bidirectional (two-lane) segment the middle clearance
  is shared** — one clearance between the two envelopes, not two. Stored imperial:
  `clearance: { thresholdFps: 3.94, lowSpeedIn: 6, fullSpeedIn: 19.69, sharedBetweenVehicles:
  true, edition }`.
- **Effect per segment** (smallest clearance to any object or opposing-lane envelope):
  - ≥ full-speed clearance → full speed.
  - ≥ 6 in and < full-speed → speed **capped below 1.2 m/s**, shown as a slow zone with reason
    "B56.5 reduced clearance".
  - < 6 in → **violation**: red, listed in *Ready to run?*, segment blocked for that vehicle type.
  - Two-lane segment where `clearance + envelope + shared clearance + envelope + clearance`
    doesn't fit → flagged; one click switches it to single-lane.
- **Display** (toggle "B56.5 clearances", Layout and Run): envelope fill, clearance band
  outline, dimension callouts at the tightest point per segment and at every object within
  2 × full-speed clearance. Neutral / amber (capped) / red (violation). In Run, the followed
  vehicle can show its live envelope and band.
- **Vehicle-to-vehicle** following uses envelope-to-envelope distance from the widest points.

## 6. Simulation model (`src/calc/sim/`)

### 6.1 Graph and routing
Nodes = route points, junctions, positions; edges = segments, directed per one-way; edge length =
geometric length of the (possibly curved) segment. Dijkstra with a binary heap and a per-source
tree cache keyed by node id (no numeric key packing). Crossing routes without a shared point make
no junction.

### 6.2 Orders and dispatch
Each flow raises orders at `moves/h × demand%`. Base run: **regular** arrivals. **Check
variability** runs N seeds (default 10) with **random (Poisson)** arrivals → ranges and "met in
k/10". Optional hourly demand profile per flow. Dispatch: oldest order first → nearest idle
eligible vehicle **by path distance**, only vehicles of the flow's `vehicleId`.

### 6.3 Motion
From JSON when present: loaded/empty speed, acceleration, deceleration, turn speed, approach speed
and distance. Missing → **pace %** fallback (Assumptions → Motion, default 70%) with "motion data
missing — using pace %" on results. Per-segment speed limits (slow zones) from Select, plus
derived B56.5 caps.

### 6.4 Kinematics and appearance
- The **reference point** (`pathRefPointFt`) follows the path, including arcs and splines;
  heading = path tangent, flipped per `preferredTravel` / `travelDirection`. The footprint is
  placed from the reference point, so forks swing out on turns.
- Each flow point has an **approach heading** (rotate handle, snaps to 90°, default along its
  route; racks/lanes from aisle/lane direction), shown as a small arrow.
- On arrival the vehicle matches the approach heading per `transferOrientation`: `single`
  vehicles reverse the approach distance at `reverseSpeedFps` (+ `reorientSec` if a turn-round is
  needed); `bi` vehicles drive the other way. That time is its own bucket in the time split.
- **Rendering only:** fixed sim step (0.25 s, as the POC); the view interpolates position and
  heading between the previous and current states every animation frame (shortest-angle heading,
  curves followed not cut). Acceleration visible when present. Lateral offset to the right-hand
  lane only on two-lane segments, eased. Sprites placed from the reference pixel. Debug toggle
  (Assumptions → Display): reference point and tangent per vehicle.

### 6.5 Traffic — keep the POC behaviours (they fixed real gridlocks)
1. Each position, charger and parking spot is a **zone** holding one vehicle.
2. **Dead-end spur rule:** a zone at the end of a spur owns the whole spur; vehicles wait at the
   junction (the gate), not inside. Rack aisles and lanes behave the same.
3. **Nearest claims first:** when a zone frees, the vehicle closest to its claim point gets it.
4. **Handover:** a holder queued behind a vehicle that waits for the holder's zone passes the zone
   forward (merge order at a junction).
5. **Following:** stop for a vehicle within the safety distance ahead, judged per sample point
   using the path direction at that point — opposite-direction vehicles pass on two-lane
   segments, not on single-lane ones. Distance is envelope-to-envelope (§5.9).
6. Mutual block → lower index proceeds. **Gridlock** = a wait-for cycle persisting 30 s, or
   blocked by a parked vehicle for 120 s → run stops, verdict **Gridlock**, location highlighted.

### 6.6 Handling, battery, charging
- Pick/drop = transfer time (vehicle transfer method, or the flow's `transferSecOverride`) +
  lift time to the point's height (split half at pick, half at drop for floor-to-floor) +
  conveyor handshake time (point property).
- Battery strictly from JSON (V, Ah, usable %, draw kW, idle W, charger kW, SOC window), through
  `src/calc/fleet.ts` where a formula exists. Missing → charging off + warning.
- Idle vehicles go to a free charger, else parking. **Charge below** = `minSocPct + 10`;
  **charge until** = charge-below + 30, capped at `maxSocPct` (both editable). Start of shift at
  `maxSocPct` when the schedule has an off-shift window.

### 6.7 Results and verdict
Per vehicle type: moves/h vs target, average order wait, busy %, **vehicle time per move**
(busy vehicle-seconds ÷ moves — directly comparable to the engine cycle), time split
(travel · handle · reverse/approach · wait · charge · idle), SOC, charge trips.
**Verdict — utilization-based (D-9).** No published standard sets an AGV utilization cap: the
VDI 2710 family (Blatt 3, AGV simulation; Blatt 5, acceptance/availability) harmonises inputs and
results but fixes no threshold in the material available, and practice is to pick the smallest
fleet that meets throughput and wait targets with a reserve (typically 70–90% utilization). The
verdict therefore uses the **project's own `targetUtilization`** (Step 3, default 90%) as its one
source, with utilization defined as the Fleet Engine defines it — busy time ÷ time not charging:

| Verdict | Rule |
|---|---|
| **Warming up** | < 30 min simulated |
| **Meets** | ≥ 98% delivered, backlog not growing, utilization ≤ target |
| **Tight** | utilization > target and ≤ 95%, or backlog growing < 1 move/h |
| **Falls short** | < 98% delivered, or backlog growing ≥ 1 move/h, or utilization > 95% |
| **Gridlock** | §6.5.6 |

98%, 95% and the backlog rate are named constants (Assumptions → Run). Utilization is shown
beside every verdict, so the reader sees the number, not only the word. Charging defaults stay
`minSocPct + 10` / `+ 30` (D-9).

## 7. Run mode

- **Verdict row** per vehicle type in the system:
  `[sprite] Name [− n +] ● Verdict  x / y moves/h · s wait · % busy` — "Engine sized N",
  **Reset to engine**, **Check variability**.
- **Map** (2D plan; 3D is a later branch): playback ×1/×10/×100, Run shift, Run 24 h, Restart,
  clock; state colours (travelling / pick-drop / waiting / charging / idle); wait heat halos;
  labels toggle; follow vehicle.
- **Path to origin and destination:** click a vehicle (or Follow) → empty leg to pick (dashed),
  loaded leg to drop (solid), pulsing origin/destination markers; side card with order, ETA,
  state. Clicking a flow arrow or point highlights its route(s). Toggle "Show all active routes".
- **More data (disclosure):** per-vehicle table (moves, loaded/empty distance, utilization split,
  avg wait, battery start/end/min %, kWh used/charged, charge time, charge trips); per type;
  per flow (engine vs sim, vehicle time per move, wait); per point/area (visits, occupied %, max
  queue, avg wait). Charts via the existing `ChartKit`: moves/h vs target, orders waiting, SOC
  over time per vehicle, utilization per hour. Copy/CSV export of every table.
- **Multi-vehicle:** every vehicle JSON is selectable per flow; new JSON files appear
  automatically. One verdict row + stepper per type; dispatch only to the flow's type.
  Compatibility reuses the Step 2 gate logic in `src/calc/` (lift height, transfer method vs
  point type, load size/weight); an incompatible flow is red and excluded with the gate's reason.
  Tuggers (`m10`, `8tb50a`) run as single units with "tugger train not modelled".
- **Controls on screen:** fleet per type and demand %. Everything else in the inspector /
  Assumptions.

## 8. Inspector and Assumptions

- **One inspector panel on the right**, never a modal (except destructive confirmations), same in
  Layout and Run (Run adds live data). Three levels: **Summary** (icon, name, one line, 2–4 key
  numbers, at most one control) → **Settings** (≤ 6 fields, each with a one-line instruction) →
  **Advanced** (every assumption: value, unit, source chip, reset).
- **Every field:** source chip `JSON · Step 1 · Drawn · Default · Override`; per-field reset and
  "Reset all" per object; one-line help from `help.ts` + ⓘ. Overrides show a dot on the field,
  on the map marker, and a count in the page head ("3 overrides"). Labels in plain words.
- Contents per object (point, route segment, rack/lane area, object, flow, vehicle type,
  individual vehicle, charger/parking, empty canvas) as in the owner prompt §5.7a.
- `Esc` closes; arrow keys move between siblings; multi-select edits shared fields.
- **Assumptions view** = the aggregate of all inspector fields, grouped Vehicle · Motion ·
  Traffic · Handling · Charging · Demand · Storage · Safety · Display · Run, filter "Changed only",
  summarized as a one-line chip on the Run page.

## 9. Relationship to Sizing and pricing

- Sizing shows **Simulate** (button) and, once a run exists, a verdict chip per vehicle type.
  Flow rows linked to points show their distance as "from layout".
- **Engine comparison:** the "Engine sized N" figure is `fleetSummary(...).fleetSold` from
  `src/calc/fleet.ts`; per-flow comparison uses `cycleBreakdown` from `src/calc/flowMetrics.ts`.
  The simulation never copies those formulas.
- **Use simulated fleet (D-1), raise-only:** when a vehicle type's simulated fleet (the smallest
  stepper value that *Meets*) is higher than the engine's, the verdict row offers **Use N in
  pricing**. It stores `simSettings.appliedFleet[vehicleId]`; pricing then uses
  `max(fleetSold, appliedFleet)` per type — never lower than the engine. Sizing, Step 4, the
  Dashboard and the deck mark the figure "simulated (engine N)"; **Back to engine** clears it.
  Changing flows, layout or vehicles marks an applied fleet stale until re-run. This **moves
  quoted numbers** when used, so the milestone that builds it carries before/after figures.
- Nothing else is written: not `fleetSold`, not `targetUtilization`, not any other pricing input.

## 10. Acceptance criteria

Numbering follows the owner prompt §7 so tests can cite it.

1. No layout → Run disabled, no numbers shown.
2. A 400 ft straight two-way route between two points measures 400 ft (±0.5); one-way A→B makes
   B→A "No route".
3. Crossing routes without a joined point create no junction.
4. Same project + seed → identical results across runs and playback speeds.
5. Orders conserve every step: generated = delivered + in progress + waiting.
6. Pick/drop seconds equal the transfer + lift + handshake figures from JSON/points.
7. Single vehicle, single uncontended flow, pace fallback = the flow's route factor → vehicle
   time per move ≈ engine cycle (±2%).
8. 24 h, one type with battery data, busy demand → charging share ≈ `1 − dutyRatio` from
   `chargingAvailability` (±3 pts).
9. A constructed single-lane head-on conflict → **Gridlock**, not passing. Sample layout,
   fleets 3–6, seeds 1–6, demand 100/130%, random arrivals, 16 h → no hidden stalls; the only
   gridlocks are the 3 known O-12 cases at 6 vehicles / 130%, reported (the POC froze, unreported, in
   4 of these 48 runs).
10. Points can be placed off-route and show "Not connected"; Run lists them.
11. Flow tool refuses Drop→Pick; created flows appear in Sizing with "from layout" distance.
12. Direction indicator readable at min and max zoom; legend present.
13. A 90° corner with rounding on is shorter than the square corner by `(2 − π/2) × r` (±0.1 ft).
14. Repeat ×6 at 5 ft creates six named, evenly spaced points; one undo removes them.
15. Selecting a vehicle shows its empty and loaded legs to its current pick/drop.
16. Per-vehicle table totals equal the fleet totals.
17. Variability uses random arrivals and reports ranges and "met in k/10".
18. A rack level above `maxLiftHeightFt` blocks flows to it (red, reason shown).
19. Double-deep rack with a vehicle lacking `doubleDeep` → flows refused, "not specified in
    vehicle data".
20. One vehicle per rack aisle / floor lane at a time; others wait at the aisle gate.
21. Mixed fleet: orders dispatched only to the flow's vehicle type; one verdict row per type.
22. Incompatible vehicle/point combinations are excluded with the Step 2 gate reason.
23. Reference point stays within 0.1 ft of the path centreline (straights, arcs, splines) for
    every vehicle type, every step.
24. Rendered motion has no frame jumps: at ×1, per-frame position change ≤ speed × frame time +
    0.1 ft and heading change bounded by curvature; identical results at 30 and 120 fps.
25. At every pick/drop, heading matches the point's approach heading per `transferOrientation`
    (±5°); a mismatch adds the reverse/reorient time.
26. `bi` vehicles never reverse in; `single` vehicles travel with the `preferredTravel` end leading.
27. Vehicles missing any kinematic field run on the stated fallback and show "not specified in
    vehicle data".
28. Drawn footprints equal JSON / Step 1 / point dimensions within 1% at every zoom.
29. Envelope width = max(vehicle width, payload width) for the applicable loaded/empty state,
    including swing-out on curves (checked on a 90° turn against a hand calculation).
30. A segment with 8 in clearance caps speed below 1.2 m/s with reason "B56.5 reduced
    clearance"; with 4 in it is a violation and blocks Run for that vehicle type.
31. Dimension callouts report the tightest clearance per segment within ±0.05 in.
32. A two-lane segment whose envelopes + clearances don't fit is flagged and switches to
    single-lane in one click.
33. Changing clearance values or the speed threshold re-derives every cap and violation at once.
34. Every editable assumption is reachable within two clicks of its object.
35. Every field shows a source chip, has a reset, and has help text from `help.ts` (a test
    enumerates the inspector field definitions).
36. Overrides show a dot on the field, on the map marker and in the page-head count; "Reset all"
    restores sources.
37. No modal dialogs except destructive confirmations; the inspector works identically in Layout
    and Run.

38. **Use N in pricing** appears only when the simulated fleet that Meets exceeds the engine's;
    applying it never lowers any vehicle type below `fleetSold`; Back to engine restores the
    engine figures exactly; pricing, Dashboard and deck show "simulated (engine N)".
39. An exported revision with a loaded drawing contains it; importing that revision shows the
    drawing; `localStorage` never contains image data (asserted in a storage test).
40. The verdict bands follow the project's `targetUtilization` (changing it from 90% to 80%
    re-classifies a run at 85% utilization from Meets to Tight).

Plus the standing gates: `npx tsc --noEmit`, `npx vitest run`, `npm run check:arch`,
`npm run build`; existing tests stay green.

## 11. Porting the proof of concept

**Keep (behaviour-for-behaviour, with tests):** `buildGraph` (zones, dead-end spur gate and
branch), binary-heap Dijkstra with per-source cache, `dispatch` (oldest order → nearest eligible
by path distance), zone claiming in order of distance to the claim point, handover, following per
sample point with direction check, mutual-block tiebreak, gridlock detection (30 s cycle / 120 s
parked), zone release rules, results and `VERDICT` constants, 0.25 s step, seeded RNG (same
mulberry32 generator so seeds stay comparable).

**Change:**
| POC | v2 |
|---|---|
| CB18 hard-coded (`VEH`) | vehicle per flow from the library; per-type state |
| flows matched to locations by **name** | `fromPointId` / `toPointId`; names only suggest links |
| own copy of `chargingAvailability` and the engine cycle | import `src/calc/fleet.ts` and `src/calc/flowMetrics.ts` |
| straight segments only | arcs, Béziers, rounded corners; arc-length travel |
| centre-to-centre gaps (`STOPGAP`, sprite aspect) | envelope-to-envelope from JSON footprint + payload |
| constant pace | JSON kinematics when present, pace fallback flagged |
| charge-at / resume as free settings | `minSocPct + 10` / `+ 30` capped at `maxSocPct`, editable |
| single location kind per point | points with role, positions, height, approach heading; rack/lane areas |
| no clearance | B56.5 envelope, speed caps, violations |

## 12. Decisions (owner, 2026-11-10) and what is still open

| # | Decision |
|---|---|
| D-1 | **Raise-only "Use simulated fleet"** button; pricing uses `max(engine, applied)` per type (§9). |
| D-2 | B56.5: **6 in** per side below 1.2 m/s; **0.5 m (19.69 in)** per side at/above; on bidirectional segments the clearance **between** two vehicles is shared (§5.9). Edition still to cite. |
| D-3 | Pace fallback **70%** until JSON kinematics exist, flagged on results. |
| D-4 | Background drawing **embedded in the exported revision file**, never in `localStorage` (§4.5). |
| D-6 | `turningRadiusFt: 0` on `ml2` / `ebase7` = **turns in place** (no corner rounding). |
| D-7 | CB18 overall length **9.63 ft** (body 6.13 + 42 in forks), engineer assumption to confirm (§4.3). |
| D-9 | Verdict **based on utilization** against the project's `targetUtilization` (§6.7); charging defaults `minSocPct + 10` / `+ 30`. |
| D-10 | Simulate is an **un-numbered page opened from Sizing**; the step ribbon is unchanged. |
| D-12 | **Intersection permission, no pass-through** (owner, 2026-11-10). A junction (3+ routes) holds one vehicle: a vehicle takes it — with any junction less than a vehicle length + 2 ft after it, as one block — before it is within half a vehicle length + 2 ft, or stops there. It never enters a junction while waiting for a zone just beyond, gives back permission it cannot use yet (never one it is already past the stop point of, and never one half of a held block), and is not dispatched while driving across a junction (a parked vehicle stays dispatchable). Permission is decided one step of travel ahead, or the braking distance when the vehicle JSON gives a deceleration. Release once the body has cleared. A stub zone is likewise held until the leaving vehicle's body has cleared the gate. "Nearest claims first" covers junctions. The only remaining mutual-block rule is **two-lane passing**: two vehicles that each have the other on their path ahead on a two-lane route are in opposite lanes, so the lower index proceeds (the POC pair rule; never on single-lane, never for crossing traffic). The three-vehicle "ring" pass-through added under D-11 was removed. |
| D-11 | **Stub junction rule — exiting vehicle first** (owner, 2026-11-10; fixes POC stalls). A spur zone, one-segment stubs included, is held until the leaving vehicle is out of the spur and released at the gate; a vehicle waiting for a zone gives way at the junction to the vehicle holding it (it still blocks when in the holder's lane ahead, same direction — the queue the handover rule serves); plus a **stall check**: no vehicle with work moves or handles for 120 s while orders wait → Gridlock (stall). |

**Still open — fallbacks in use, none blocks Milestone 1:**
- O-2b: which B56.5 edition to cite.
- O-3 / O-5: acceleration, deceleration, turn/approach/reverse speeds, path reference point,
  travel direction, preferred travel, transfer orientation, reorientation time, `doubleDeep`,
  tugger train data — per vehicle (BlueBotics ANT configuration or Bastian engineering).
- O-7b: overall length incl. attachments for the other five vehicles.
- O-8: top-down sprites for the other five vehicles; `cb18-top.png`, `app.js` and the icon sheet.
- **O-12 — segment reservation (open).** Where two stubs sit close together on one aisle (40 ft on the
  POC sample), vehicles waiting for one stub can queue in the short segment between them while each
  stub's leaving vehicle needs that segment. With D-12 this happens in 3 of the 48 acceptance-9
  runs, all at the highest density (6 vehicles, 130%), and is reported as Gridlock (cycle). A fleet
  manager holds such waiters back before entering the short segment (segment reservation). Decide
  **Owner, 2026-11-10: with the layout editor (Milestone 4).** Until then, reported. The same class
  also appears in the charger aisle (junctions every 12–24 ft). Design notes from the `/simplify`
  altitude review, to settle at the same time: zones and junctions are two parallel lock systems —
  a single reservation mechanism (zone = node set, junction = node, segment = node set) would carry
  segment reservation too; the D-11 yield rule may then be redundant; and tying permission to where
  the body physically is would remove the no-dispatch-mid-crossing guard.

## 13. Out of scope (this branch)

3D view (separate branch after racking), DXF import, navigation-map import (e.g. ANT layouts),
production-line pull logic, dock batch logic, tugger trains, deck slide, calibration against
site logs. **No vendor simulation code** — the AND&OR 3D simulation for offer 262963 was reviewed
for ideas only; nothing from it is or may be in this repository.

## 14. Risks

- **Scope.** Nine milestones; the layout editor (M4) and inspector (M6) are the largest. The plan
  keeps each milestone shippable and gated.
- **Port fidelity.** The POC's traffic rules fixed real gridlocks; the port is test-first against
  acceptance 9 and the POC's own sample before any behaviour change (curves, envelopes) is added.
- **Performance.** POC: ~0.65 s per 16 h run in Node. Envelope following and curved geometry cost
  more; variability (10 seeds) runs in a Web Worker so the page stays responsive.
- **Data gaps.** Most kinematic fields are unset today, so early results run on the pace
  fallback; every such result is flagged rather than presented as measured.
