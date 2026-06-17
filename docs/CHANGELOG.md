# Changelog

## 2026-06-17 — Branded ROM PowerPoint export (template-fill) — P0

Replaces the from-scratch `pptxgenjs` deck with a **template-fill** pipeline over the official
35-slide TAL ROM deck (`public/templates/tal-rom-template.pptx`), preserving its theme, masters,
and media. Client-side only (PizZip), editable native output.

- **Section Picker** (`PptxSectionPicker`) opens from the Step 4 export bar and the header menu:
  choose which sections to include; **Product Overviews auto-limited to the fleet chassis**
  (vehicles assigned to flows; Cleanfix never).
- **OOXML slide removal** (`src/lib/pptx/ooxml.ts`): drops unselected slides and prunes
  `presentation.xml` (sldIdLst), `presentation.xml.rels`, and `[Content_Types].xml`; verified by
  a node round-trip test (deck re-parses, counts/control files consistent).
- **P0 fills** the cover (S1) + contact (S34) bracket placeholders from project fields
  (`src/lib/pptx/tokenMap.ts`); unfilled fields keep their editable brackets.
- Removed `src/lib/pptxExport.ts` + the `pptxgenjs` dependency (folder hygiene). Token/slide
  contract in `docs/PPTX-TOKEN-CONTRACT.md`. P1 (KPIs/Investment/ROI tables) + P2 (other step
  slides) to follow.

## 2026-06-14 — Governance consolidation + architecture-invariant pre-commit hook

- **Single source of truth:** moved governance into the in-repo `CLAUDE.md` (was an untracked
  parent-folder copy); reconciled the committed `ARCHITECTURE.md` §3 gate model. Parent-folder
  `CLAUDE.md`/`ARCHITECTURE.md` duplicates removed.
- **`scripts/check-architecture.mjs`** (`npm run check:arch`) enforces ARCHITECTURE.md §6
  invariants: calc-layer purity (no React/fs/next/localStorage in `src/calc/`), step module
  boundaries (no cross-step component imports), Toyota-Type-only fonts, and vehicle data in
  JSON only.
- **Tracked pre-commit hook** (`.githooks/pre-commit`, enable via `git config core.hooksPath
  .githooks`) runs the check and blocks commits that touch the data model / architecture
  without a CHANGELOG entry. `--no-verify` bypasses intentionally.

## 2026-06-14 — Environment fields tri-state + permissive-pass + temperature consolidated

Fixes: Indoor/Ambient/No-ramp appeared pre-selected at start, and a chosen permissive
answer showed "Not set" in the matrix.

- **Tri-state environment fields.** `outdoorRequired` and `rampRequired` are now `.optional()`
  (no `.default(false)`); storage no longer pre-sets them; the form toggles highlight only on
  an explicit value (`=== false`/`=== true`, and `=== opt` for temperature — dropped the
  `?? 'ambient'` fallback). Nothing is pre-selected until the engineer chooses.
- **Permissive answers pass green** (not "Not set"): Operating Environment = Indoor, Ramps =
  No, Temperature = Ambient all evaluate to a green PASS; only an unanswered field skips.
- **Temperature is now ONE gate** (`temperature_env`) with answer-driven severity — Ambient
  green, Refrigerated soft/YELLOW, Freezer hard/RED — replacing the separate `freezer` +
  `refrigerated` gates (kills the duplicate temperature rows). `qualifyVehicle` now groups by
  each gate's **result** severity, not the spec's, so one gate can be hard or soft.
- Removed the orphaned `booleanGate` helper. Verified env fields round-trip through storage.

## 2026-06-14 — Gate bar always shows every hard gate (answered or not)

- The matrix bar now renders **all hard gates** as segments whether or not they've been
  answered — unanswered hard gates show as a dimmed "Not set" segment, so the full set of
  hard requirements is always visible. Soft gates still appear only once they're in play
  (keeps the Refrigerated/Ramp clutter out until selected). Count = `passed / total shown`;
  tooltip badges add a **Not set** state. (Refines the earlier "only applied checks" pass.)

## 2026-06-14 — Gate bar shows only applied checks (no N/A clutter / repeats)

- The gate-bar segments and hover tooltip now render **only evaluated gates** — skipped
  no-constraint gates are omitted instead of shown as "N/A". This removes the apparent
  "repeats" (the Freezer + Refrigerated rows both showed N/A under Ambient) and the
  confusing "N/A when answered" for permissive answers (Ambient / Indoor / No ramps /
  Floor-Floor). Count and bar stay in sync with the tooltip.
