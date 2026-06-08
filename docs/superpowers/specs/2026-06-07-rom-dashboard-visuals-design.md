# ROM Dashboard — Visual & Sales Layer Design Spec

**Date:** 2026-06-07
**Status:** Approved (design); pending spec review → implementation plan
**Feature:** A stacked sequence of visual sections on the Step 4 ROM Dashboard that tell a sales narrative — map the operation, show what the fleet does, prove the investment/return, and establish trust — for both a customer engineer and the internal Toyota AV apps engineer.

## Summary

Layer **visuals** (charts + diagrams) on top of the numeric ROM Dashboard tiles. The
dashboard reads top-to-bottom as a pitch: **§1** map the operation, **§2** show what the
fleet actually does all day, **§3** the money (ROM + ROI), **§4** trust & robustness. Every
visual is driven **only** by data already collected in Steps 1–3 + the Fleet Engine + the
ROM calc — no new customer inputs.

Runs entirely client-side (no AI, no backend). Charts are **pure SVG** so they add no
dependency and so the same **shaped data** can feed the PptxGenJS native charts in the slide
deck.

## Decisions (locked via brainstorming)

| Decision | Choice |
|---|---|
| Form | **Several stacked visual sections**, not one hero chart |
| §1 | **Flow diagram** (node-link operation map) |
| §2 | AV duty-cycle · Utilization · Charging summary · **Battery charge (SoC profile)** · stat strip |
| §3 | **CAPEX range bars · Payback curve · TCO stacked** · ROI stats |
| §4 | **Requirements-met matrix · Sensitivity/resilience · Assumptions & methodology panel** |
| Chart tech | **Pure SVG** — pure shape function + thin render component; no charting library |
| Library later | Recharts stays a cheap **per-chart** swap (data layer untouched); not now |
| Dropped | Sustainability/CO₂ tile; charging-infrastructure footprint |
| Reserve (not building) | coverage-by-zone, fleet miles/day, labor reallocation, build-up waterfall |

## Non-goals (YAGNI)

- No charting library dependency (pure SVG).
- No CO₂/sustainability tile, no charging-infrastructure footprint, no reserve items above.
- No new persisted inputs — sensitivity scenarios are computed in-memory, not saved.
- No interactivity beyond hover tooltips/labels where trivial; these are presentational, not exploratory charts.

## Architecture

**Core principle — data/render split (the migration-insurance):** every chart is two parts:

1. A **pure shape function** in `src/calc/` (or `src/lib/charts/`) that turns engine data
   into a render-agnostic `series` object. No React, no SVG. Unit-tested.
2. A **thin SVG component** in `src/components/rom/charts/` that renders that `series`.

The `series` type is the contract. Swapping a chart to Recharts later (or feeding PptxGenJS
native charts in the deck) reuses the shape function unchanged — only the render layer
differs. The bespoke visuals (flow diagram, duty-cycle, battery SoC, requirements matrix)
stay SVG regardless.

```
src/calc/romCharts.ts          # PURE shape functions → series objects (unit-tested)
src/calc/romSensitivity.ts     # PURE: recompute fleet/payback under scenarios
src/components/rom/charts/
  FlowDiagram.tsx              # §1 node-link SVG
  DutyCycleChart.tsx           # §2 stacked activity bar
  UtilizationChart.tsx         # §2 demand vs capacity bars
  ChargingSummary.tsx          # §2 energy in/out + run-vs-charge + uptime
  BatterySocChart.tsx          # §2 state-of-charge sawtooth
  CapexRangeBars.tsx           # §3 per-vehicle min–max + total band
  PaybackCurve.tsx             # §3 cumulative cash flow line → break-even
  TcoStacked.tsx               # §3 stacked cost vs cumulative offset
src/components/rom/
  RequirementsMatrix.tsx       # §4 Step 2 gate checklist
  SensitivityPanel.tsx         # §4 what-if + redundancy readout
  AssumptionsPanel.tsx         # §4 methodology list
  RomVisuals.tsx               # composes §1–§4 in order
```

### Series shapes (`romCharts.ts`, illustrative; finalized in plan)

```ts
// §1 Flow diagram
interface FlowDiagramSeries {
  origins: Array<{
    id: string; label: string                      // e.g. "Point A" / origin name
    edges: Array<{ destLabel: string; thruPerHr: number; vehicleName: string; qty: number; vehicleId: string }>
  }>
}
// §2 duty-cycle (fleet-aggregate, throughput-weighted seconds → fractions)
interface DutyCycleSeries { segments: Array<{ key: 'driveLoaded'|'driveEmpty'|'transfer'|'lift'|'charging'|'idle'; label: string; fraction: number }> }
// §2 utilization (per vehicle type)
interface UtilizationSeries { rows: Array<{ vehicleName: string; rawDemand: number; baseFleet: number; fleetSold: number }> }
// §2 charging summary
interface ChargingSeries { rows: Array<{ vehicleName: string; runHr: number|null; chargeHr: number|null; method: 'opportunity'|'plugged'; availability: number|null }> }
// §2 battery SoC profile (per vehicle type, sampled points over effDailyOpHr)
interface BatterySocSeries { rows: Array<{ vehicleName: string; dodFloor: number; points: Array<{ hr: number; soc: number }> }> }
// §3 CAPEX range bars
interface CapexBarsSeries { rows: Array<{ vehicleName: string; qty: number; lineMin: number; lineMax: number }>; totalMin: number; totalMax: number }
// §3 payback curve (cumulative cash flow by year)
interface PaybackSeries { points: Array<{ year: number; cumulative: number }>; breakEvenYear: number | null }
// §3 TCO stacked (cumulative by year)
interface TcoSeries { points: Array<{ year: number; capex: number; cumOpex: number; cumLaborOffset: number; net: number }> }
```

