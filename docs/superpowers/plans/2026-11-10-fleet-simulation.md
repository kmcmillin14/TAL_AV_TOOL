# Fleet Simulation Implementation Plan

> **For agentic workers:** one task per milestone. Each task is test-first for engine and schema
> work, ends with the gates, `/simplify`, `/code-review`, and a written summary for the owner.
> **Never push** — commit locally per milestone and stop for approval (CLAUDE.md Pre-Push
> Checklist step 8). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add an optional **Simulate** page that runs the engineer-drawn layout, the project's
flows and the library vehicles through time and reports whether the Step 3 fleet holds — per
`docs/superpowers/specs/2026-11-10-fleet-simulation-design-v2.md` (the spec; cited as "spec §n").

**Architecture:** pure TypeScript engine in `src/calc/sim/` (ported from
`docs/superpowers/reference/fleet-simulation-poc/engine.js`), optional schema fields
(`simLayout`, `simSettings`, flow point links, vehicle `calc.sim`), an un-numbered route
`app/projects/[id]/simulate/` with subcomponents in `src/components/simulate/`. Charging,
payload gates and the engine cycle are imported from `src/calc/fleet.ts`, `src/calc/gates.ts`
and `src/calc/flowMetrics.ts`, never re-implemented.

**Tech stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before routing work —
AGENTS.md), React 19, TypeScript strict, Zod 4, Vitest, `pdfjs-dist` (existing), Recharts via
the existing `ChartKit`. No new runtime dependencies without owner approval.

**Binding conventions (every task):**
- Branch `feature/fleet-simulation`; commit per milestone; **never push**.
- Docs first: `docs/SPECIFICATION.md` + `docs/CHANGELOG.md` updated in the same milestone as
  any behaviour or data-model change (the pre-commit hook blocks `src/calc/`, `schemas.ts`,
  `src/content/vehicles/` changes without a CHANGELOG entry).
- Imperial storage; Toyota Type only; design tokens from `app/globals.css` (light + dark).
- Nothing invented: missing data → flagged fallback (spec §2.1, §4.3).
- Gates: `npx tsc --noEmit`, `npx vitest run`, `npm run check:arch`, `npm run build`.
- Workflow skills: the `superpowers:*` skills named in the owner prompt are not installed in this
  environment; the same steps are followed by hand (plan → failing test → code → gates →
  `/simplify` → `/code-review` → summary).
- Bugs/gridlocks: reproduce with a fixed seed first, then fix (systematic debugging).

**Baseline (2026-11-10, `main` 1ce33f7):** `tsc` clean · 545 tests pass (1 skipped) ·
`check:arch` passes. POC on its sample: 48 runs, 0 gridlocks.

---

### Task 0: Docs — spec v2, plan, SPECIFICATION section, CHANGELOG (Milestone 0)

**Files:**
- Create: `docs/superpowers/specs/2026-11-10-fleet-simulation-design-v2.md`
- Create: `docs/superpowers/plans/2026-11-10-fleet-simulation.md` (this file)
- Create: `docs/superpowers/reference/fleet-simulation-poc/{engine.js,sample.js,README.md}`
- Modify: `docs/SPECIFICATION.md` (new "Simulate (optional, after Sizing)" section, marked in
  development), `docs/CHANGELOG.md` (planned-feature entry)

- [x] Read AGENTS.md, CLAUDE.md, ARCHITECTURE.md, SPECIFICATION.md, CHANGELOG.md, the owner
      prompt and the POC.
- [x] Run the POC baseline (acceptance 9 conditions) and record it.
- [x] Audit vehicle JSON against spec §4.2.
- [x] Write spec v2 (v1 never committed — v2 is authoritative), this plan, the SPECIFICATION
      section and the CHANGELOG entry.
- [x] Owner answered the decision questions (spec §12, D-1…D-10).
- [ ] **Stop. Summarize for the owner; wait for plan approval.**

**Owner check (you):**
- [ ] Read spec v2 §12 (decisions) and §10 (acceptance tests 1–40)
- [ ] Skim this page: is anything missing or in the wrong order?
- **Sign-off question:** Approve the plan so Milestone 1 can start?
- **You receive:** This page and the spec on the branch

