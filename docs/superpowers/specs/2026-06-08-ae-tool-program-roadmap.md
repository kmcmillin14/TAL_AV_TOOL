# AE Tool Improvement Program — Roadmap

**Date:** 2026-06-08
**Status:** Approved (sequencing). Each sub-project gets its own spec → plan → build cycle.

Origin: a brainstorm on improving overall functionality and usability for applications
engineers (novice → advanced), starting from the observation that the questionnaire →
suitability-matrix chain is incomplete. Scope expanded to the whole app and re-sequenced,
with **modeling fidelity prioritized**.

## Phases

### Phase 0 — Foundation *(spec approved, ready to build)*
- **GE — Declarative gate engine.** Refactor `trafficLight.ts`'s 13 hand-written gates into a
  declarative `GateSpec` registry + factory helpers. Behavior-preserving, no new fields.
  Spec: `docs/superpowers/specs/2026-06-08-suitability-gate-engine-design.md`.

### Phase 1 — Modeling fidelity *(top priority; pure calc in Steps 3–4)*
Accuracy of the numbers AEs defend to customers. **Needs AE domain input before each spec.**
- **MF1 — Cycle-time fidelity.** Reconcile the `flowMetrics.ts` docstring/code `turns` gap; add
  turns and accel/decel, plus a congestion/queueing factor beyond the single route-layout
  multiplier.
- **MF2 — Duty cycle & availability.** Idle, operator handoff, queueing feeding fleet sizing —
  closes the deferred tugger duty-cycle accuracy gap (`fleet.ts`/`flowMetrics.ts`).
- **MF3 — Energy & charging realism.** Duty-cycle-aware energy (not continuous full draw),
  smarter charging/buffer (`rom.ts`/`fleet.ts`).

### Phase 2 — Matrix completeness *(rest of the original questionnaire→matrix track)*
- **MX1 — Close the loop on orphaned data.** Wire `floorCondition`, `dustMoisture`→IP,
  `interlocks`→I/O, `wmsRequired`→software fit, `otherAGVs`→interoperability as gates;
  populate paired vehicle fields. (Depends on GE.)
- **MX2 — Questionnaire depth.** New AE questions (navigation/guidance infrastructure,
  pedestrian/traffic density, load presentation/stability, dock/trailer, peak-vs-average
  throughput) + their gates. (Depends on GE.)
- **MX3 — Matrix UX for AEs.** Comparison grid (vehicles × gates), "would qualify if you
  changed X" near-miss hints, soft-signal presentation. (Depends on GE; benefits from MX1/MX2.)

### Phase 3 — Trust & workflow *(cross-cutting UX; leans on stable calc + matrix)*
- **TW1 — Transparency.** Data-provenance/confidence badges (estimate vs measured, per
  `VEHICLE-DATA-PROVENANCE.md`) + assumption sensitivity surfaced in the UI (`romSensitivity`).
- **TW2 — Project/portfolio management.** Project list, switcher, duplicate. `listProjects()`
  exists in `storage.ts` but no UI surfaces it today (`app/page.tsx` auto-redirects to one
  entry project).
- **TW3 — Workflow & output.** Scenario compare (depends on TW2), industry/use-case templates
  (relate to MX2), novice/advanced modes (app-wide), proposal-PDF polish.

## Cross-cutting notes
- **Calc-purity rule** holds for all MF work: `src/calc/` stays React/IO-free.
- **No backend** stays a constraint (TW collaboration is export/import only) unless explicitly
  revisited.
- **Novice vs advanced AE** is a recurring lens, concentrated in MX3 and TW3 but considered
  throughout (sensible defaults + explanations for novices; fast entry + overrides for advanced).

## Out of program (for now)
- Backend / cloud sync / multi-user accounts.
- Auto-CAD / facility-import integrations.