- (No code change for the "Outdoor PASS" report — the API already serves CB18
  `outdoorCapable=false`; that was a stale in-memory vehicle cache from before the JSON
  edit, cleared by a full page reload.)

## 2026-06-14 — Step 3 & 4 layout: summary aligned with content, nav raised

- The top summary bar (Step 3 Total Fleet card / Step 4 ROM KPIs) now lives **inside the
  content column**, aligned with the first section (Raw Fleet / ROM), instead of spanning
  full width above the two-column layout. The sticky side nav (Fleet Build-Up / ROM Proposal)
  now starts at the top, level with the summary, and both stick at the same offset (126px).
- Removed the hero-height `ResizeObserver` / `--engine-hero-h` plumbing on Step 3 — the nav
  no longer needs to offset below a full-width hero. Step 4 `form-with-nav` gains the
  `engine-layout` class so its nav uses the same 126px sticky offset.

## 2026-06-14 — Ramp is a Yes/No review · vehicle outdoor/freezer data

- **Ramp is now a Yes/No question** (`rampRequired`). "Yes" auto-flags a YELLOW review on
  every vehicle (the gate never auto-passes); grade + distance inputs appear only when Yes.
  Gate keys off the boolean (falls back to legacy `maxRampGrade > 0`). Gate renamed "Ramp".
- **Vehicle data:** set CB18 `outdoorCapable` → false. Per spec, no current vehicle is
  outdoor- or freezer-capable, so Outdoor → all RED, Freezer → all RED, Refrigerated → all
  YELLOW until a capable vehicle is added.

## 2026-06-14 — Environment gates: temperature tiers, ramp auto-yellow, outdoor relabel

- **Temperature Environment (Ambient / Refrigerated / Freezer)** replaces the Freezer Yes/No.
  Ambient → no gate; **Refrigerated** → soft (YELLOW) on non-freezer-rated vehicles;
  **Freezer** → hard (RED). Split into two gates (`freezer` hard, `refrigerated` soft) so the
  severity is static per gate. New `temperatureEnvironment` field; legacy `freezerCapable`
  boolean still maps (true ⇒ freezer) for back-compat.
- **Ramp grade auto-yellows.** Any ramp on site (grade > 0) is now a YELLOW review for every
  vehicle regardless of its rated grade — gradeability needs a site check (the gate no longer
  auto-passes on a comparison).
- **Outdoor → Operating Environment (Indoor / Outdoor)** choice; gate unchanged (Outdoor =
  hard RED if not rated, Indoor skips).
- **Card "Lift" row shows the class name** — `Forklift · 14.7 ft`, `Lift table`,
  `Floor-to-floor`.

## 2026-06-13 — Lift modeled by class + pick/drop heights (elevation-change gate)

Replaces the single "max lift height" number with a vertical-transfer model that
distinguishes forklift / lift table / floor-to-floor.

- **`liftClass` on every vehicle** (`forklift | lift_table | floor`): CB18 forklift; E7 &
  ML2 lift table; 8HBC, 8TB, M10 floor. (ML2/M10/8TB inferred — flagged in SPEC for cutsheet
  confirmation.)
- **Step 1 captures Pick Height + Drop Height** (ft above floor; both default 0 = floor-to-
  floor). Replaces the conditional "Max Lift Height" input. Drop Height carries the hard
  gate pill; Pick Height none.
- **Lift / Transfer gate** qualifies by elevation change: skips when no above-floor transfer;
  forklift passes if reach ≥ the higher height; lift table passes only if pick == drop
  (matched height); floor fails any above-floor transfer. Legacy `maxLiftHeightFt` is kept as
  a fallback when pick/drop are unset (and for import round-trips).
- **Card "Lift" row** + spec-sheet "Lift type" row show the class. Exports (PDF/XLSX/PPTX)
  now report pick/drop heights.
- Readiness meter no longer counts a lift input (always 11 qualification inputs).

## 2026-06-13 — Ramp grade is now a soft (YELLOW) gate

