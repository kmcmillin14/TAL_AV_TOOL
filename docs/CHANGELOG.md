# Changelog

## 2026-06-12 — Step 1 bug fixes: poisoned saves, dead checkboxes, missing Custom days

User-reported during first-use testing of the tiered form:

- **One invalid field no longer kills every save (app-wide data-loss class).**
  `updateProject`/`createProject` validated patches with `partialProjectSchema.parse`,
  which **throws** on any out-of-range value (e.g. `shiftsPerDay: 4`, capped at 3;
  `hoursPerShift` below 4) — and the Step 1 watch-save sends the whole form every
  keystroke with a silent catch, so one bad field anywhere meant *nothing* saved from
  then on ("type in weight and it doesn't stick" to the Step 2 matrix). New
  `salvageParse` falls back to per-key validation and applies the valid fields.
  Regression tests in `src/lib/__tests__/storage.partialSave.test.ts`.
- **Certifications/interlocks checkboxes toggle once per click.** The toggle handler
  lived on the chip `<label>`'s onClick; a label forwards a second click to its inner
  checkbox, so a single user click could fire the toggle twice (on→off — checkbox
  appears dead). The toggle now lives on the input's `onChange` (fires once per
  activation).
- **Custom operating days finally has an input.** Selecting the `Custom` pattern now
  reveals a Mon–Sun day-chip multi-select bound to `operatingDaysCustom` (the schema
  and PDF export supported the field since the beginning, but the form never rendered
  an input for it). Days store in canonical Mon→Sun order.
