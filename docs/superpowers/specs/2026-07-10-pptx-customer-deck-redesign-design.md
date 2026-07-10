# PPTX Customer Deck Redesign — Design

**Date:** 2026-07-10
**Status:** Approved direction, pending user spec review
**Problem:** The branded ROM export reads as AI-generated — numbered dashboard
slides, 7-tile metric grids, auto-written takeaway sentences bolted above dense
tables, and three slides of worked math in the presented body. A customer-facing
deck built by a senior applications engineer makes one point per slide and keeps
the defense-of-the-numbers behind the contact slide.

## Scope

Every piece of content the **app injects** into the export is redesigned under
one grammar and one voice: all data slides (S18–S28), every caption/footnote
string, and all appended appendix slides. Cover (S1) and contact (S34) bracket
fills are pure data (names/numbers) and keep their current mechanics — the P0
token contract, section picker, and filename logic are unchanged. Static
template-owned slides (marketing 2–10, per-vehicle overviews 11–17, services
29–32, why-TAL 33) are untouched.

Nothing is deleted from the product — detail is **relocated** to the appendix,
not lost.

## Core principle — one idea per slide

Every data slide makes exactly **one claim in its title**, backed by at most
**one proof**: a table of ≤ 6 rows, one chart/image, or one tile strip — never
more than one proof element per slide. Two treatments (chosen per slide by what
the info needs):

- **B — one message:** takeaway title + up to 3 large numbers + footnote.
- **C — one point + one proof:** takeaway title + one small table or chart +
  one sentence of engineer narrative.

The 7-tile dashboard treatment (current S25/S26) is retired.

## Shared chrome (all body + appendix slides)

- **Numbered red eyebrow** — kept (reads as TAL system branding), renumbered to
  the new section map below. Appendix slides use `APPENDIX — <NAME>`.
- **Takeaway title** — the auto-generated takeaway sentence stops being a
  separate zone and **becomes the slide title**: shorter, confident, second
  person ("Your operation needs a fleet of 12", "Payback in about 2.3 years").
  When a takeaway is not computable, fall back to a plain descriptive title
  ("Fleet sizing") — never a blank, never a formula.
- **Short red rule** under the title.
- **Gray context footnote** at the bottom (source/assumption line, e.g.
  "ROM estimate pending final configuration · full derivation in appendix").

`layout.ts` keeps the zone-composition model; the zone order becomes
**eyebrow → title(takeaway) → rule → proof → footnote**.

## Presented body — 7 data slides (down from 11)

| Template slide | Eyebrow | Treatment | Content |
|---|---|---|---|
| S18 Application Requirements | `01 — APPLICATION` | C | Only the ~8 requirements that drive the design (max load, unit type, transfer method, throughput, distances/shifts, environment). Not every captured field. |
| S19 Vehicle Selection | `02 — VEHICLE SELECTION` | Fit-first cards | Only the vehicles the engineer **assigned to flows** (the selected fleet): vehicle photo, verdict pill, one plain-English "why it fits" line derived from gate results + which flows it serves. Footnote: "Selected from N chassis screened · screening matrix in appendix". |
| S21 Fleet Sizing (replaces S21–23) | `03 — FLEET SIZING` | B + proof | Headline = fleet number. Waterfall tile strip `Workload + Charging × Buffer = Fleet`, each tile with a one-line human explanation (no formulas). Fleet-mix caption (from old S26). |
| S24 Material Flow | `04 — MATERIAL FLOW` | C | Flow diagram as hero + flow table trimmed to route · moves/hr · assigned vehicle. |
| S25 Financials | `05 — FINANCIALS` | B | Three big numbers: ROM investment range · labor offset/yr · simple payback. |
| S27 Investment | `06 — INVESTMENT` | C | Per-line pricing table (kept — it is the proof) + takeaway title + TOTAL row. |
| S28 ROI | `06 — RETURN ON INVESTMENT` | C | Payback chart as hero + 3-row table (simple payback · annual labor offset · annual OPEX). |

**Slides removed from the presented body:** S20 (gate grid → appendix), S22/S23
(tiers merged into S21), S26 (fleet mix folds into S21; status gauges
Utilization/Availability/Charging/Redundancy are web-app material and are
dropped from the export; TCO and cost-per-move move to the appendix; annual
OPEX resurfaces in the S28 ROI table).

**Vehicle fit cards (S19) data rule:** the card set is exactly the distinct
chassis in the engineer's flow→vehicle assignments — the tool never auto-selects
a vehicle (consistent with the app rule that the engineer always assigns). Each
card's "why it fits" line comes from its `qualifyVehicle` result + the flows it
serves; an assigned chassis whose verdict is REVIEW names its review item
("viable if the ramp survives the site walk"). If no flows have an assigned
vehicle yet, S19 is dropped from the export (the screening matrix remains in
the appendix).

## Appendix (after contact, in this order)

1. Vehicle verdict table (current S19 content: all chassis, verdict + notes)
2. Gate × vehicle screening grid (current S20 content)
3. Sizing derivations — the three worked tier tables (Raw / Charging / Buffer)
4. Methodology reference (existing)
5. Per-flow cycle math (existing, 9 flows/slide pagination)
6. Cost detail — TCO @ service life, cost/move, and other cut financial tiles

All appendix slides are appended via the existing `cloneSlide` machinery and
carry the `APPENDIX — <NAME>` eyebrow.

## Voice / copy rules (applies to ALL injected strings)

- Second person, plain, confident. No hedging, no formula phrasing in the body.
- Titles are claims ("Two vehicles fit your application"), not labels — except
  the descriptive fallback when data is missing.
- Footnotes carry the honesty: ROM caveats, "gross of OPEX", appendix pointers.
- `takeaways.ts` is reworked to emit title-length strings (≈ ≤ 60 chars) per
  slide, with a descriptive fallback per slide.

## Implementation surface

- `src/lib/pptx/layout.ts` — zone order change (takeaway becomes title), footer zone.
- `src/lib/pptx/takeaways.ts` — title-tone strings + fallbacks, one per body slide.
- `src/lib/pptx/tables.ts` — S18 trim; S19 fit cards; S21 merged waterfall;
  S24 trimmed table; appendix additions (verdict, gate grid, derivations, cost detail).
- `src/lib/pptx/content.ts` — S25 three-number layout; delete S26 fill.
- `src/lib/pptx/sections.ts` — S20/S22/S23/S26 always removed from the body;
  section keys/labels updated.
- `src/lib/pptx/ooxml.ts` — vehicle-photo image support in cards (reuses
  `addImage`); tile strip helper reuse.
- `docs/PPTX-TOKEN-CONTRACT.md`, `docs/SPECIFICATION.md`, `docs/CHANGELOG.md` —
  docs first, per project rules.

## Testing

- Update `__tests__/tables.test.ts`, `content.test.ts`, `layout.test.ts`,
  `ooxml.test.ts` to the new slide map and zone order.
- Rewrite `takeaways.test.ts` for title-tone strings + fallback behavior.
- Acceptance: build the Acme sample deck; verify slide count, one-proof rule,
  no overflow warnings, appendix order.

## Out of scope

- Editing the static template slides' design (marketing, vehicle overviews).
- New charts (CAPEX bars etc. stay "still planned").
- Web-app UI changes.