- **Ramp grade gate changed from hard (RED) to soft (YELLOW).** A vehicle that can't handle
  the required grade is now a "Review" (YELLOW), not "Not Compatible" (RED) — gradeability is
  rarely an absolute blocker. `numericGate` gained an optional `severity` (defaults hard);
  ramp passes `'soft'`. Step 1 "Max Ramp Grade" pill is now amber `soft`. Outdoor/Freezer
  stay hard (RED) and default to not-required (skipped until set).

## 2026-06-13 — Comparison modal UX: neutral diff + best-value markers

- **Differences no longer highlighted in red.** Red means "Not Compatible" elsewhere, so
  tinting differing cells red was misleading. Now identical rows are dimmed and differing
  rows get a neutral emphasis — the eye lands on what actually distinguishes the vehicles.
- **Best-in-row marker (green ★).** For specs with a clear better direction, the winning
  vehicle's cell is marked: Max payload / Max lift / Speed / Max ramp grade (higher),
  Battery life (`ratedAh/dischargeA`, higher), Charge time / Turning radius / Price midpoint
  (lower). Only shown when ≥ 2 vehicles have a value and they differ.
- Direction metadata added as optional `SpecRow.compare` in `vehicleSpecSections()` (shared
  source; back-of-card spec sheet ignores it).

## 2026-06-13 — New 8tb tugger render

- Replaced the 8tb50a image with a new tugger render. The supplied export was partially
  de-backgrounded (leftover low-alpha haze in some corners), cleaned with a Pillow alpha
  threshold (`alpha < 130` → transparent) and auto-cropped to the alpha bbox for even
  scaling, consistent with the other vehicles.

## 2026-06-13 — Vehicle images: transparent backgrounds + even scaling

- **Removed baked-in white backgrounds** from `m10.png` and `8tb50a` (was a JPEG → now
  `8tb50a.png`, JSON updated, old `.jpg` deleted). Background flood-filled to transparent
  so both sit on the dark image tile like the other four vehicles.