**Done when:** owner approves the plan.

---

### Task 1: Engine port — `src/calc/sim/` (Milestone 1)

**Files:**
- Create: `src/calc/sim/{types,rng,graph,geometry,kinematics,traffic,battery,engine,results}.ts`
- Create: `src/calc/sim/__tests__/*.test.ts`, `src/calc/sim/__tests__/fixtures/sample.ts`
  (TypeScript copy of the POC `sample.js`)
- Modify: `docs/CHANGELOG.md`

- [ ] **Types first:** `SimLayout`, `SimPoint`, `SimSegment`, `SimFlow`, `SimSettings`,
      `SimVehicleProfile` (resolved from JSON + overrides, each value carrying its source),
      `SimState`, `SimResults`, `Verdict`. Pure data, no classes.
- [ ] **Failing tests**, in this order: acceptance 2, 3 (graph); 5, 4 (conservation,
      determinism); 6 (handling seconds); 7 (single-vehicle cycle vs
      `cycleBreakdown` ±2%); 8 (charging share vs `chargingAvailability` ±3 pts); 9 (head-on
      single-lane → Gridlock; POC sample sweep → 0 gridlocks); 23, 25, 26, 27 (kinematics with
      straight segments and a 90° arc).
- [ ] Port `buildGraph`, Dijkstra + cache (Map keys), zones, spur gates/branches.
- [ ] Port dispatch, zone claiming (nearest-first), handover, following (per-sample direction
      check; centre distance for now — envelopes arrive in Task 4), gridlock detection, zone
      release, handling, battery (via `src/calc/fleet.ts`), results and `VERDICT` constants.
- [ ] Kinematics (§6.4): reference point on the path, heading from tangent, preferred-travel
      flip, approach/reverse/reorient bucket, pace fallback with flags.
- [ ] Geometry module: straight + circular-arc + cubic-Bézier segments with arc length and
      point/tangent at distance (needed by 23 now, by the editor later).
- [ ] Performance check: POC sample, 16 h, one run < 1.5 s in Node; record the figure.
- [ ] Gates; `/simplify`; `/code-review`; CHANGELOG; commit; **owner summary**.

**Owner check (you):**
- [ ] Compare the side-by-side table: proof of concept vs port, on your sample layout, fleets 3–6
- [ ] Confirm zero gridlocks across 48 runs, as in your proof of concept
- [ ] Confirm a single vehicle on one flow matches the Sizing cycle time within 2%
- **Sign-off question:** Does the port behave like your proof of concept — and how should the stub junction rule work (O-11)?
- **You receive:** Results table vs your proof of concept (in the summary), and the hidden-stall finding O-11

**Done when:** acceptance 1–9, 23, 25–27 pass (1 is asserted at the engine level: empty layout →
no results).

---

### Task 2: Schema, vehicle data, storage (Milestone 2)

**Files:**
- Modify: `src/lib/validations/schemas.ts` (`simLayout`, `simSettings`, flow `fromPointId`,
  `toPointId`, `distanceSource`, `hourlyProfile`, `batchSize`, `priority`)
- Modify: `src/lib/vehicleLibrary.ts` (`VehicleCalc.sim?: VehicleSimData`,
  `TransferMethod.orientation?`)
- Modify: `src/content/vehicles/*.json` (add `calc.sim` with all values `null`, `dataNote`,
  `provisional: true`; CB18 `overallLengthFt: 9.63`, `forkLengthFt: 3.5` as the owner's
  engineer assumption D-7 with provenance)
- Modify: `src/lib/storage.ts` (round-trip; no migration needed — all optional)
- Modify: `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`, `docs/VEHICLE-DATA-PROVENANCE.md`

- [ ] Failing tests: acceptance 39 storage half (no image data in `localStorage`); every existing
      sample and fixture project parses unchanged; a project with
      the new fields round-trips through JSON export/import; legacy projects without them load;
      vehicle JSONs with `calc.sim: null` values validate; `enumAlignment` still passes.