- **Temp 0 no longer REDs the matrix.** The temp gates evaluated at a requirement of
  0 °F (`present: () => true`), unlike every other numeric gate where 0/empty means
  "no requirement given" — so a stray stored 0 (residue of the poisoned-save bug
  and `parseImperialInput`'s NaN→0 fallback, both also fixed) failed every vehicle on
  Min Temperature. Temps now follow the sentinel convention (`present: r => r !== 0`);
  real freezer requirements are negative °F (plus the freezer flag). The readiness
  meter matches (0 not counted as answered), and `parseImperialInput` now propagates
  NaN (cleared) instead of fabricating 0.

## 2026-06-10 — Step 1 stratified into 3 tiers + qualification-matrix vocabulary fixes

**Step 1 questionnaire** restructured from 13 flat sections into three labeled tiers —
VEHICLE QUALIFICATION (4 sections: load, transfer, environment & site, certifications),
FLEET SIZING & ECONOMICS (3: schedule, throughput, labor), PROPOSAL DETAILS (5,
collapsed: site details, integration incl. WMS, dealer & contact, timeline, notes).
No field deleted; every schema key, storage path, and PDF slot unchanged. SectionNav
gains tier headers and the progress meter is redefined as **qualification readiness**
("N of 11–12 qualification inputs"; lift height counts only when the delivery pattern
requires it; 0 °F counts as answered). Design doc:
`docs/superpowers/specs/2026-06-10-step1-questionnaire-stratification-design.md`.

**Matrix alignment fixes** (audit: Step 1 ↔ vehicle JSON ↔ Step 2 cards):
- `TRANSFER_METHODS` re-valued from `Fork / Tow-Tugger / Conveyor Interface / Lift
  Platform` (matched **zero** vehicles — any selection turned the whole matrix RED) to
  the actual vehicle vocabulary `Lift / Pin / Conveyor / Custom / Powered Conveyor
  Cart`. **Legacy projects holding an old value must re-select Transfer Method.**
- `ml2.json` cert `ANSI/RIA R15.08-1` → canonical `RIA R15.08` (form token); ML2 no
  longer falsely YELLOW when RIA R15.08 is required.
- `CERTIFICATIONS` list moved from `ApplicationForm.tsx` into `constants/enums.ts`.
- New `enumAlignment.test.ts` asserts the three vocabularies stay aligned with the JSONs.
- Step 2 card "Payload Type" row now shows the gate basis `payloadTypes.join(', ')`
  instead of the single `display.typicalLoad`.

## 2026-06-08 — Codebase review cleanup: UX persistence, a11y, dedup

Review-driven fixes (no behavioral spec change; 129 tests pass, tsc clean, lint 21→16 — remainder pre-existing):

- **Unit system & theme now persist across pages/sessions.** New shared `src/lib/uiPrefs.ts`
  (`useUnitSystem`, `useTheme`) backs all five step pages and the header via `localStorage`,
  replacing five per-page `useState('imperial')` copies. Fixes: Imperial/Metric resetting on every
  navigation, and the theme toggle desyncing (icon/logo wrong) because the header remounted to `dark`
  while the document kept the chosen `data-theme`.
- **Undo is meaningful again.** `storage.ts` coalesces rapid Step-1 autosaves (per-keystroke) into a
  single undo snapshot via a 1.5 s window, so Undo reverts a whole edit burst rather than one character.
- **Accessibility (PersistentHeader).** Inline meta editors no longer nest an `<input>` inside a
  `<button>`; the opportunity-number field is now keyboard-activatable (Enter/Space).
- **Dedup.** `deliveryPatternRequiresLift()` exported from `src/calc/trafficLight.ts` and reused by the
  Step-1 form (was duplicated, with a redundant `!== 'Floor-Floor'` clause).
- **Hygiene.** Removed dead `BOTTOM_BOARDS` constant; header prefetch now iterates real steps (was
  prefetching non-existent `/step5`,`/step6`); escaped JSX apostrophes; aligned step0 copy
  ("Flows" → "Fleet Engine"); test fixtures matched to current types; documented `next/image` opt-outs.

## 2026-06-07 — Step 4 ROM Dashboard (1/n): pricing, OPEX/payback, export

### Added
- Step 4 ROM Dashboard: fleet KPIs, ROM CAPEX pricing range, annual OPEX + simple
  payback, and proposal PDF/JSON export — fed by the Fleet Engine total. Economics
  driven by four persisted assumptions (labor rate, energy cost, maintenance %,
  operating days/yr). New pure calc module `src/calc/rom.ts`.

## 2026-06-07 — Fleet Engine pipeline (4/n): directional column slide + build-up bar

iOS motion polish (per frontend-design + ui-ux-pro-max — transform/opacity only, reduced-motion gated):
- **Directional column FLIP.** The Cycle-Time and Vehicle-Count cells carry matching
  `view-transition-name`s across Flows↔Charging, so on Next they **slide left** to their settled
  position (spring ease-out `cubic-bezier(0.32,0.72,0,1)`, 360 ms) while inputs cross-fade out and the
  battery columns cross-fade in. `::view-transition-group(*)` drives the slide.
- **Hero build-up bar.** The build-up line becomes a 4-section bar — `BASE + CHARGING × BUFFER = TOTAL`
  — whose segments scale/fade in as each stage is reached (Total in TAL red). No calc/schema change.

## 2026-06-07 — Fleet Engine pipeline (3/n): buffer stage + per-flow waterfall

The Buffer stage is now a **per-flow pipeline view** (`BufferPipeline`): the project buffer slider up
top, then each flow's vehicle waterfall `base → +charging → ×buffer → fleet (sold)`. Retires the
per-vehicle `FleetTab`. The hero build-up now **accumulates** an adder per stage (base only on Flows;
+charging at Charging; ×buffer at Buffer) with a transform/opacity entrance (reduced-motion gated).
SPECIFICATION updated to the staged pipeline. No calc/schema change; 107 tests pass.

## 2026-06-06 — Fleet Engine pipeline (2/n): stage morph + per-flow charging view

The charging stage is now a **per-flow pipeline view** (`ChargingPipeline`) — the same per-flow rows,
inputs collapsed, each showing its vehicle's battery profile (cycle · vehicles · runtime · recharge ·
availability · +charging) with the recharge-window regime (project) and per-vehicle method editable
inline. Stage changes morph via the **View Transitions API** (`document.startViewTransition` + a
`flushSync` React commit) — a GPU cross-fade, **never animating width** (per ui-ux-pro-max), with an
instant fallback when the API is unavailable or `prefers-reduced-motion`. Replaces/retires the
per-vehicle `ChargingTab`. No calc/schema change; 107 tests pass.

## 2026-06-06 — Fleet Engine → staged pipeline (1/n): stage rail + progressive hero

First increment of the progressive "Pipeline" redesign. The Flows/Charging/Fleet sub-tabs become a
3-**stage** progression — **Flows · Charging · Buffer** — driven by a stage rail (numbered chips +
"Step N of 3" + Back/Next, 44px targets, keyboard-focusable, unvisited dot). The hero summary is now
**progressive**: the headline grows with the stage (base → with-charging → total) and the
`base · +charging · ×buffer` segments brighten as you advance. Content per stage still uses the
existing components; the per-flow **column morph** (View Transitions, transform/opacity per
ui-ux-pro-max) lands in the next increments. No calc/schema change; 107 tests pass.

