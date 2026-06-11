# Step 1 Questionnaire Stratification — Design

**Date:** 2026-06-10
**Status:** Approved for planning

## Problem

The Step 1 questionnaire reads like a customer intake form: 13 flat sections interleave
the ~16 fields the qualification gate engine actually reads with sizing inputs, CRM data,
and fields that today have no consumer beyond the PDF export. An applications engineer
cannot tell which answers move the Step 2 traffic lights. Audit findings (2026-06-10):

- **Feeds qualification (gates in `src/calc/gates.ts`):** weight, load L/W/H, unit type,
  transfer method, delivery pattern, lift height, temps, outdoor, freezer, ramp grade,
  certifications (soft), aisle width (informational badge only).
- **Feeds sizing/ROM only:** schedule, throughput/distance (Step 3 auto-seed), labor.
- **No consumer beyond PDF:** floor condition (currently *required*!), dust/moisture,
  ramp distance, pallet bottom-board, interlocks, WMS, other AGVs, dealer, install date,
  notes.

## Decisions (user-confirmed)

1. **Stratify, don't delete.** Every field keeps its schema key, storage behavior, and
   PDF slot. Future revisions add consumers (e.g. WMS → cost adder).
2. **No gate-engine, calc, schema, or vehicle-JSON changes** in this pass. Floor
   condition / dust-moisture stay informational; gating them is a future revision.
3. Single-page scroll + SectionNav pattern is kept (Approach A; mode toggle and
   mini-wizard rejected).

## New structure (13 flat sections → 3 tiers, 12 sections)

### Tier 1 — VEHICLE QUALIFICATION

| § | id | Title | Fields |
|---|----|-------|--------|
| 01 | section-01 | What are you moving? | maxLoadWeightLbs, typicalUnitType (+ otherUnitTypeDescription), loadLengthIn, loadWidthIn, loadHeightIn, palletBottomBoard (+ customPalletDescription) |
| 02 | section-02 | How is it transferred? | transferMethod, deliveryPattern, maxLiftHeightFt (conditional on `deliveryPatternRequiresLift`) |
| 03 | section-03 | Environment & site | tempMinF, tempMaxF, outdoorRequired, freezerCapable, maxRampGrade, rampDistanceFt, minAisleWidthFt (keeps "informational only" treatment) |
| 04 | section-04 | Certifications | certifications (stays a soft gate) |

### Tier 2 — FLEET SIZING & ECONOMICS

| § | id | Title | Fields |
|---|----|-------|--------|
| 05 | section-05 | Operating schedule | shiftsPerDay, hoursPerShift, operatingDaysPattern (+ operatingDaysCustom), breaksPerShift, breakDurationMin |
| 06 | section-06 | Throughput & distance | requiredThroughputPerHour, avgDistanceFt, distanceType |
| 07 | section-07 | Labor | operatorsPerShift |

### Tier 3 — PROPOSAL DETAILS (each section `collapsible`, `defaultOpen={false}`)

| § | id | Title | Fields |
|---|----|-------|--------|
| 08 | section-08 | Site details | floorCondition, dustMoisture |
| 09 | section-09 | Integration | interlocks, wmsRequired, wmsVendor, otherAGVs, otherAGVVendor |
| 10 | section-10 | Dealer | oemDealer, dealershipName, dealerRep |
| 11 | section-11 | Timeline | desiredInstallDate |
| 12 | section-12 | Notes | projectNotes |

Tier boundaries render as small uppercase band headers in both the form body and the
SectionNav (e.g. `VEHICLE QUALIFICATION`, `FLEET SIZING & ECONOMICS`, `PROPOSAL
DETAILS`). Tier 3's band carries a one-line hint that these fields feed the proposal
PDF and future revisions, not qualification.

## SectionNav: qualification readiness meter

The top-of-nav progress meter is **redefined** from "N of 13 required fields" to
**gate inputs answered** — e.g. "9 of 12 qualification inputs".