- [ ] Add schema fields (all `.optional()`; arrays `.default([])` only where existing patterns
      do the same).
- [ ] Add `VehicleSimData` type and the null-filled `calc.sim` blocks.
- [ ] Gates; `/simplify`; `/code-review`; commit; owner summary.

**Owner check (you):**
- [ ] Open the Company A sample and a Michelin import: everything looks and prices exactly as before
- [ ] Save revision → re-import: the project comes back intact
- [ ] Read the vehicle data notes: nothing has been filled in that you didn't give
- **Sign-off question:** Are existing projects untouched, and are the vehicle placeholders right?
- **You receive:** Before/after confirmation that no quote moved, and the vehicle-file diff

**Done when:** existing projects load unchanged and all tests pass.

---

### Task 3: Route, page shell, Sizing hooks (Milestone 3)

**Files:**
- Read first: `node_modules/next/dist/docs/` (App Router routing, dynamic segments)
- Create: `app/projects/[id]/simulate/page.tsx`, `src/components/simulate/SimulateShell.tsx`
- Modify: Sizing page (Simulate button), `ARCHITECTURE.md` (§3 rule list, §4 table, §5 folder map),
  `scripts/check-architecture*` if the module-boundary check needs the new folder
- Modify: `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`

- Moved (2026-11-10): the Sizing verdict chip → Task 5 (it needs a run); "from layout" distance
  and From/To link suggestions → Task 4 (they need flows linked to points).
- [ ] Page opens in Layout with "Draw the routes to simulate"; Run disabled (acceptance 1, UI).
- [ ] Sizing → Simulate → back preserves state; persistent header unchanged.
- [ ] ARCHITECTURE.md updated; `check:arch` passes with the new folders.
- [ ] Gates incl. `npm run build`; `/simplify`; `/code-review`; commit; owner summary.

**Owner check (you):**
- [ ] On Step 3, click Simulate: the page opens with Run disabled
- [ ] Go back to Sizing: nothing changed; step ribbon still 0–5
- **Sign-off question:** Is the entry point where an engineer would look for it?
- **You receive:** Screenshots, the in-session preview, and the pushed branch

**Done when:** navigation works and the architecture gate passes.

---

### Task 4: Layout editor (Milestone 4)

**Files:**
- Create: `src/components/simulate/layout/*` (canvas, tools, palette, drawing card, scale,
  direction, curves, repeat, objects, flows-from-points, clearance overlay)
- Create: `src/calc/sim/clearance.ts` (+ tests) — swept envelope, tightest clearance, derived
  speed caps, violations
- Modify: `src/design-system/components/Icon.tsx` (11 approved icons), `app/globals.css`
  (role colour tokens light/dark), `src/content/help.ts`
- Modify (from Task 3): Sizing flow rows — a linked flow's distance reads "from layout"
  (read-only there); Link-to-points list with name-match suggestions (spec §5.4)
- From the Task 3 review: the shell becomes head + (canvas | inspector) with the empty state as
  one child of the canvas; the header gets a help-topic prop so Simulate opens its own help
  instead of Sizing's (today it passes `currentStep={3}`); one shared `useProject(id)` hook for
  the load/refresh effect now copied in Simulate, Steps 2–3 and `useFleetData`.
- Modify: `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`

- [ ] Use `/frontend-design` for the editor UI (Toyota Type, tokens, hero pattern).
- [ ] Drawing & scale (PDF page via `pdfjs-dist`, PNG/JPG, blank grid); image in memory,
      embedded in the exported revision, never in `localStorage` (D-4, acceptance 39); unscaled
      drawing blocks Run.
- [ ] Points + icons + roles; Not connected badge (10); routes with snapping; Direction tool and
      indicator (12); flows from points with refusal toast and "from layout" in Sizing (11).
- [ ] Rounded corners from `turningRadiusFt`, bend arcs, Bézier splines (13).
- [ ] Drag-drop from palette; Repeat with one-step undo (14); copy/paste; multi-select.
- [ ] True scale (28); Object tool; B56.5 envelope, caps, violations, callouts, one-click
      single-lane (29–33). Engine following switches to envelope distance (§6.5.5).