## 2026-06-04 — Fleet Calc Engine: Flows + Charging + Buffer combined; Ah battery model

Unified the sizing pipeline into one **Fleet Engine** tab (Step 3) with sub-tabs **Flows · Charging ·
Fleet**, sharing a single recompute `flows → base → +charging → ×buffer → TOTAL`. Navigation collapsed
to `0 Start · 1 Application · 2 Vehicles · 3 Fleet Engine · 4 ROM Dashboard`; old step4 (Charging) /
step5 (KPIs) / step6 (ROM) routes removed (ROM → step4, KPIs now belong to the ROM dashboard). This
**supersedes `ARCHITECTURE.md`'s per-step-page rule** for steps 3–4.

- **Battery model → amp-hours / amps.** `VehicleCalc` now `ratedAh` + `voltageV` + `dischargeA` +
  `chargeA` (dropped `batteryKwh` / `energyKwhPerFt` / `chargeKw`). All 6 vehicle JSONs migrated
  (estimates — see provenance). Energy kWh derives as `voltageV × ratedAh / 1000` for display.
- **New pure `src/calc/fleet.ts`**: `chargingForGroup` (runHr = usableAh ÷ dischargeA; plugged
  availability = runHr/(runHr+chargeHr), opportunity = chargeA/(chargeA+dischargeA); Overnight gate
  zeroes the delta when a charge lasts the operating day), `fleetSummary` (waterfall), plus
  `defaultChargeMethod`. New types + `DEFAULT_DOD = 0.80`. Tested in `__tests__/fleet.test.ts`.
- **Settings:** `chargeRegime` (overnight/continuous), `bufferPct` (default 0.10), per-vehicle
  `chargeMethods` (opportunity/plugged). Charging derives no longer depend on Step-3 distances.

## 2026-06-04 — Step 3 per-flow fleet-math derivation panel

- New **Σ "fleet math"** icon in each flow's action cluster (beside duplicate/delete) opens a
  `DerivationPanel` (on the shared `FloatingPanel`) showing the live, value-substituted formulas
  that derive the flow's fleet demand: travel `distance ÷ (speed × pace)` out/back, load/unload from
  the transfer method, lift `height ÷ lift speed`, then **Cycle time** = sum and **Vehicle count** =
  `throughput × cycle ÷ 3600` (emphasized). Each row reads *label · symbolic · substituted → result*.
  Values come straight from the engine's `CycleBreakdown` + flow inputs (live as you edit); imperial
  (one-way leg · seconds). Trigger disabled when the cycle is undefined. New `formula` (Σ) icon; the
  action column widened to fit the third button. Presentational only — no calc/schema change.

## 2026-06-03 — Step 3 group ribbon shows total vehicle demand

- Each group header row now shows its **total vehicle demand** beside the flow count —
  `Σ rawVehicles` over the group's flows (the per-flow Vehicle-Count math, summed; fractional,
  informational). The binding integer fleet still pools per `vehicleId` project-wide (`FleetRibbon`).
- Added a shared **pure** `effectiveGroups(flowGroups, flows)` helper (declared groups first, then
  legacy `sectionName`, deduped) used by both `FlowsTable` and unit-tested. No fleet-sizing or
  schema change.

## 2026-06-03 — Fix partial-update data loss + user-selectable group colors

- **Bug fix (data loss, app-wide).** `updateProject` merged a Zod-validated partial patch with
  `{ ...existing, ...data }`, but Zod v4 `.partial()` does **not** strip `.default()` — so parsing a
  patch like `{ flowGroups: [...] }` re-injected `flows: []` (and `certifications: []`, `interlocks: []`,
  ramp/break/AGV defaults), clobbering existing stored values. Symptoms: adding a Step 3 group wiped all
  flows; adding/editing a flow wiped the groups, so multiple groups could never accumulate. Fix: apply
  only the keys actually present in the caller's `input` (validated values), never Zod-injected defaults.
  Regression tests added in `src/lib/__tests__/storage.flows.test.ts`.
- **User-selectable group colors.** Each Step 3 group header swatch is now a button opening a preset
  palette popover (the existing 6 color-blind-safe brand colors via new `GROUP_PALETTE`; TAL red stays
  reserved). New project field `flowGroupColors: Record<groupName, hex>` (Zod `.default({})`); absent →
  `sectionColor(name)` hash fallback. The override follows a group across inline rename and is removed on
  delete. No fleet-sizing/flow-schema change. Reuses `FloatingPanel`.

