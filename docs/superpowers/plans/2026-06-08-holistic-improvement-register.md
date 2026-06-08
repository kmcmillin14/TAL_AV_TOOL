# Holistic Improvement Register — TAL Fleet Calculator

**Date:** 2026-06-08
**Status:** Review register (audit output). Feeds sequenced spec → plan → build cycles.

## North star & discipline

One tool where a **novice and an expert both** reach a defensible fleet answer through a
clear, connected flow. Apply `/simplify` to UI/UX **and** backend. Order of operations:
**Cut → Connect → Add.**

## Canonical flow (the goal — keep every change in service of it)

1. **Application** — fill a fresh questionnaire, OR import a questionnaire PDF (embedded
   JSON), OR import an earlier revision (PDF w/ JSON) to update.
2. **Matrix** — evaluate vehicles against the given specs.
3. **Fleet Engineer** — size the fleet: raw demand → battery/charging adder → buffer.
4. **Dashboard & ROM** — then **export to PDF and PPTX**. Repeat.

Each row below is tagged **Keep / Cut / Clarify / Connect / Add** with effort (S/M/L),
impact (lo/med/hi), and persona (N=novice, X=expert, B=both).

---

## Module: Entry / Start (`app/page.tsx`, `step0`)

| Tag | Item | E·I·P |
|---|---|---|
| Cut | `app/page.tsx` silently auto-creates/redirects into one project — no real entry. | S·hi·B |
| Add | A **Start** screen: New (guided) · **Open recent** · Import. Surface `listProjects()` (exists in `storage.ts`, used by **no UI** today). | M·hi·B |
| Connect | Make the 3 import modes first-class and equal on Step 0 (fresh / questionnaire-PDF / prior-revision-PDF) — matches the canonical flow's three entry modes. | S·med·B |
| Clarify | One-screen "3 things you'll need" primer; skippable for X. | S·med·N |
| Keep | PDF/JSON import with embedded-JSON parsing (`pdfImport.ts`). | — |

## Module: Step 1 — Application (`ApplicationForm.tsx`, `schemas.ts`, `sections.ts`)

| Tag | Item | E·I·P |
|---|---|---|
| Cut | **Orphaned fields** collected but never used downstream: `floorCondition`, `dustMoisture`, `interlocks`, `wmsRequired`/`wmsVendor`, `otherAGVs`. Either wire them (Matrix track) or demote behind "more detail." | M·hi·B |
| Clarify | Lead with the ~6 result-driving inputs (weight, load L/W/H, transfer, throughput, schedule, distance); collapse certs/dealer/environment/notes under progressive disclosure. | M·hi·N |
| Clarify | Plain-language inline hints per field for novices; experts skim. | M·med·N |
| Connect | Smart defaults so a sparse Step 1 still drives a provisional answer end-to-end. | M·hi·B |
| Cut | Demote admin sections (Dealer & Contact, Project Notes) — not engineering inputs. | S·lo·B |
| Keep | No-required-fields-to-advance; autosave; `cleanFormData` NaN/empty→undefined. | — |

## Module: Step 2 — Matrix (`step2/page.tsx`, `trafficLight.ts`, `VehicleCard.tsx`)

| Tag | Item | E·I·P |
|---|---|---|
| Cut/Backend | `trafficLight.ts` = ~320 lines of copy-paste gate blocks. → **declarative gate registry** (spec: `2026-06-08-suitability-gate-engine-design.md`). | M·med·X |
| Clarify | Lead with GREEN matches; keep "why" behind details (already close). Skimmable for N. | S·med·N |
| Connect | Show "evaluated against *these* Step-1 specs" explicitly so the matrix reads as a consequence of Step 1, not a separate thing. | S·med·B |
| Connect | Resolve the **duplicate requirements surface**: Step 2 cards vs Step 4 `RequirementsMatrix` — one home. | S·med·B |
| Keep | Card grid, traffic-light logic (GREEN/YELLOW/RED), hard-gate-absolutism rule. | — |

## Module: Step 3 — Fleet Engineer (`step3/page.tsx`, `flowMetrics.ts`, `fleet.ts`)

