# Changelog

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
