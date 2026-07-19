# Workflow friction fixes + sample project — design

**Date:** 2026-07-18
**Status:** Design (approved in brainstorming)
**Source:** 2026-07-18 whole-app usability evaluation — the five friction-table rows plus "Load sample project".

## 1. Purpose

Six independent, small features that remove the daily-engineer friction found in the
usability evaluation. No calc changes. All persistence through `src/lib/storage.ts`
(ARCHITECTURE §4); no cross-step imports (Step 3 additions use shared `src/calc` /
`src/lib` only); Toyota Type only; imperial-first storage.

## 2. Features

### F1 — Paste-import flows (inline panel, Step 3)

- **Parser:** `src/lib/flowImport.ts`, pure (no React, no storage). Input: raw clipboard
  text or .csv file text. Behavior:
  - Split rows on newlines; detect delimiter (tab if any tab present, else comma).
  - Header auto-detect on row 1 by synonym match (case/space-insensitive):
    `origin|from|start`, `destination|dest|to|end`, `distance|dist|length`,
    `moves|thru|throughput|rate|trips|cycles`, `lift|height`. If row 1 matches ≥2
    synonyms it is a header; otherwise assume column order
    `origin, destination, distanceFt, thruPerHr[, liftHeightFt]`.
  - Units: a distance header containing `(m)`/`meters` converts ×3.28084 to feet at
    parse time (storage stays imperial). Default is feet.
  - Output: `{ rows: ParsedFlowRow[], skipped: { line: number; reason: string }[] }`.
    A row parses only if origin or destination is non-empty AND distance/thru are ≥ 0
    numbers (blank → 0). Never guess; unparseable rows go to `skipped` with a reason.
- **UI:** `src/components/step3/FlowImportPanel.tsx`. An **Import flows** ghost button
  next to “+ Add flow” toggles an inline panel (no modal): textarea (paste target) +
  “or drop/choose a .csv”; live preview table (first 8 rows + “+N more”), skipped-row
  count with reasons on hover/expand; primary button **Add N flows** appends flows
  (new ids, `routeLayout: 'medium'`, `sectionName` from the active group if invoked
  from a group context — v1: no group targeting, appends ungrouped) via the same
  `onPatch`/update path FlowsTable already uses; panel closes and clears on success.
- Empty-state copy in FlowsTable mentions the new button.

### F2 — Surface silently-dropped fields (Step 1)

- `salvageParse` (storage.ts) keeps its behavior but reports: new
  `subscribeSaveDrops(cb: (drops: { key: string; message: string }[]) => void)`
  storage event, fired whenever a save drops ≥1 key (Zod issue message per key,
  e.g. "shiftsPerDay: Number must be ≤ 3").
- `ApplicationForm` subscribes; renders the message as an inline warning line under
  the matching field (same styling family as existing field hints, warning color
  token). The warning clears when that field's value next changes. Unknown keys
  (no matching rendered field) are ignored.

### F3 — Undo-delete toast (Step 3 flows)

- Local to FlowsTable: deleting a flow stashes `{ flow, index }` in component state,
  shows a toast “Flow deleted — **Undo**” for 5 s (`aria-live="polite"`, no focus
  steal, auto-dismiss). Undo re-inserts at the original index via the normal update
  path. New deletion replaces the stash. No global toast framework.

### F4 — Cmd+Z app undo + keyboard flow reorder

- `PersistentHeader`: global `keydown` — `(meta|ctrl)+z` without shift → app
  `undoLastChange()` + `preventDefault`, **skipped** when `event.target` is an
  input/textarea/select/contentEditable (native text undo wins).
- `FlowRow` drag handle becomes a focusable button; when focused, ArrowUp/ArrowDown
  moves the flow one position (reusing FlowsTable's existing reorder logic),
  `aria-label="Reorder flow — drag, or use arrow keys"`.

### F5 — Qualification-aware vehicle select (Step 3)

- `VehicleSelect` options sorted GREEN · YELLOW · INCOMPLETE · RED, each with its
  status dot; RED suffixed “— not qualified”. Verdicts come from the shared calc
  (`qualifyVehicle` / traffic light) with requirements built by the existing
  `src/lib/appRequirements.ts` — computed once per render at the FlowsTab level and
  passed down (no Step 2 imports; ARCHITECTURE §3 “Step 2 informational” intact).
- HARD RULE preserved: never auto-selects; ordering + labeling only.

### F6 — Load sample project (Step 0)

- `src/content/samples/michelin-project.json` — a complete project (questionnaire
  answers, schedule, loads, flows with vehicle assignments) authored from
  `docs/EXERCISE-michelin.md` so Steps 1–4 all light up with a coherent, defensible
  result. Project-shaped user data — NOT vehicle data (vehicle-JSON rule untouched).
- Step 0: a “Load sample project” tertiary action under the Import card. Creates a
  **new** project from the JSON through the normal Zod/storage path
  (`createProject`-style; never touches the current project), then navigates to its
  Step 1. Idempotent: clicking twice makes two sample projects (cheap, obvious).

## 3. Testing

Vitest: `flowImport` parser (header detect, delimiter detect, meters conversion,
skipped-row reasons, column-order fallback) · `subscribeSaveDrops` fires with key +
message and doesn't fire on clean saves · VehicleSelect ordering (calc-level sort
helper) · sample JSON round-trips `partialProjectSchema` parse. UI toast/keyboard
verified manually (no jsdom keyboard rig exists in repo).

## 4. Docs

SPECIFICATION.md: Step 3 (import panel, undo toast, reorder keys, select ordering),
Step 1 (drop warnings), Step 0 (sample), header (Cmd+Z). CHANGELOG entry. Docs land
first (CLAUDE.md).

## 5. Out of scope

Project list/switcher, duplicate-as-revision, auto-backup (the three approval
conditions — separate project). Group-targeted import, XLSX re-import of flows,
multi-level undo.
