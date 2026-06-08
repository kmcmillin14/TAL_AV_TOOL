# SP1 — Declarative Suitability Gate Engine (data-model backbone)

**Date:** 2026-06-08
**Status:** Design approved, pending spec review
**Program:** Questionnaire → Suitability Matrix completeness (4 sub-projects; this is SP1 of 4)

---

## Context

The Step 1 questionnaire (`src/lib/validations/schemas.ts`, 13 sections) collects
substantially more than the Step 2 suitability matrix uses. `appRequirementsFromProject`
(`src/lib/appRequirements.ts`) maps only a subset into `ApplicationRequirements`, and
`src/calc/trafficLight.ts` evaluates 13 gates — **12 hard + 1 soft** (certifications is the
only soft signal). Several collected fields never reach the matrix at all
(`floorCondition`, `dustMoisture`, `interlocks`, `wmsRequired`/`wmsVendor`, `otherAGVs`).

`trafficLight.ts` is ~320 lines of near-identical, hand-written gate blocks. Adding a gate
today means copy-pasting a ~20-line block. This is the altitude problem behind "the matrix
seems incomplete": new gates are expensive, so they don't get added.

### Program decomposition (for reference; only SP1 is specced here)

1. **SP1 — Declarative gate engine + data-model backbone** *(this spec)*. Refactor the
   hand-written gates into a declarative registry. Behavior-preserving. No new fields.
2. **SP2 — Close the loop on orphaned data.** Wire `floorCondition`, `dustMoisture`→IP,
   `interlocks`→I/O, `wmsRequired`→software fit, `otherAGVs`→interoperability as new gates;
   populate the paired vehicle JSON fields.
3. **SP3 — Matrix UX for applications engineers.** Comparison-grid view (vehicles × gates),
   "would qualify if you changed X" near-miss hints, data-provenance/confidence badges,
   novice-vs-advanced affordances.
4. **SP4 — Questionnaire depth.** New AE questions (navigation/guidance infrastructure,
   pedestrian/traffic density, load presentation/stability, dock/trailer loading,
   peak-vs-average throughput) + their gates.

Each subsequent sub-project becomes "add an entry (or a few) to the registry + populate
vehicle data + render," which is the leverage SP1 creates.

---

## Goal

Refactor `trafficLight.ts` qualification into a **declarative gate registry** so that:

- All 13 existing gates are expressed as data (`GateSpec` entries), not bespoke code.
- The public API (`qualifyVehicle`) and output shape (`QualificationResult`) are **byte-for-byte
  unchanged** — existing Step 2 UI and tests require no edits.
- Adding a future gate is **one array entry**.
- The registry array is the artifact SP3's comparison grid can iterate over.

### Non-goals (explicitly deferred)

- New questionnaire or vehicle data fields (SP2/SP4).
- Suitability scoring / vehicle ranking (SP3).
- Comparison-grid or any UI change (SP3).
- Any change to fleet sizing, charging, buffer, or ROM calc.

---

## Decisions (from brainstorming)

- **Behavior-preserving refactor**, not a behavior change. GREEN/YELLOW/RED semantics stay
  identical; soft preferences become a first-class multi-entry list (today it holds one).
- **Engine only; data fields land with their gate.** SP1 adds no new vehicle/questionnaire
  fields. SP2/SP4 each add fields alongside the gate that consumes them. No orphaned schema.
- **Approach A — data-driven registry + typed factory helpers**, with a custom escape hatch
  for the two irregular gates (certifications set-difference, conditional lift height).

---

## Architecture

Everything stays inside the pure `src/calc/` layer — no React, no `fetch`, no `localStorage`,
no `fs` (calc-purity rule preserved).

### File layout

- **`src/calc/gates.ts`** *(new)* — `GateSpec` type, the factory helpers, and the `GATES`
  registry (all 13 specs, in current evaluation order).
