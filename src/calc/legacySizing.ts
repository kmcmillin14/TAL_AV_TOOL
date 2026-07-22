// Legacy Excel fleet-sizing method — codified for the old-vs-new regression study.
// PURE (no React/IO), same rules as the rest of src/calc/.
//
// STATUS (2026-07-21): this is the STATED HAND RULE baseline used until the owner
// provides the authoritative workbook. When the workbook lands, replace the body
// of `legacyFleetSize` with its exact formulas (and, if its cycle-time math differs
// from the app's, add a legacy demand path — today both models consume the SAME
// `groupRaw` so the study isolates the SIZING-POLICY divergence, not cycle math).
//
// The hand rule (per vehicle type):
//   raw demand  → × 4/3 charge adder (flat 3:1 run:charge, availability 0.75)
//               → × 1.20 buffer
//   with a CEILING at each stage (how the spreadsheets rounded).
// The charge adder is applied UNCONDITIONALLY — the legacy sheet never credited
// off-shift or weekend charging, which is the known source of single-shift
// over-quoting vs the app's schedule-aware v3 model.

export const LEGACY_CHARGE_AVAILABILITY = 0.75 // 3 run : 1 charge → 3/4 uptime
export const LEGACY_BUFFER = 0.20              // flat 20% buffer

export interface LegacySizing {
  raw: number          // Σ raw vehicle demand (same groupRaw the app computes)
  afterCharging: number // ⌈raw / 0.75⌉
  fleet: number         // ⌈afterCharging × 1.20⌉  — the legacy recommended fleet
}

/** Legacy fleet size for one vehicle type from its raw demand. Per-stage ceilings. */
export function legacyFleetSize(groupRaw: number): LegacySizing {
  const raw = Math.max(0, groupRaw)
  const afterCharging = Math.ceil(raw / LEGACY_CHARGE_AVAILABILITY)
  const fleet = Math.ceil(afterCharging * (1 + LEGACY_BUFFER))
  return { raw, afterCharging, fleet }
}