- **Auto-cropped all six vehicle PNGs to their content** (alpha bounding box + small uniform
  margin) so each vehicle fills its frame. With the existing `object-fit: contain` + flex
  centering, every vehicle now scales to a consistent size and is centered (no more "some
  look bigger" from uneven built-in whitespace).

## 2026-06-13 — /simplify cleanup pass (behavior-neutral refactor)

DRY / dead-code cleanup, no behavior change (160/160 tests green, tsc clean):
- **Unit conversions consolidated onto `src/lib/utils/units.ts`.** Removed duplicated
  conversion constants/factors: `vehicleDisplay.ts` now routes all lbs→kg / ft→m / in→mm /
  °F→°C / fps→m/s through `units.*.toMetric`; deleted the private `FT_PER_M`/`M_PER_FT`
  constants in `step3/FlowRow.tsx`, `step3/MethodSelect.tsx`, `step3/SpeedsUsedSelect.tsx`
  in favor of `units.distance.toMetric/toImperial`.
- **Battery DoD constant deduped.** `vehicleDisplay.batteryLifeDisplay` now imports
  `DEFAULT_DOD` from `src/calc/types` instead of a local `USABLE_DOD = 0.8` shadow copy.
- **Unexported internal-only helpers** in `vehicleDisplay.ts` (`canLift`, `liftDisplay`,
  `rampDisplay`) — they had no external importers.

Reviewed-and-skipped (would change behavior or wrong altitude): RomEconomics `fmtCurrency`
(full `$65,000` is intended for the rate input; shared `usd` abbreviates to `$65K`);
moving `isTAL` into `vehicleLibrary` (that module imports `fs` — would pull server code into
the client bundle); converting `PersistentHeader` theme to CSS (it owns the toggle, so its
own state stays in sync — no desync); React `useMemo`/`useCallback` micro-opts on Step 2
(child isn't memoized, n=6 vehicles — no real benefit).

## 2026-06-13 — Fix card logo theme desync (CSS) · visible dark-mode hover

- **Card TAL badge now swaps via CSS** keyed off `html[data-theme]` instead of a per-card
  `useTheme()` state. The hook holds independent state per component, so toggling theme in
  the header left the card's logo stale (black logo shown in dark mode). Rendering both
  logos and toggling with `[data-theme]` selectors keeps it always in sync.
- **Card hover is now visible in dark mode**: a dark drop-shadow alone was invisible on the
  dark background. Hover now brightens the border and lifts the card (`translateY(-2px)`),
  which reads in both themes.

## 2026-06-13 — Status indicator restyle · spec-sheet/close overlap · theme-aware card logo

- **Status indicator** is now a flat semantic icon + colored label (check / alert-triangle
  / x) instead of a glowing dot — applied on cards and reused in the comparison modal's
  Status row. Removed the `.tl-dot` glow and `.cmp-status` styles.
- **Fixed spec-sheet/close overlap** on the card back: the "Spec sheet ⤓" download was
  absolutely positioned and sat on top of the ← close button; both now live in an in-flow
  title-bar actions cluster.
- **Theme-aware card TAL badge**: light mode uses `TAL-Logo-Black.png`, dark mode
  `TAL-Logo-White.png` (matches the header). White-on-light was invisible before.

## 2026-06-13 — Back face = full specs only · comparison modal = full specs

- **Back of card is now the full spec sheet only.** Removed the Qualification tab and tab
  switcher (the front gate-bar hover tooltip already covers qualification). Deleted the
  orphaned `WhyBreakdown` component and its CSS, plus orphaned `.veh-back-tab*` CSS.
- **Front footer button renamed** "View details →" → "Full Spec Sheet →".
- **Comparison modal now shows the full spec sheet**, not just the card specs — grouped
  into the same sections as the back-of-card sheet, vehicles as columns, differing cells
  highlighted.
- **Shared `vehicleSpecSections()`** in `vehicleDisplay.ts` is the single source for the
  full sheet; both `VehicleSpecSheet` and `ComparisonModal` render from it (no drift).

## 2026-06-13 — Leaner card: Ah-only battery · drop verdict line · gate-bar hover tooltip

- **Battery row shows amp-hours only** (`533 Ah`) — dropped the kWh figure (cards + modal).
- **Removed the always-visible verdict line** ("Rated only to 95°F…") — it took too much
  vertical room on every card.
- **Gate bar now has a hover/focus tooltip** showing the full breakdown at a glance: each
  gate with a status dot, name, Pass/Fail/Review badge, and the reason for any fail/review.
  Segments thicken on hover to signal interactivity. Replaces the verdict line's role.
- Removed orphaned `.veh-verdict` and `.spec-headroom` CSS (folder hygiene).

## 2026-06-13 — Compare selection moved fully into toolbar dropdown

- **Removed the per-card Compare checkbox.** Vehicle selection for comparison now happens
  entirely in the toolbar: a **Compare vehicles ▾** button opens a dropdown checklist
  (2–4 vehicles, Clear + Compare specs in the footer). Cards are unchanged by compare state.

## 2026-06-13 — Compare controls moved to toolbar · Battery Life replaces Charge row

- **Compare controls relocated** from a floating bottom bar into the filter toolbar
  (right-aligned): selection count + Clear + Compare specs. Removed `.cmp-bar`.
- **Battery Life row replaces Charge** on cards and in the comparison modal. Shows an
  estimated runtime range per charge (`8.5–10.7 hrs`): `ratedAh × DoD / dischargeA`,
  low end at 80% usable depth-of-discharge, high end at full discharge. Added
  `batteryLifeDisplay`, removed the now-orphaned `chargeDisplay` helper (folder hygiene).

## 2026-06-13 — Step 2 vehicle comparison tool

- **Compare checkbox** on each card image (top-left). Select 2–4 vehicles to reveal a
  floating **compare bar** (Clear · Compare specs).
- **`ComparisonModal`** — side-by-side spec table (vehicles as columns; Status, Capacity,
  Max Lift, Max Ramp Grade, Max Speed, Battery, Charge Time, Payloads, Transfer as rows).
  Differing cells are highlighted. Closes on Escape / ✕ / backdrop / selection < 2.
- **`src/lib/vehicleDisplay.ts`** — extracted the card's inline spec formatters into shared
  pure functions so card and modal render identical strings; `VehicleCard` now imports them.
- Comparison is informational only — never selects a vehicle (ARCHITECTURE.md).

## 2026-06-13 — Card front-in-flow height fix · remove spec-row gap

- **Flip-card height fix.** Front face now sits in normal flow (drives card height); only
  the back face is absolutely positioned. Removes the brittle fixed `min-height` that was
  clipping the Transfer row and "View details" footer.
- **Removed large gap** below spec rows: dropped `margin-top:auto` on `.veh-foot` and the
  front `min-height`, added `align-items:start` to the grid so cards hug their content.

## 2026-06-13 — Remove load dimension gates · fix card content clipping

- **Load dimension gates removed.** `load_length`, `load_width`, and `load_height` hard
  gates have been removed from the gate engine. Physical deck dimensions are no longer
  evaluated — the engineer handles physical fit assessment. Related `GatePill` labels on
  Load Length / Load Width / Load Height in Step 1 removed.
- **Vehicle card min-height increased to 800px** so all 7 spec rows and the "View
  details →" footer are always visible without clipping.

## 2026-06-13 — Vehicle card visual overhaul: colored borders, larger traffic lights, image fix

- **Always-visible status border.** Removed the thin `veh-status-bar` strip. Cards now
  have a colored 1.5 px border (4 px top accent) in green / yellow / red at all times —
  not just on hover. Hover adds a subtle glow ring.
- **Image no longer compressed.** Added `flex-shrink: 0` to `.veh-img-area` so the hero
  photo stays at its natural 16:9 height even when the spec list grows.
- **Traffic light dots enlarged.** `.tl-dot` 10 px → 14 px; glow radius increased from
  4 px to 8 px; label weight 600 → 700.
- **Headroom ratio removed from Capacity row.** The `× 1.8× your load` annotation has
  been removed — was clutter when no weight had been entered yet.
- **Card `min-height` increased** from 600 px to 720 px to accommodate seven spec rows
  without the image compressing.

## 2026-06-13 — Gate indicator pills · vehicle card battery/charge/ramp rows · speed units

- **Gate indicator pills on Step 1 field labels.** Every field that feeds the gate engine
  now carries an inline `gate` pill (hard gates, TAL red) or `soft` pill (certifications,
  amber). The pill is a sharp 2 px-radius rectangle with `8px / 0.13em` Toyota Type,
  current-color border, and a background tint — sits at label baseline without disrupting
  form density. Aisle width (informational only) explicitly has no pill.
- **Vehicle cards — new spec rows:** Battery (`kWh · Ah` e.g. `25.6 kWh · 533 Ah`),
  Charge (`chargeTimeMin min (opp|swap)`). Speed units changed to dual-unit:
  `ft/s (mph)` imperial / `m/s (km/h)` metric.
- **Non-lift vehicle row.** Row 2 (formerly always "Max Lift") is now contextual:
  lift-capable vehicles (CB18, 8HBC40A) show Max Lift; non-lift vehicles show **Max Ramp**
  (`vehicle.specs.maxRampGrade %`) — a hard gate value that meaningfully differentiates
  the floor-only fleet (3 %–5 % spread across the library).

## 2026-06-13 — Step 2 card redesign · ROI card rewrite · no-lift vehicle gate + card fix

- **Step 2 vehicle cards redesigned.** Each card front now leads with a **verdict
  line** (one sentence: first failing gate reason, or "Meets all N requirements") and a
  **segmented gate bar** (one colored segment per gate: green pass / red hard-fail /
  amber soft-miss / dimmed skip + N/M count). Spec rows trimmed to four: Capacity
  (with headroom ratio), Max Lift (or Max Speed for non-lift vehicles), Payloads,
  Transfer. OEM / Integration / Fleet Software rows removed.
- **ROI card (`RomEconomics`) rewritten with local state.** The previous controlled
  component depended on the parent `costs` memo and a legacy `numberOfOperators`
  override field that was being pinned to 0 by a Zod `.default(0)` — causing the labor
  offset to always show $0. The new card owns `operatorsPerShift` and
  `fullyBurdenedRateUsdPerYear` as local `useState`; computation runs inline from local
  values, so the display updates on every keystroke regardless of the storage/render
  cycle. `useEffect` re-syncs when external project changes arrive. The schema field
  `numberOfOperators` is now `.optional()` (no default) and the ROI card clears it on
  edit so the derived product is always authoritative.
- **Burdened-cost input displays as currency.** The `type="text"` input shows `$65,000`
  at rest (via `Intl.NumberFormat`) and reverts to the raw number on focus for editing.
- **No-lift vehicles in the lift gate.** When `vehicle.calc.maxLiftHeightFt === null`
  (e.g. 8TB50A Automated Tugger) and a lift height is required, the `lift_height` gate
  now returns `passed: false, reason: "No lift capability — floor-level transport only"`
  instead of the misleading "Lifts to 0 ft". In the skipped path (lift not required),
  `vehicleValue` renders as "No lift" not "0 ft". The card spec row swaps "Max Lift"
  for "Max Speed" (`speedLoadedFps` → mph / km/h) for no-lift vehicles.

## 2026-06-12 — ROM dashboard scrolling layout · simple ROI · header KPI band removed

- **Step 4 matches the questionnaire/Fleet-Engine pattern**: the four view tabs
  (Overview/Cost/Operations/Methodology) become always-visible numbered sections on
  one scrolling page with a sticky scroll-spy rail (payback figure in the rail's top
  slot). Shared `ScrollSpyNav`/`ScrollSection` components extracted (Step 3's
  engine-local versions deleted); the segmented `es-tab` pill CSS is now fully
  orphaned and removed.
- **Simple ROI**: payback = total system cost ÷ (operators displaced × fully-burdened
  cost). OPEX is informational only (no netting); payback chart rises by the offset.
- **Header KPI band deleted** (Total Fleet/CAPEX/Utilization/Schedule placeholders) —
  the header is logo/meta/nav only. On Step 3 the engine hero (total vehicles) is
  now sticky below the header, with the side rail sticking beneath it.
- **Charging section**: shift coverage (shifts × hours) is inline-editable, writing
  the same Step 1 fields.
- **Export to PowerPoint + Excel.** Header menu gains `Export deck (.pptx)` (4-slide
  dark TAL proposal: title, requirements, fleet build-up, ROM/payback) and
  `Export workbook (.xlsx)` (Summary/Requirements/Flows/Fleet/ROM sheets). Both
  client-side (pptxgenjs / SheetJS, dynamically imported) over the new shared
  `computeFleetModel` (`src/lib/fleetModel.ts`), which mirrors `useFleetData`'s
  derivation chain (covered by `fleetModel.test.ts`).


## 2026-06-12 — Fleet Engine: staged wizard → scrolling page; buffer presets

- **All three sub-stages are now always visible** — `01 Raw Fleet · 02 Charging ·
  03 Buffer` render as stacked sections on one scrolling page with a sticky
  questionnaire-style scroll-spy nav (new `EngineNav`/`EngineSection` in
  `src/components/engine/`, reusing the `.section-nav`/`.form-section` styles). The
  stage rail, Back/Next, "Step N of 3", unvisited dots, and the View Transitions
  stage morphing are removed (orphaned CSS + `viewTransitionName` props deleted —
  duplicate names on simultaneously-visible rows would be invalid anyway). Hero now
  always shows the bound TOTAL with every build-up segment lit.
- **Buffer % is a preset dropdown** — `Standard (10%) · Medium (20%) ·
  Conservative (25%) · Custom…` (Custom reveals a % input; legacy non-preset values
  display as Custom). Replaces the free slider; `bufferPct` schema unchanged.

## 2026-06-12 — Multiple loads (matrix-only) + Step 1 multi-flow capture + porting defaults

- **Step 1 captures multiple flows.** Section 06 (Throughput & distance) is now a
  flow-row list (Origin · Destination · Distance one-way · Moves/hr) editing the SAME
  `flows[]` array Step 3 uses — Step 1 ↔ Step 3 porting is live in both directions.
  No vehicle column (hard rule: vehicles assigned only by the engineer in Step 3).
  The old single `requiredThroughputPerHour`/`avgDistanceFt`/`distanceType` inputs and
  Step 3's "seed from Step 1" button are retired (legacy fields stay schema-only;
  legacy projects synthesize one prefilled row).
- **Multiple load types, for the vehicle matrix only.** New `loads: LoadSpec[]` (≤4):
  per-load unit type, dims, optional weight. The 5 load-coupled hard gates run per
  load; rollup GREEN = all loads pass, YELLOW = some (named), RED = none. Flows/Step 3
  carry no load info. `loads[0]` mirrors to legacy singular fields; `effectiveLoads`
  synthesizes from legacy on read. Single-load results identical to before.
- **Porting defaults (never locks):** ROM `operatingDaysPerYear` now defaults from the
  operating-days pattern (Mon–Fri 260 · Mon–Sat 312 · Mon–Sun 364 · Custom n×52) via
  `defaultOperatingDaysPerYear`; `chargeRegime` becomes optional in the schema and
  defaults to `continuous` when the schedule covers 24 h/day (else `overnight`) —
  explicit choices always win.

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
