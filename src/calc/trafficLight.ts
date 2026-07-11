// Traffic Light qualification logic
// PURE FUNCTION — no React, no database, no side effects.
// Gate definitions live in ./gates as a declarative registry; this file walks
// them and applies the GREEN/YELLOW/RED rollup — including the multi-load
// rollup: the 5 load-coupled gates run once per declared load, everything else
// runs once.

import type {
  QualificationResult,
  ApplicationRequirements,
  GateResult,
  LoadSpec,
  LoadVerdict,
} from './types'
import type { Vehicle } from '../lib/vehicleLibrary'
import { GATES, deliveryPatternRequiresLift } from './gates'

// Re-exported for the Step 1 form, which gates the lift-height question on it.
export { deliveryPatternRequiresLift }

/** The gates whose inputs belong to a LOAD (not the application/site). With
 *  multiple loads these run once per load; all other gates run once. */
const LOAD_COUPLED_GATES = new Set(['weight', 'payload_type', 'load_length', 'load_width', 'load_height'])

/** Project one load onto the requirements shape so the existing gate specs run
 *  unchanged. Per-load weight falls back to the project-wide max weight. */
function loadProjection(app: ApplicationRequirements, load: LoadSpec): ApplicationRequirements {
  return {
    ...app,
    maxLoadWeightLbs: load.weightLbs ?? app.maxLoadWeightLbs,
    typicalUnitType: load.unitType,
    loadLengthIn: load.lengthIn,
    loadWidthIn: load.widthIn,
    loadHeightIn: load.heightIn,
  }
}

export function qualifyVehicle(vehicle: Vehicle, app: ApplicationRequirements): QualificationResult {
  const loads = app.loads ?? []
  const useLoads = loads.length > 0

  const hardGates: GateResult[] = []
  const softPreferences: GateResult[] = []

  // Load-independent gates (transfer, lift, environment, certs…) — and, on the
  // legacy no-loads path, the load-coupled gates against the singular fields,
  // preserving pre-loads behavior bit-for-bit.
  for (const spec of GATES) {
    if (useLoads && LOAD_COUPLED_GATES.has(spec.id)) continue
    const result = spec.run(vehicle, app)
    // Group by the RESULT's severity, not the spec's — a gate may decide its
    // severity from the answer (e.g. Temperature: Refrigerated = soft/YELLOW,
    // Freezer = hard/RED).
    if (result.severity === 'soft') softPreferences.push(result)
    else hardGates.push(result)
  }
  const independentHardFail = hardGates.some(g => !g.skipped && !g.passed)

  // Per-load evaluation of the load-coupled gates.
  let perLoad: LoadVerdict[] | undefined
  if (useLoads) {
    perLoad = []
    for (const load of loads) {
      const projected = loadProjection(app, load)
      const failedGates: string[] = []
      for (const spec of GATES) {
        if (!LOAD_COUPLED_GATES.has(spec.id)) continue
        const r = spec.run(vehicle, projected)
        // With several loads, suffix the row so Step 2's breakdown reads
        // per-load ("Payload Type — Tote"); a single load keeps clean names.
        hardGates.push(loads.length > 1 && load.unitType ? { ...r, name: `${r.name} — ${load.unitType}` } : r)
        if (!r.skipped && !r.passed) failedGates.push(spec.id)
      }
      perLoad.push({
        loadId: load.loadId,
        unitType: load.unitType,
        passed: failedGates.length === 0,
        failedGates,
      })
    }
  }

  // Rollup. Load-independent hard fail → RED, always. Otherwise multi-load:
  // every load passes → soft check; some pass → YELLOW (conservative GREEN —
  // the engineer sees which loads fit); none pass → RED.
  // The perLoad key is omitted (not set undefined) on the legacy path so the
  // result shape — and the characterization snapshot — is unchanged.
  const detail = perLoad ? { perLoad } : {}
  if (independentHardFail) return { status: 'RED', hardGates, softPreferences, ...detail }
  if (perLoad) {
    if (!perLoad.some(l => l.passed)) return { status: 'RED', hardGates, softPreferences, ...detail }
    if (!perLoad.every(l => l.passed)) return { status: 'YELLOW', hardGates, softPreferences, ...detail }
  }

  // No hard gate fails. If any hard gate is still unanswered, qualification
  // isn't done — show INCOMPLETE ("In Progress") rather than claim Compatible.
  const hardIncomplete = hardGates.some(g => g.skipped)
  if (hardIncomplete) return { status: 'INCOMPLETE', hardGates, softPreferences, ...detail }

  const softFail = softPreferences.some(g => !g.skipped && !g.passed)
  if (softFail) return { status: 'YELLOW', hardGates, softPreferences, ...detail }

  return { status: 'GREEN', hardGates, softPreferences, ...detail }
}