- [ ] Gates; `/simplify`; `/code-review`; commit; owner summary.

**Owner check (you):**
- [ ] Draw one of your real sites from a PDF: scale, stands, conveyors, chargers, routes, flows
- [ ] Click or drag a route: the point lands exactly where the + is
- [ ] Close a loop and branch off a route: the ring / diamond shows the join before you click
- [ ] Drag a loose end onto a point: they join
- [ ] Repeat a charger ×6 at 5 ft, then undo once
- [ ] Narrow an aisle and read the B56.5 callouts: 6 in / 0.5 m, shared between vehicles
- [ ] Export the revision, re-import it: the drawing comes back
- [ ] Interim check: Latest: the cursor-accuracy bug is fixed — clicks now land where the + is. Please retry drawing on the Vercel preview.
- **Sign-off question:** Is drawing now smooth enough to draw a real site in about 30 minutes?
- **You receive:** Vercel preview of the branch and the drawing example

**Done when:** acceptance 10–14, 28–33 and 39 pass.

---

### Task 5: Run view (Milestone 5)

**Files:**
- Create: `src/components/simulate/run/*` (verdict rows, map playback, follow card, tables,
  charts), `src/lib/simWorker.ts` (Web Worker wrapper for variability runs)
- Modify (from Task 3): Sizing page head — verdict chip per vehicle type once a run exists (spec §9)
- Modify: `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`

- [ ] Verdict row per type with stepper, Engine sized N (`fleetSummary`), Reset to engine,
      Check variability (10 seeds, random arrivals, "met in k/10") (17).
- [ ] Fixed-step sim + interpolated rendering; ×1/×10/×100; Run shift / 24 h; follow (24).
- [ ] Path to origin/destination (15); flow/point route highlight; all active routes toggle.
- [ ] Tables per vehicle / type / flow / point with CSV copy; totals reconcile (16); charts via
      `ChartKit`.
- [ ] Utilization-based verdict against `targetUtilization` (40).
- [ ] **Use N in pricing** (D-1, raise-only): `simSettings.appliedFleet`, `max(fleetSold, applied)`
      in the shared fleet model so Step 4, Dashboard and deck follow; "simulated (engine N)"
      labels; Back to engine; stale marker (38). Quoted numbers move when used → SPECIFICATION +
      CHANGELOG first, before/after on the Company A sample in the owner summary.
- [ ] Gates; `/simplify`; `/code-review`; commit; owner summary.

**Owner check (you):**
- [ ] Open a new project → Simulate → "Open the example site" → Run
- [ ] Follow cb18-1: the dashed and solid legs lead to its pick and drop
- [ ] Open Vehicles: per-vehicle moves add up to the total; Copy CSV pastes into Excel
- [ ] Run your drawn site: do the verdicts and utilization look believable?
- [ ] Sample layout at 130% demand: step 3 → 4, "Use 4 in pricing", confirm
- [ ] Open Sizing, Step 4, Dashboard and the deck: they show "simulated (engine 3)"
- [ ] Click "Back to engine": every figure returns exactly
- [ ] Interim check: Use N in pricing is built: Company A with CB18 3 → 4 moves the fleet 14 → 15, ROM $1.82M–$3.18M → $1.97M–$3.44M, payback 1.75 → 1.89 yrs. Nothing moves unless an engineer confirms.
- **Sign-off question:** Are the verdicts believable, and is the pricing change shown clearly enough?
- **You receive:** Before/after quote figures on Company A (above) and the confirmation screenshot

**Done when:** acceptance 15–17, 24, 38 and 40 pass.

---

### Task 6: Inspector + Assumptions (Milestone 6)

**Files:**
- Create: `src/components/simulate/inspector/*`, `src/lib/simFields.ts` (single field-definition
  registry: label, unit, source resolver, default, help key — used by inspector, Assumptions view
  and the enumeration test)
- Modify: `src/content/help.ts`, `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`