### Sensitivity (`romSensitivity.ts`, pure)

Reuses the existing pure engine (`fleetSummary`, `romSummary`) to recompute under scenarios
without persisting anything:

```ts
interface Scenario { label: string; throughputFactor: number; extraShifts: number }
interface SensitivityRow { label: string; totalFleetSold: number; paybackYears: number | null }
function sensitivity(base: SensitivityInput, scenarios: Scenario[]): SensitivityRow[]
// standard scenarios: baseline, +20% throughput, +1 shift
// resilience: throughput still met with 1 vehicle down → derived from spare-capacity headroom
interface ResilienceResult { throughputHeldWithOneDown: boolean; retainedPct: number }
```

### Data flow

```
step4 page (already holds project, fleet, rom, analytics, vehicleById, flows, derivedByFlowId)
  → romCharts shape functions → series objects
  → romSensitivity(...) → scenario rows + resilience
  → <RomVisuals ... /> renders §1–§4 SVG components
```

No new fetches. The flow diagram uses `flows` (origin/destination/thruPerHr/vehicleId) + the
fleet qty per vehicle. The Requirements matrix uses `qualifyVehicle` (already in `src/calc/`).

## Visual sections (what each proves)

- **§1 Flow diagram** — "we mapped your operation." Per the user's sketch: origin → destinations, `thru/hr` on edges, `Qty · vehicle` at destinations, vehicle thumbnail at origin.
- **§2 Duty-cycle** — what the robots do all day (drive loaded/empty, load/unload, lift, charging, idle), throughput-weighted across the fleet.
- **§2 Utilization** — demand vs provisioned capacity per vehicle type with a right-sized band (not over/under-padded).
- **§2 Charging summary** — energy in/out, run-vs-charge ratio, opportunity/plugged split, uptime/availability.
- **§2 Battery SoC profile** — sawtooth state-of-charge over the operating day: depletes along `dischargeA` to the 80% DOD floor, recharges along `chargeA` over `chargeHr`; proves the battery sustains the duty cycle (and shows overnight-gate vs continuous).
- **§3 CAPEX range bars** — per-vehicle price range + total band; ROM is always a range.
- **§3 Payback curve** — cumulative cash flow over the service life crossing break-even.
- **§3 TCO stacked** — CAPEX + cumulative OPEX vs cumulative labor offset over 7 yr; net turns positive.
- **§4 Requirements-met matrix** — green checklist of all Step 2 hard/soft gates satisfied.
- **§4 Sensitivity/resilience** — fleet & payback at ±throughput / +1 shift; throughput held with one vehicle down.
- **§4 Assumptions panel** — DOD 80%, route-speed factors, buffer %, operating days, labor rate, service life — auditable.

## Error / incomplete handling

- **Empty fleet** → §2–§4 charts render an "assign vehicles to flows to size the fleet" empty state (no fake data, no NaN).
- **Missing per-flow vehicle/cycle** → that edge/segment is omitted, not zero-faked.
- **Missing required throughput** → coverage/sensitivity rows that need it show "—".
- **Missing vehicle image** (flow diagram) → neutral placeholder box.
- **Null charging values** → battery/charging visuals show "—" segments, never NaN.

## Testing

- `romCharts.ts` shape functions → vitest unit tests (series correctness from stub fleet/flows; pure, like the rom tests).
- `romSensitivity.ts` → vitest unit tests (scenario recompute + resilience flag).
- SVG components stay thin (render the series); meaningful coverage lives in the shape/sensitivity tests.
- Gate per repo rules: `npx vitest run` + `npm run build` + purity grep (`romCharts.ts`/`romSensitivity.ts` import no React/localStorage/fs) + Toyota-Type-only CSS + commit/push.

## Dependencies & ordering

Builds on:
- `docs/superpowers/plans/2026-06-07-rom-dashboard.md` (step4 page, `romSummary`, `useFleetData`).
- `docs/superpowers/plans/2026-06-07-rom-dashboard-analytics.md` (`fleetAnalytics`, schedule/assumptions).

Complements the slide-export spec (`2026-06-07-slide-export-design.md`): the same
`romCharts` series feed PptxGenJS native charts in the deck.

No new runtime dependency (pure SVG).

## Open implementation notes (resolved in the plan, not blockers)

- Exact SVG viewBox/scale helpers (shared `src/components/rom/charts/svgScale.ts` for linear scales/axes).
- Duty-cycle segment mapping from `CycleBreakdown` fields + charging fraction.
- Battery SoC sampling resolution (e.g. 0.25 h steps over `effDailyOpHr`).
- Flow diagram layout (vertical stack of origin groups; simple fan-out, no force layout).