- **`src/calc/trafficLight.ts`** *(slimmed, ~320 → ~40 lines)* — keeps the public API
  `qualifyVehicle(vehicle, app)` and the existing `deliveryPatternRequiresLift(deliveryPattern)`
  helper (the latter is imported by `gates.ts` for the lift gate's `applicable` predicate and
  by Step 1's form). Body becomes: walk `GATES` → `GateResult[]`, split by severity, apply the
  unchanged rollup.
- **`src/calc/types.ts`** — **unchanged.** `GateResult` and `QualificationResult` shapes stay
  identical, so `WhyBreakdown`, `VehicleCard`, `TrafficLight`, and the Step 2 page need no
  changes.

### The gate contract

Each gate is one `GateSpec`. The engine resolves every spec through a fixed pipeline that makes
today's implicit precedence explicit:

```
1. requirement(app) → null/≤0/empty   ⇒ SKIP  ("No requirement provided")
2. vehicleValue(veh) → GateSkip        ⇒ SKIP  (e.g. "Vehicle has no load deck")
3. applicable(app, veh) → GateSkip     ⇒ SKIP  (e.g. "Delivery pattern does not involve height")
4. else compare via satisfied(vehVal, reqVal) ⇒ pass/fail
```

```ts
export type GateSeverity = 'hard' | 'soft'

export interface GateSkip {
  skip: true
  skipReason: string          // e.g. "Vehicle has no load deck"
  reason: string              // e.g. "Not evaluated — vehicle has no load deck (tugger/tow class)"
  vehicleValue: string        // display string for the skipped row
  requiredValue?: string      // shown when known (load-dim "no deck" skip shows "48 in"); else "—"
}

export interface GateSpec<Req = unknown, Veh = unknown> {
  id: string
  name: string
  severity: GateSeverity
  unit?: string
  /** Required value, or null when there is no requirement (gate skipped). */
  requirement(app: ApplicationRequirements): Req | null
  /** Vehicle value to compare, or a GateSkip when the vehicle lacks the capability. */
  vehicleValue(vehicle: Vehicle): Veh | GateSkip
  /** Optional applicability test (e.g. lift only when delivery pattern needs height). */
  applicable?(app: ApplicationRequirements, vehicle: Vehicle): true | GateSkip
  /** Pass/fail given resolved values. */
  satisfied(vehVal: Veh, reqVal: Req): boolean
  /** Build the display + reason fields for a non-skipped GateResult. */
  describe(ctx: {
    vehVal: Veh
    reqVal: Req
    passed: boolean
  }): Pick<GateResult,
    'reason' | 'vehicleValue' | 'requiredValue' | 'vehicleNumeric' | 'requiredNumeric' | 'delta'>
}
```

`qualifyVehicle` resolves each spec to a `GateResult` (carrying `gateId`, `name`, `severity`,
`passed`, `skipped`, `skipReason?`, plus whatever `describe()` / the skip path supplies), then:

```
hardFail = hardGates.some(g => !g.skipped && !g.passed)   → RED
softFail = softPrefs.some(g => !g.skipped && !g.passed)   → YELLOW
otherwise                                                 → GREEN
```

### Factory helpers

Cover the recurring shapes so most specs are ~5 lines:

- `numericMinGate(opts)` — vehicle ≥ required; `delta = veh − req`. Used by: weight, load
  length/width/height, lift height, temp max, ramp. Options carry `unit`, a `format` hook
  (e.g. `toLocaleString` for weight, `toFixed(1)` for the lift short-delta), the requirement/
  vehicle accessors, an optional `vehicleSkip` (load dims → "no load deck"), and pass/fail
  reason templates.
- `numericMaxGate(opts)` — vehicle ≤ required; `delta = req − veh`. Used by: temp min (rated
  colder than needed).
- `booleanRequiredGate(opts)` — app flag true ⇒ vehicle capability must be true. Used by:
  outdoor, freezer.
- `setMembershipGate(opts)` — required value ∈ vehicle set; `caseInsensitive?: boolean`. Used
  by: payload type (case-**sensitive**), transfer method (case-**insensitive**).
- **Custom specs** (no helper): certifications (soft set-difference, lists missing certs) and
  lift height (numeric-min wrapped in an `applicable` predicate using
  `deliveryPatternRequiresLift`, with the two distinct skip reasons).

---

## Gate migration map

13 gates, current evaluation order preserved. **Hard** unless noted.

| # | gateId | Helper | Requirement (skip when) | Vehicle value | Notes |
|---|---|---|---|---|---|
| 1 | `weight` | numericMin | `maxLoadWeightLbs` (≤0) | `calc.maxWeightLbs` | `toLocaleString`; "headroom"/"short" reasons |
| 2 | `load_length` | numericMin | `loadLengthIn` (null/≤0) | `calc.maxLoadLengthIn` (null → deck skip) | unit `in` |
| 3 | `load_width` | numericMin | `loadWidthIn` (null/≤0) | `calc.maxLoadWidthIn` (null → deck skip) | unit `in` |
| 4 | `load_height` | numericMin | `loadHeightIn` (null/≤0) | `calc.maxLoadHeightIn` (null → deck skip) | unit `in` |
| 5 | `payload_type` | setMembership (**case-sensitive**) | `typicalUnitType` trim (empty) | `payloadTypes[]` | |
| 6 | `transfer_method` | setMembership (**case-insensitive**) | `transferMethod` trim (empty) | `transferMethods[].method` | |
| 7 | `lift_height` | numericMin + `applicable` | `maxLiftHeightFt` (null/≤0) **and** `deliveryPatternRequiresLift` | `calc.maxLiftHeightFt ?? 0` | two skip reasons; short-delta `toFixed(1)` |
| 8 | `outdoor` | booleanRequired | `outdoorRequired` (false) | `specs.outdoorCapable` | |
| 9 | `freezer` | booleanRequired | `freezerCapable` (false) | `specs.freezerCapable` | |
| 10 | `temp_min` | numericMax | `tempMinF` (null) | `specs.tempMinF` | veh ≤ req; unit `°F` |
| 11 | `temp_max` | numericMin | `tempMaxF` (null) | `specs.tempMaxF` | veh ≥ req; unit `°F` |
| 12 | `ramp` | numericMin | `maxRampGrade` (≤0) | `specs.maxRampGrade` | unit `%` |
| 13 | `certifications` | **soft**, custom | `certifications[]` non-empty (empty) | `specs.certifications[]` (lowercased) | lists missing certs |

### Behavioral subtleties to reproduce exactly

These are the traps the migration must preserve (verified against current `trafficLight.ts`):

1. **Case sensitivity differs**: `payload_type` uses case-sensitive `includes`; `transfer_method`
   compares case-insensitively. → `setMembershipGate({ caseInsensitive })`.
2. **Number formatting**: weight reasons use `toLocaleString()`; lift "short" delta uses
   `toFixed(1)`. → per-spec `format` hooks.
3. **Two distinct skip reasons on load dims**: "No requirement provided" (no required value)
   vs. "Vehicle has no load deck (tugger/tow class)" (vehicle value null). → `vehicleValue()`
   may return a `GateSkip`.
4. **Lift conditional skip text**: "Delivery pattern does not involve height" when not
   applicable; "No requirement provided" when applicable but no height given.
5. **Exact strings preserved**: `reason`, `skipReason`, the "Not evaluated — …" text, and the
   `delta`/`vehicleNumeric`/`requiredNumeric` fields, because `WhyBreakdown` renders them.

---

## Testing strategy

1. **Characterization snapshot first.** Before refactoring, add a test that runs
   `qualifyVehicle` over the **6 real vehicles** (`src/content/vehicles/*.json`) × a small
   matrix of representative `ApplicationRequirements` inputs (empty, partial, full-pass, and
   one input that fails each gate) and snapshots the full `QualificationResult`. This locks
   current output.
2. **Refactor under green.** Migrate to the registry; the snapshot **and** the existing
   `trafficLight.test.ts` (404 lines) must stay green with zero edits. A snapshot diff means
   the refactor changed behavior — fix the spec, not the test.
3. **Per-helper unit tests** for `numericMinGate`, `numericMaxGate`, `booleanRequiredGate`,
   `setMembershipGate` (including the case-sensitivity flag), so SP2 can build on them with
   confidence.
4. Whole suite (129 existing + new) green; `tsc --noEmit` clean; calc-purity grep
   (`from 'react'|localStorage|from 'fs'|fetch(` over `src/calc/`) returns nothing.

---

## Success criteria

- `trafficLight.ts` body is the registry walk + rollup (~40 lines); all 13 gates live in
  `gates.ts` as declarative specs.
- Output identical to pre-refactor for all 6 vehicles across the input matrix (characterization
  snapshot unchanged).
- Adding a hypothetical 14th gate is demonstrably **one `GateSpec` entry** — proven by a
  throwaway spec in a test (not shipped).
- Existing Step 2 UI untouched and visually unchanged.

## Risks

- **Reason-string drift** is the only real risk; the characterization snapshot catches it.
  Low overall — pure-function refactor with strong existing coverage.

## Files touched

- `src/calc/gates.ts` (new)
- `src/calc/trafficLight.ts` (slimmed; API unchanged)
- `src/calc/__tests__/gates.test.ts` (new — helper unit tests)
- `src/calc/__tests__/trafficLight.snapshot.test.ts` (new — characterization)
- `docs/CHANGELOG.md` (entry; touches calc architecture)

`src/calc/types.ts`, `src/lib/appRequirements.ts`, and all Step 2 components are **unchanged**.
