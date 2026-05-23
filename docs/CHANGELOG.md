# Changelog

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