| Tag | Item | E·I·P |
|---|---|---|
| Connect | **Auto-seed one flow from Step 1** (throughput + distance) so a novice gets a fleet number without learning flows; expert opens the full table. | M·hi·N |
| Cut/Backend | Reconcile `flowMetrics.ts` doc/code drift: docstring advertises a `turns × TURN_TIME_SEC` term that doesn't exist; `Flow` comment says route factors are 50/70/90% but constants are 30/50/70%. | S·med·X |
| Clarify | The raw→battery→buffer waterfall is the heart of the app — make the staged pipeline legible to N (it already has nice visuals; ensure the "+N for charging ×buffer" story reads plainly). | M·med·B |
| Add | Modeling fidelity (congestion / station-wait / duty-cycle) — Phase C, needs AE domain input. | L·med·X |
| Keep | Pure unified waterfall (base→+charging→×buffer→total); `useFleetData` centralization. | — |

## Module: Step 4 — Dashboard & ROM (`step4/page.tsx`, `RomVisuals.tsx`, `RomExportBar.tsx`)

| Tag | Item | E·I·P |
|---|---|---|
| Cut | **~13+ stacked panels in one scroll** (KPIs, pricing, economics, Operation map, Duty cycle, Utilization, Charging, Battery SoC, CAPEX, Payback, TCO, FleetMath, Requirements, Sensitivity, Assumptions, Export). Overwhelming. → **summary-first + tabs/accordions.** | M·hi·B |
| Clarify | Split **customer-facing** (fleet · price range · payback · operation map) from **engineer internals** (Battery SoC, duty cycle, TCO-stacked, sensitivity, fleet math). | M·hi·B |
| Add | **PPTX export** — stated goal, not implemented (only PDF+JSON in `RomExportBar`). | L·hi·B |
| Add | Clean customer **proposal** output (PDF/PPTX) that omits engineer internals. | M·hi·B |
| Keep | Price-as-range rule; editable assumptions; embedded-JSON PDF round-trip. | — |

## Module: Cross-cutting (header, storage, calc, design system)

| Tag | Item | E·I·P |
|---|---|---|
| Cut | `PersistentHeader` does too much (5 inline edits + opp prefix + units + undo + theme + help + menu + 4 KPIs + nav). Reduce load. | M·med·B |
| Cut | Vestigial `step5Complete` in `storage.ts` (only steps 0–4 exist). | S·lo·X |
| Connect | One shared **"answer-so-far"** model (fleet · CAPEX · payback · utilization) computed once and reused by header + steps (extend `useFleetData`). | M·hi·B |
| Clarify | App-wide **progressive disclosure** convention (essentials vs "more detail") so N/X share one UI without modes. | M·hi·B |
| Add | **Scenario compare** (Option A vs B) + project duplicate — depends on the Start/list work. | L·med·X |
| Add | **Provenance/confidence** signals (estimate vs measured per `VEHICLE-DATA-PROVENANCE.md`). | M·med·B |
| Keep | localStorage-only state, calc purity, Toyota Type, imperial-first, no-backend. | — |

---

## Sequenced backbone

**Phase A — Cut & simplify** (low risk, immediate clarity)
- Step 1: demote orphaned/admin fields behind "more detail"; lead with the 6 drivers.
- Step 4: summary-first + tabs; split customer vs engineer panels; dedupe the requirements surface.
- Backend: gate-engine refactor; fix `flowMetrics` doc/constant drift; drop `step5Complete`; slim header.

**Phase B — Connect the spine** (tie steps together)
- Start screen + recent-projects list (surface `listProjects()`).
- Step 3 auto-seeds a flow from Step 1; Step 2 shows "evaluated against Step 1"; Step 4 traces back.
- Shared "answer-so-far" model; progressive disclosure + smart defaults so a sparse project still flows end-to-end.

**Phase C — Add** (only after clean & connected)
- **PPTX export** + clean customer proposal output (PDF/PPTX).
- Modeling fidelity (congestion / station-wait / duty-cycle).
- Input acceleration (industry templates, CSV flow import); scenario compare; provenance signals.

## Validation per change
Tests green · `tsc` clean · `build` OK · **novice walkthrough** + **expert walkthrough** sanity check that the flow still reads clearly for both personas.

## Top 5 to start (highest impact / lowest risk)
1. Step 4 de-clutter (summary-first + tabs; customer/engineer split).
2. Step 1 essentials-first + progressive disclosure.
3. Start screen + recent-projects list.
4. Step 3 auto-seed flow from Step 1 (the biggest "connect" win for novices).
5. Gate-engine refactor (backend simplify; unblocks matrix completeness).