**Countable set (11 + 1 conditional):** maxLoadWeightLbs, typicalUnitType, loadLengthIn,
loadWidthIn, loadHeightIn, transferMethod, deliveryPattern, tempMinF, tempMaxF,
maxRampGrade, minAisleWidthFt — plus maxLiftHeightFt **only when**
`deliveryPatternRequiresLift(deliveryPattern)` is true (helper already exported from
`src/calc/trafficLight.ts`; the denominator changes 11 ↔ 12 with the pattern).

**Excluded:** outdoorRequired, freezerCapable (unchecked is a valid answer, not a gap),
certifications (optional soft gate), palletBottomBoard and all descriptive/tier-2/tier-3
fields.

**"Answered" semantics:** strings → non-empty after trim; numbers → present and finite
(note: this means 0 counts as answered for temps, where 0 °F is legitimate — the meter
helper must not reuse `isFilled`'s `> 0` rule for tempMinF/tempMaxF).

**Badges:** per-section status badges keep working as today — tier-1 sections derive
their badge from their gate-input fields; tier-2 sections keep their current
`requiredFields` for badge purposes only (they do not feed the meter); tier-3 sections
are always `optional`.

The architecture rule "no required fields to advance between steps" is untouched; the
meter and badges remain purely informational.

## Implementation surface

- `src/lib/constants/sections.ts` — `SectionMeta` gains `tier: 'qualification' |
  'sizing' | 'proposal'`; sections reordered/renumbered per the tables above; new meter
  helpers (`qualificationInputsTotal(values)`, `qualificationInputsFilled(values)`) that
  special-case the conditional lift height and the temp-zero rule.
- `src/components/step1/ApplicationForm.tsx` — JSX blocks reordered/regrouped to match;
  tier band headers added; tier-3 sections collapsed by default. Field markup itself
  (inputs, watch-save, `cleanFormData`) unchanged.
- `src/components/step1/SectionNav.tsx` — tier headers in the list; meter wired to the
  new helpers and relabeled ("N of M qualification inputs").
- `app/globals.css` — styles for the tier band headers (Toyota Type vars only).
- `docs/SPECIFICATION.md` + `docs/CHANGELOG.md` — updated before code per CLAUDE.md.

**Explicitly out of scope:** `src/calc/*` (gates, traffic light), Zod schemas,
`src/lib/storage.ts`, vehicle JSONs, PDF export content, Step 2 UI.

## Acceptance criteria

1. All ~40 Step 1 fields still render, still persist to the same schema keys, and still
   appear in the exported PDF — zero data-shape change (existing storage tests pass).
2. The form renders three labeled tiers in the order Q1–Q4, S1–S3, P1–P5; tier-3
   sections load collapsed.
3. The nav meter reads "N of 11 qualification inputs" (or "of 12" when the delivery
   pattern requires lift) and increments only on the countable set.
4. A temp of 0 °F counts as answered; a cleared (NaN/empty → undefined) field does not.
5. Section anchors/intersection-observer navigation still scroll-and-highlight correctly
   after renumbering.
6. `npm run build` passes; no new imports into `src/calc/` from UI code (the nav imports
   `deliveryPatternRequiresLift` from `src/calc/trafficLight.ts`, which is already the
   sanctioned export point for Step 1).

## Addendum (2026-06-10, planning)

- Section 8 also held `facilityLocation`, `bastianRep`, and the proposal-date control;
  they live in **P3 Dealer & contact** (section-10).
- "Software Integration" merges into **P2 Integration** (section-09): interlocks + WMS
  + other AGVs. Total stays 12 sections.
- User-added scope: vocabulary alignment fixes (TRANSFER_METHODS, ML2 cert token, card
  payload row) — see CHANGELOG 2026-06-10. The "no vehicle-JSON changes" rule is
  amended to permit the single ML2 certification-token normalization.
