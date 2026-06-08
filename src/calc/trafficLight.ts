// Traffic Light qualification logic
// PURE FUNCTION — no React, no database, no side effects.
// Gate definitions live in ./gates as a declarative registry; this file just
// walks them and applies the GREEN/YELLOW/RED rollup.

import type { QualificationResult, ApplicationRequirements } from './types'
import type { Vehicle } from '../lib/vehicleLibrary'
import { GATES, deliveryPatternRequiresLift } from './gates'

// Re-exported for the Step 1 form, which gates the lift-height question on it.
export { deliveryPatternRequiresLift }

export function qualifyVehicle(vehicle: Vehicle, app: ApplicationRequirements): QualificationResult {
  const hardGates = []
  const softPreferences = []
  for (const spec of GATES) {
    const result = spec.run(vehicle, app)
    if (spec.severity === 'soft') softPreferences.push(result)
    else hardGates.push(result)
  }

  // Status — non-skipped failures only.
  const hardFail = hardGates.some(g => !g.skipped && !g.passed)
  if (hardFail) return { status: 'RED', hardGates, softPreferences }

  const softFail = softPreferences.some(g => !g.skipped && !g.passed)
  if (softFail) return { status: 'YELLOW', hardGates, softPreferences }

  return { status: 'GREEN', hardGates, softPreferences }
}
