# Step 04 — Interactive Engineering Dashboard Rebuild

**Date:** 2026-06-22
**Status:** Approved (direction). Supersedes the layout/interaction parts of
`2026-06-07-rom-dashboard-visuals-design.md` (that spec's chart *series* and section
*content* still hold; this changes the *shell, interaction, and render layer*).

## Why

Step 04 is data-rich but reads like a report: a long scroll-spy page of static SVG
cards, only `RomEconomics` (2 inputs) writes back, and no chart is linked to another.
Goal: a **modern engineering dashboard** — assumptions in the driver's seat, **what-if
scenarios** with A/B compare, and real chart chrome (tooltips, crosshairs, annotations,
captions). Fleet/ROM math and PPTX/Excel exports stay correct.

## Decisions

- **Scope:** full visual rebuild (new shell, restyled charts).
- **Headline interactivity:** richer chart chrome + scenario A/B compare.
- **Charts:** adopt **Recharts** for the web render (React/SVG, themeable). PPTX/Excel keep
  their own render path; the pure **series builders stay the shared contract**.
- **Layout:** **bento grid + sticky left driver rail** (hero KPI band on top).
- **KPIs:** keep all 6 current KPIs; **add** Annual OPEX, Annual labor offset, Net annual
  benefit, Annual energy (kWh), Avg utilization/headroom, Resilience, TCO @ service life,
  Cost per move — each with a `kpiDetails` popover and a scenario delta.

## Architecture

### Scenario engine — `src/lib/scenario.ts` (pure, built first)
- `ScenarioDrivers` = optional overrides for operators/shift, shifts/day, energy $/kWh,
  labor $, maintenance %, operating days, **buffer %**, service life, numberOfOperators.
- `applyDrivers(project, drivers)` → non-mutating synthetic project (NaN/undefined skipped;
  clears a pinned `numberOfOperators` when operators/shifts change so the derived value
  flows).
- Recompute each side via the existing pure `computeFleetModel` (`src/lib/fleetModel.ts`).
- `scenarioKpis(model)` lifts the comparable scalars; `diffKpis(base, scenario)` gives
  per-KPI deltas (null payback handled). Scenario state is **in-memory** (no new persisted
  fields). Lives in `lib/` not `calc/` because it touches `StoredProject`/`computeFleetModel`
  — but it is pure and unit-tested (`src/lib/__tests__/scenario.test.ts`).

### Render layer
- Series builders in `src/calc/romCharts.ts` unchanged → still feed both web (Recharts) and
  PPTX (its own path). A parity test guards them. `FlowDiagram` and the tables stay bespoke.

### Layout
- `.rom2-*` bento + driver-rail CSS lands alongside the existing `.rom-*` until cutover.

## Build slices
1. **Scenario engine** (`src/lib/scenario.ts` + tests) — *done in the first commit.*
2. Bento shell + `RomDrivers` + Baseline/Scenario switch; KPIs with deltas.
3. Recharts migration of the 6 chart cards + themed tooltip/annotations; assert PPTX parity.
4. Chart chrome + captions + motion; cut over from `.rom-*`; delete dead components.

## Constraints
Calc/lib stay pure; Toyota Type only; color via tokens + `palette.ts`; imperial; no backend;
no required fields; module boundaries (step4 → `src/components/rom/*` + shared). Docs first,
pre-push gate (tsc · check:arch · vitest) each slice.