## 2026-05-28 — In-app help drawer + per-vehicle spec-sheet download

- **`?` Help drawer.** New `HelpDrawer` (right-side panel + backdrop) opened by a
  `?` button in the persistent header (`hero-actions`). Context-aware (defaults to
  the current step's guide) with a left rail covering App Overview + every step
  (0–6). Content lives as data in `src/content/help.ts` (`HelpSection[]`); Steps 4–6
  are stubbed with planned purpose (`status: 'coming'`). New `help` icon. Closes on
  outside-click / Esc / ×.
- **Spec-sheet download (Step 2).** Each vehicle JSON gains a `display.cutsheet`
  path; manufacturer PDFs added under `public/cutsheets/{id}.pdf` (8TB50A/8HBC40A
  brochure duplicated for both ids). The back-face title of a flipped card shows a
  `Spec sheet ⤓` link in the top-right that downloads the correct PDF; the click
  calls `stopPropagation()` so it does not re-flip the card.
- New optional `cutsheet?: string` on `VehicleDisplay`; no calc/schema changes.

## 2026-05-27 — Performance: kill app-wide lag (storage cache + drop 1 Hz header poll)

Code-review pass on a "page feels laggy/slow" report. Two shared hot paths dominated:

- **`PersistentHeader` polled `canUndo()` every second** on every step — each tick parsed
  all of localStorage and re-rendered the header. Replaced with an event-driven
  subscription (`subscribeProjects`); undo state now refreshes only on real mutations.
- **`storage.ts` re-parsed the whole projects blob on every read and re-serialized it on
  every keystroke** (Step 1 `watch` save + Step 3 `onPatch`). Added an in-memory cache
  (parse once; session source of truth — survives client-side step navigation, so the old
  Step 1 "save-before-nav race" is gone) and **coalesced disk writes** on a 300 ms timer
  with `beforeunload`/`pagehide` flush and cross-tab `storage`-event invalidation. New
  exports: `subscribeProjects`, `flushProjects`.
- Step 3: `projectFlowSummary` was recomputing `groupSummary` per vehicle that the page's
  `groups` memo already produced — totals now reuse `groups`. Drag `dragover` handlers skip
  state updates when the target/position is unchanged.

**Deferred (follow-ups):** `React.memo(FlowRow)` (needs per-flow memoization of
`flowDerived` to be effective, since the derived map rebuilds each keystroke) and shipping
small vehicle-image thumbnails (Step 2 cards + Step 3 dots still decode multi-MB heroes).
No calc/schema change; 91 tests pass.

## 2026-05-27 — Vehicle library corrected from manufacturer cutsheets

All six `src/content/vehicles/*.json` corrected against the cutsheets in `Vehicle Cutsheets/`
(read via pypdf; metric → imperial). Four were mis-categorized: **M10** is a Bastian "Tunnel Type"
tugger (was a Toyota fork truck — manufacturer→Bastian, partnership→TAL Integrated, BlueBotics ANT,
T-Hive on); **E7/Ebase7** is an Oppent "Unit Load" lift-platform AGV (was a tugger — capacity 15,000→2,645 lb,
nav magnetic→natural, ramp 12→3%, temp/dims fixed); **8TB50A** is a Toyota "Automated Tugger" tow tractor
(was a reach truck — no lift, towing capacity 10,000 lb); **8HBC40A** is a Toyota "Automated Pallet Truck"
with a 6-inch lift (was a 25-ft reach truck). Speeds use automated full-load max for both loaded and empty
(M10 was ~2.5× too fast). Names/categories: CB18 AGF, ML2 Mini Load, M10 Tunnel Type, E7 Unit Load,
8TB50A Automated Tugger, 8HBC40A Automated Pallet Truck.

**Accessories (transfer methods)** set per engineer: CB18 = Lift · ML2 = Conveyor/Lift/Pin/Custom ·
M10 = Pin · E7 = Lift/Pin · 8TB50A = Custom/Powered Conveyor Cart · 8HBC40A = Lift. `Lift` flagged
`lifts: true`; handling times are estimates.

Off-sheet fields (price, charge, energy/ft, lift speeds, handling times, some battery kWh) kept as
estimates — flagged in new `docs/VEHICLE-DATA-PROVENANCE.md`. Step 3 verification table refreshed for the
corrected CB18/ML2 speeds (empty now equals loaded); total base fleet stays 13 (CB18 now ~0.1% headroom).

**Step 2 cards:** Oppent (E7), 8TB50A, and 8HBC40A are now `TAL 3rd Party` (was 3rd Party / OEM) so the
**TAL logo** shows alongside their OEM brand; `isTAL()` now treats `TAL 3rd Party` as TAL-badged. Added a
`display.order` field and sort the library by it so cards appear **CB18 · ML2 · E7 · M10 · 8TB50A · 8HBC40A**
(`vehicleLibrary.ts`). The 8TB50A and 8HBC40A hero images were swapped (files renamed: the `.jpg` is the
8TB50A, the `.png` is the 8HBC40A) — they had been showing each other's photo.

## 2026-05-26 — Step 3 round 9: speed tier picker + lift-height popover + summary alignment

- **Route Average Speed → tier picker.** Trigger shows **High / Medium / Low**; a click-through panel explains each tier (`High — Open lanes, few turns · 70%`, etc.). Beneath the trigger the cell now shows both the **Avg** speed and the vehicle's **Max** (rated) speed, loaded/empty, in ft/s or m/s — the real numbers behind the tier. `routeLayout` enum + `ROUTE_LAYOUT_FACTORS` unchanged (presentation only).
- **Lift height → click-to-open popover.** The Transfer Type cell now reads uniformly as `Method +Ns` for every method (like a fixed accessory). For lifting methods the `+Ns` badge opens a small popover to set the height (accent dot hints when height is 0); the always-visible inline height input is gone.
- **Summary TOTAL alignment.** Restructured the fleet-summary rows into a left label + a right-aligned figures group, so the `TOTAL` integer lines up in the same column as the per-vehicle integers above it.
- New shared `FloatingPanel` (anchored, `position: fixed` so it escapes the table cell's `overflow: hidden`; closes on outside-click / Escape / scroll / resize) powers both popovers. Removed orphaned `.flow-method-h*` and `.speeds-used-select` CSS.

## 2026-05-26 — Step 3 round 8: drag-to-reorder + borderless gutters

- **Drag to reorder flows.** A grip handle in the `#` gutter (native HTML5 DnD, no new dependency) drags a flow to a new position; an insertion line shows the landing spot (before/after by cursor half). Dropping onto another group's rows or onto a group header moves the flow into that group — so drag also serves as the regroup gesture (filling the gap left when the per-row group dropdown was removed). New `grip` icon.
- **`#` and action columns are borderless gutters** outside the bordered data grid — no cell borders, no shading. The grid (Vehicle … Vehicle Count) keeps its dividers.
- **Row action buttons fixed.** Delete is now the same SVG `x` icon as duplicate (was a text `×` with a different baseline), both 24×24, borderless, color-only hover. The action `<td>` is a real table cell again with an inner flex wrapper — flexing the `<td>` directly had knocked the icons off their row's centerline.

## 2026-05-25 — Step 3 round 7: grouping rework + transfer-type single-line + unit-aware speed + centered table

Engineer feedback on R6. Same-day follow-up.

- **Grouping reworked from vertical tabs → group header rows.** No grouping UI shows until a group exists (zero groups = plain flat table). `+Group` creates a group with a placeholder name and focuses its header for **inline rename** (text input committed on blur/Enter — the `prompt()` dialogs are gone). Each group is a full-width header row (swatch · inline name · count · its own **`+ Add flow`** button). The rotated vertical tabs and the per-row group dropdown are removed; the `#` cell shows the row number only. Deleting a group ungroups its flows. Pooling is unchanged (per `vehicleId`). `GroupSelect` deleted; new `GroupHeader` component.
- **Transfer Type is now a single constant-height cell.** Trailing `+Ns` badge = load + unload + height-derived lift time. Lifting methods reveal a **compact inline height field** on the same line, so per-height transfers take no more vertical room than fixed ones (replaces the stacked preset dropdown).
- **Copy Flow → per-row duplicate.** The top-right "Copy Flow" is gone; each row has a duplicate control (inserts a copy with a fresh id right after it), so the engineer copies the specific flow they want.
- **Route Average Speed shows ft/s or m/s** per the active unit system (was always `fps`).
- **Table centered** on the page (`margin-inline: auto`).
- Removed orphaned CSS for the old vertical tabs, per-row group select, and bulk/selection/zone styles.

## 2026-05-25 — Step 3 round 6: route-average speed (70% ceiling) + named Groups + table re-band

**Motivation:** Engineer mockup review of R5. Three substantive changes plus a layout pass.

**1. Route-average speed model correction (calc change).** The route-layout factor was being read as an instantaneous speed cap with `high = 0.9`. It is actually a **route average** — a vehicle accelerates, decelerates, and rounds corners, so it never sustains rated cruise end-to-end. **70% is the realistic best-case average ceiling.** Re-valued `ROUTE_LAYOUT_FACTORS` from `{ low: 0.5, medium: 0.7, high: 0.9 }` to **`{ low: 0.3, medium: 0.5, high: 0.7 }`**. The `routeLayout` enum and all of `flowMetrics.ts` are unchanged — only the constants move.
- **This shifts the numbers on existing saved projects** (a `medium` flow drops 70% → 50%, `high` drops 90% → 70%; cycle times rise, fleet counts can rise). Intended correction.
- Verification fixture (all `medium`) moves: CB18 `baseFleet` 7 → **10**, ML2 2 → **3**, total 9 → **13**. Spec verification table + acceptance criteria + Vitest factor cases recomputed to match.
- The `SpeedsUsedSelect` dropdown is re-skinned to **Route Average Speed**: a tiered, highest-first list — `70% · Open, low traffic` / `50% · Mixed traffic` / `30% · Congested, many turns` — still showing the resulting effective fps.

**2. Named Groups (organizational zones).** Adds project-level `flowGroups: string[]` (ordered, Zod `.default([])`). Groups are visual zones (e.g. ASRS, Dock) and do **not** change sizing — fleet still pools per `vehicleId` project-wide. Each flow references a group via the existing `flow.sectionName` (no flow-schema change). New `+Group` button creates an inline-renamable group; rows render contiguously under a colored vertical tab; a per-row dropdown reassigns a flow's group. Deleting a group un-assigns its flows. Legacy projects carrying only `sectionName` still display (effective list = `flowGroups ∪ distinct sectionName`).

**3. Table re-band + formatting.** Three column bands — **Vehicle** / **Route Input** / **Output** (Output visually distinct). Vehicle cell shows the `heroImage` thumbnail (dot fallback). Cycle Time renders as `234s`; Vehicle Count as `2.34 vehicles` (2 dp). Action cluster moved top-right: `+Group` · `+Flow` · `Copy Flow` (Copy duplicates selected rows, or the last flow, with fresh ids). FleetRibbon restructured into a top-left summary box: `CB18: 9.31 → 10 / ML2: 2.68 → 3 / TOTAL: 13` + flows + moves/hour.

**Back-compat:** No flow-schema change. `flowGroups` defaults to `[]` for old exports. `sectionName` semantics preserved.

## 2026-05-24 — Step 3 round 5: canonical column lineup + bulk sections + lift inline time + header polish

**Motivation:** R4 (`93ea057`) landed visual cohesion + named sections (via per-row pill) + FleetRibbon. First-use feedback pushed back on a few things: the table accreted columns engineers don't actually use, the THRU/HR label reads abrasive, the per-row section picker is clumsy, lift height has no visible time consequence, and Imperial/Metric doesn't fit the TAL header aesthetic. R5 rebuilds toward the canonical shape engineers would draw on paper: Vehicle Type · Transfer Method · Origin · Destination · Distance · Throughput per Hour · Speeds Used · Cycle · Demand.

**Changes (incremental rollout across this and following commits):**
- **Delay column gone.** `customDelaySec` removed from Flow, CycleBreakdown, flowSchema, and the calc. Cycle = travel + load + unload + lift. Old exports with `customDelaySec` parse cleanly (Zod strips it).
- **Route Layout pills replaced with Speeds Used.** Same `routeLayout` data field, new dropdown UI labeled by route conditions with the resulting effective fps shown alongside (e.g. `Mixed traffic — 6.9 / 8.1 fps`).
- **Lift inline time.** When the active transfer method lifts, the height input now has a `→ 6.2s` chip next to it showing the derived seconds the lift adds.
- **Canonical column lineup + full-word labels.** "Thru/hr" → "Throughput per Hour"; "Raw veh" → "Demand"; "Vehicle" → "Vehicle Type"; "Method" → "Transfer Method." Zone labels: `Vehicle · Route · Pace · Fleet Need`.
- **Header hierarchy.** Zone band gains accent red color and heavier weight; column labels sit in sentence case + smaller / muted secondary. Distinct visual languages.
- **Sections wholesale redesign.** Per-row SectionPicker pill + popover GONE. In-table section header rows GONE. Replaced by row checkboxes + a contextual `[N selected] [Group as ▾] [Ungroup] [Delete] [Clear]` toolbar that appears when any row is selected. Per-row section badge under the vehicle picker shows the assigned name.
- **Imperial/Metric segmented pill.** PersistentHeader's floating switch becomes a small `[Imperial | Metric]` segmented pill matching the TAL header aesthetic.

**Back-compat:** Zod silently strips legacy `customDelaySec`. `sectionName` (added in R4) is preserved.

## 2026-05-23 — Step 3 round 3: route-layout travel model + UI redesign

**Motivation:** Round 2 (`dd6c299`) added the Method picker, custom delay, and cycle popover. First-use feedback surfaced more problems: the Method + Lift columns felt redundant (the lift value is required for lifting methods but nothing in the UI couples them); engineers don't actually count "90°+ turns"; the travel calc undercounts on short flows because it ignores acceleration; and the round-trip behavior of the cycle is invisible in the UI.

**Decision: replace the turn penalty with a per-flow `routeLayout` factor.** Rather than chase physically-correct acceleration models (more JSON fields per vehicle, more complex calc), use a simple categorical: engineers pick **Low / Medium / High** per flow, which scales the rated cruise speed by 50% / 70% / 90%. Captures real-world variation (busy aisles vs open lanes) with one input instead of two (turns + accel). The Low/Med/High labels are tooltipped with geometry guidance: "lots of turns" → Low, "mostly straightaways" → High.

**Calc changes:**
- Flow loses `turns`; gains `routeLayout: 'low' | 'medium' | 'high'`.
- `CycleBreakdown` loses `turnPenaltySec`; gains `routeLayout` + `routeLayoutFactor` (display-only) for popover attribution.
- Travel time becomes `distanceFt / (vehicle.calc.speedLoadedFps × factor)` (and the symmetric empty version). All other components unchanged.
- New constants: `ROUTE_LAYOUT_FACTORS = { low: 0.5, medium: 0.7, high: 0.9 }`. `TURN_TIME_SEC` removed.
- New helper: `routeLayoutFactor(layout)`.

**Verification table shifts up.** Under the previous model (no derate), the spec's 8-row table produced CB18 baseFleet = 6, ML2 = 2 (total 8). Under the new model with `routeLayout = 'medium'`, CB18 = 7, ML2 = 2 (total 9). One additional CB18. This reflects the prior model's optimism — we'd rather size correctly than ship a number we already know undercounts.

**UI changes (round 3 — incremental rollout across this and following commits):**
- **Transfer Method + Lift merged into one column.** When the chosen method has `lifts: true`, a sub-row reveals a Lift input with a red-tinted left border when value is 0 ("← required"). When the method doesn't lift, the cell is single-line.
- **Route Layout column replaces Turns**, rendered as a three-pill segmented control (Low / Med / High). Header tooltip explains the geometry mapping.
- **Zone column headers** group the 11 columns into four conceptual zones: Vehicle / Route / Profile / Result. Vertical zone dividers reduce visual count from 11 to 4.
- **Inline cycle anatomy bar** — 4-px stacked horizontal bar above each Cycle number shows the component split (travel / transfer / lift / delay) at a glance. Popover stays for exact numbers.
- **Round-trip notation** — Distance header reads `Distance (ft) · one-way` with a tooltip; popover groups Travel loaded + empty under a `Round-trip travel` sub-header.
- **Header tooltips** on Distance, Thru/hr, Route Layout, Delay, and Raw veh explain each column's meaning + assumptions.

**Back-compat:** Old exported projects without `routeLayout` parse cleanly — Zod's `.default('medium')` covers it. Legacy `turns` field is silently dropped. Defensive `?? 'medium'` in `flowDerived` covers runtime gaps in stored data that pre-date this schema.

## 2026-05-23 — Step 3 round 2 revision

**Motivation:** Round 1 ($7dbf478$) replaced the original Step 3 implementation with weight-column removal, leftmost Vehicle column, transfer-method chips, and the Cycle popover. First-use feedback surfaced four problems addressed here: the chip-group picker hides each method's time cost and makes rows reshape; engineers have no way to model ad-hoc time (handoffs, elevator waits, queueing); the per-vehicle summary cards are too big and pop in late once any vehicle is assigned; and the colored dots don't tell engineers which vehicle they're looking at.

**Changes:**
- **Method becomes its own column.** New `MethodSelect` component. Options are scoped to the selected vehicle's `transferMethods` and each option's label shows its time impact (e.g. `Fork (+10s · lifts)`). Single-method vehicles render as static text. The chip group is gone; row heights are stable across vehicles.
- **Per-flow `customDelaySec`.** New `Delay (s)` column. Adds directly to the cycle. Surfaces in the Cycle breakdown popover.
- **Per-accessory popover.** Each load/unload/lift line in the Cycle popover is labeled with the active transfer method's name (e.g. `Fork — load 5.0s`); the lift row shows the engineer-entered `liftHeightFt` in parentheses.
- **Group summary becomes a compact strip.** One ~52 px horizontal row per vehicle group inside a single strip above the table. Placeholder row reserves the footprint when no flows exist, eliminating layout shift.
- **Vehicle thumbnails replace colored dots.** The row's Vehicle cell and the strip's leading segment render `vehicle.display.heroImage` at 16:9 with `loading="lazy"`. Falls back to the colored dot on image error.
- **Fork is now a lifting transfer method on counterbalance forklifts.** `cb18.json` and `8tb50a.json` gain `lifts: true` on their Fork entries — forks physically rise to clear the load, so the lift action consumes `liftHeightFt / liftSpeedFps` like Lift Platform already did.

**Back-compat:** Old exported projects without `customDelaySec` parse cleanly — Zod's `.default(0)` covers it. Same pattern that brought in `liftHeightFt` last revision.

**Follow-up tracked:** Optimized `*-thumb.webp` files for vehicles. Hero PNGs are 200 KB – 1.8 MB; `loading="lazy"` defers off-viewport loads but a future revision should ship dedicated thumbnails.

## 2026-05-23 — Step 3 table revision

**Motivation:** First-use feedback on the Step 3 table. Weight wasn't used in any calc — only by a dropdown disable that duplicates Step 2's qualification. Vehicle belongs on the left (it's the first thing the engineer decides). Vehicles with multiple transfer methods (CB18, 8tb50a) couldn't be modeled correctly because the picker was hidden. Cycle was opaque — a single number with no derivation.

**Changes:**
- Removed `weightLbs` from `Flow`, `flowSchema`, the table column, and the dropdown weight gate. Old exported projects with `weightLbs` still load (Zod strips unknown keys).
- Moved Vehicle to the leftmost editable column.
- Added a per-row transfer-method chip picker (`TransferMethodChips`). Switching vehicles resets `transferMethodIdx` to 0.
- Added a click-to-open Cycle breakdown popover (`CyclePopover`) anchored to the Cycle cell. Shows travel-loaded / travel-empty / load / unload / lift / turns / total.
- Calc layer gained a pure `cycleBreakdown()`; `cycleSeconds()` now delegates to it. Zero behavior change for existing callers.

**Pipeline preview unchanged:** Step 4 adds `chargingDelta`; Step 5 wraps the buffer.

## 2026-05-12 — Remove database, switch to browser-only state

**Motivation:** App is deployed to Vercel where SQLite cannot run (no writable filesystem). Use case is anonymous multi-user enterprise tool with no cross-session persistence requirement — DB is unnecessary.

**Changes:**
- Deleted `prisma/`, `src/generated/prisma/`, `src/lib/db.ts`, `prisma.config.ts`, `dev.db`
- Deleted `app/api/projects/` routes (POST/GET/PATCH for project records)
- Removed deps: `@prisma/client`, `@prisma/adapter-libsql`, `@prisma/adapter-pg`, `@libsql/client`, `pg`, `@types/pg`, `prisma`
- Added `src/lib/storage.ts` — `localStorage`-backed replacement (`listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`, `downloadProject`, `importProjectFromJson`)
- Added Import/Export buttons in `PersistentHeader` (Step 1, Step 2) and on the home page
- Updated consumer files to use storage helpers instead of fetch:
  - `app/page.tsx` (now client component)
  - `app/projects/[id]/step1/page.tsx`
  - `app/projects/[id]/step2/page.tsx`
  - `src/components/PersistentHeader.tsx`
  - `src/components/step1/ApplicationForm.tsx`
- `/api/vehicles` retained — it reads bundled JSON files, works fine on Vercel
- Persistence between sessions/devices is now user-driven: Export → JSON file → re-Import

**User-visible behavior:**
- Projects persist within a single browser as long as `localStorage` is intact
- To share or back up a project, user clicks Export → downloads a `.json` file
- To resume on another device (or after clearing browser data), user clicks Import → picks the `.json` file
- No accounts, no sign-in, no shared server state — every user's data stays in their own browser