- [ ] Summary → Settings → Advanced for every object type (spec §8); source chips; per-field and
      per-object reset; override dots and page-head count.
- [ ] Assumptions view = aggregate of the same registry, "Changed only" filter, Run-page chip.
- [ ] Test enumerates every field definition: source chip, reset, help text present (35);
      two-click reachability (34); overrides (36); no modals (37).
- [ ] Gates; `/simplify`; `/code-review`; commit; owner summary.

**Owner check (you):**
- [ ] Click a point, a route, a vehicle in Run: everything you'd change is within two clicks
- [ ] Override a vehicle speed: see the dot, the count in the page head and the Run chip; the verdict re-runs; Engine sized stays the same
- [ ] Open Assumptions, tick Changed only, then Reset all
- [ ] Draw: two-way aisles show both paths; click a route's badge to flip direction; place a stand near an aisle — it connects itself
- [ ] Is the screen still clean, with nothing explained in paragraphs?
- **Sign-off question:** Clean enough, and is anything missing or too much?
- **You receive:** Vercel preview and this list of editable assumptions

**Done when:** acceptance 34–37 pass.

---

### Task 7: Racking and floor lanes (Milestone 7)

**Files:**
- Modify: `src/calc/sim/{graph,traffic,engine}.ts` (+ tests), `src/components/simulate/layout/*`
  (area tools), `docs/SPECIFICATION.md`, `docs/CHANGELOG.md`

- [ ] Rack area generation (bays × levels × depth), aisle as one zone, lift time per level, hard
      height check via the existing lift gate (18), double-deep refusal (19), slot policy +
      initial fill.
- [ ] Floor lanes: drive-in/through, lane depth travel, one vehicle per lane (20); stacking gate.
- [ ] Gates; `/simplify`; `/code-review`; commit; owner summary.

**Owner check (you):**
- [ ] Draw a rack with a level above CB18 reach: those flows turn red with the reason
- [ ] Make it double-deep: refused, "not specified in vehicle data"
- [ ] Watch vehicles queue at the aisle entry
- **Sign-off question:** Do racks and lanes behave the way they do on site?
- **You receive:** Preview link and a rack example

**Done when:** acceptance 18–20 pass.

---

### Task 8: Multi-vehicle (Milestone 8)

**Files:**
- Modify: `src/calc/sim/*` (+ tests), run/inspector components, `docs/SPECIFICATION.md`,
  `docs/CHANGELOG.md`

- [ ] Per-type state, dispatch only to the flow's type, one verdict row per type (21).
- [ ] Compatibility via `src/calc/gates.ts` (lift, transfer vs point type, load size/weight);
      excluded flows red with the gate reason (22).
- [ ] Tuggers as single units, flagged; footprint-shape sprites with category glyphs.
- [ ] Gates; `/simplify`; `/code-review`; commit; owner summary.

**Owner check (you):**
- [ ] Mix CB18, 8HBC40A and M10 on one site
- [ ] Point a floor-only vehicle at a raised stand: excluded, reason shown
- **Sign-off question:** Are mixed fleets and the exclusions right?
- **You receive:** Preview link and a mixed-fleet example

**Done when:** acceptance 21–22 pass.

---

### Task 9: Help, tour, final review (Milestone 9)

**Files:**
- Modify: `src/content/help.ts`, `src/components/GuidedTour.tsx` (a `simulate` guide),
  `docs/SPECIFICATION.md` (section marked shipped), `docs/CHANGELOG.md`

- [ ] Help entries for every inspector field and the page; guided tour steps.
- [ ] Full `/simplify` and `/code-review` over the branch diff; fix findings.
- [ ] All gates green; final summary for approval: behaviour, anything whose output moves
      (none for quotes — the simulation never writes pricing inputs), files touched, known
      issues, open decisions still pending.

**Owner check (you):**
- [ ] Take the tour as a new engineer would
- [ ] Read the final summary: what changed, what moves quotes, what's still open
- **Sign-off question:** Approve pushing the branch and opening a pull request?
- **You receive:** Final summary and the complete test report

**Done when:** all gates are green and the owner approves.
