// Declarative suitability-gate registry. PURE — no React, no I/O.
// Each gate is a GateSpec whose `run` resolves to a GateResult. qualifyVehicle
// (trafficLight.ts) just walks GATES and applies the GREEN/YELLOW/RED rollup.
// Adding a gate = appending one entry; SP3's comparison grid can iterate GATES.

import type { GateResult, Severity, ApplicationRequirements } from './types'
import type { Vehicle, LiftClass } from '../lib/vehicleLibrary'

const SKIP_REASON = 'No requirement provided'

/** Human label for each vertical-transfer class (gate reasons + spec display). */
export const LIFT_CLASS_LABEL: Record<LiftClass, string> = {
  forklift: 'Forklift (lifts to height)',
  lift_table: 'Lift table (matched height)',
  floor: 'Floor-to-floor',
}

/** Whether a delivery pattern implies a vertical lift — and therefore a
 *  lift-height hard gate. Shared by the gate engine and the Step 1 form so the
 *  rule has one definition. (Re-exported from trafficLight.ts for consumers.) */
export function deliveryPatternRequiresLift(deliveryPattern?: string | null): boolean {
  return !!deliveryPattern && (
    deliveryPattern.includes('Height') ||
    deliveryPattern === 'Conveyor-Conveyor'
  )
}

export interface GateSpec {
  id: string
  name: string
  severity: Severity
  run(vehicle: Vehicle, app: ApplicationRequirements): GateResult
}

function skippedGate(
  gateId: string,
  name: string,
  severity: Severity,
  vehicleValue: string,
  unit?: string,
  skipReason: string = SKIP_REASON,
): GateResult {
  return {
    gateId,
    name,
    severity,
    passed: true,
    skipped: true,
    skipReason,
    vehicleValue,
    requiredValue: '—',
    unit,
    reason: `Not evaluated — ${skipReason.toLowerCase()}`,
  }
}

// ── Factory helpers for the recurring gate shapes ────────────────────────────

/** Numeric comparison gate (weight, ramp, temperatures). `present` decides when
 *  a requirement counts as given; `fmt` renders both the vehicle and required
 *  display strings (unit included). */
function numericGate(o: {
  gateId: string
  name: string
  unit: string
  /** Defaults to 'hard' (RED on fail). 'soft' makes a miss a YELLOW preference. */
  severity?: Severity
  req: (app: ApplicationRequirements) => number | null | undefined
  present: (r: number) => boolean
  veh: (v: Vehicle) => number
  pass: (veh: number, req: number) => boolean
  delta: (veh: number, req: number) => number
  fmt: (n: number) => string
  reason: (passed: boolean, veh: number, req: number, delta: number) => string
}): GateSpec {
  const severity: Severity = o.severity ?? 'hard'
  return {
    id: o.gateId,
    name: o.name,
    severity,
    run(vehicle, app) {
      const vehVal = o.veh(vehicle)
      const reqRaw = o.req(app)
      if (reqRaw == null || !o.present(reqRaw)) {
        return skippedGate(o.gateId, o.name, severity, o.fmt(vehVal), o.unit)
      }
      const passed = o.pass(vehVal, reqRaw)
      const delta = o.delta(vehVal, reqRaw)
      return {
        gateId: o.gateId,
        name: o.name,
        severity,
        passed,
        skipped: false,
        vehicleValue: o.fmt(vehVal),
        requiredValue: o.fmt(reqRaw),
        vehicleNumeric: vehVal,
        requiredNumeric: reqRaw,
        unit: o.unit,
        delta,
        reason: o.reason(passed, vehVal, reqRaw, delta),
      }
    },
  }
}


// ── The registry (evaluation order preserved from the original code) ─────────

export const GATES: readonly GateSpec[] = [
  numericGate({
    gateId: 'weight', name: 'Weight Capacity', unit: 'lbs',
    req: a => a.maxLoadWeightLbs, present: r => r > 0,
    veh: v => v.calc.maxWeightLbs,
    pass: (veh, req) => veh >= req,
    delta: (veh, req) => veh - req,
    fmt: n => `${n.toLocaleString()} lbs`,
    reason: (passed, veh, req, delta) => passed
      ? `Rated ${veh.toLocaleString()} lbs vs. ${req.toLocaleString()} lbs required (${delta.toLocaleString()} lbs headroom)`
      : `Vehicle rated ${veh.toLocaleString()} lbs, need ${req.toLocaleString()} lbs (${Math.abs(delta).toLocaleString()} lbs short)`,
  }),

{ id: 'payload_type', name: 'Payload Type', severity: 'hard',
    run(vehicle, app) {
      const unitType = app.typicalUnitType?.trim()
      if (!unitType) return skippedGate('payload_type', 'Payload Type', 'hard', vehicle.payloadTypes.join(', ') || 'None')
      const supports = vehicle.payloadTypes.includes(unitType)
      return {
        gateId: 'payload_type', name: 'Payload Type', severity: 'hard', passed: supports, skipped: false,
        vehicleValue: vehicle.payloadTypes.join(', ') || 'None', requiredValue: unitType,
        reason: supports
          ? `Carries ${unitType}`
          : `Does not carry ${unitType}. Carries: ${vehicle.payloadTypes.join(', ') || 'none'}`,
      }
    } },

  { id: 'transfer_method', name: 'Transfer Method', severity: 'hard',
    run(vehicle, app) {
      const transferReq = app.transferMethod?.trim()
      const methods = vehicle.transferMethods.map(tm => tm.method)
      if (!transferReq) return skippedGate('transfer_method', 'Transfer Method', 'hard', methods.join(', ') || '—')
      const supports = methods.some(m => m.toLowerCase() === transferReq.toLowerCase())
      return {
        gateId: 'transfer_method', name: 'Transfer Method', severity: 'hard', passed: supports, skipped: false,
        vehicleValue: methods.join(', ') || '—', requiredValue: transferReq,
        reason: supports
          ? `Supports ${transferReq}`
          : `Does not support ${transferReq}. Supports: ${methods.join(', ') || 'none'}`,
      }
    } },

  { id: 'lift_height', name: 'Lift / Transfer', severity: 'hard',
    run(vehicle, app) {
      // Resolve pick/drop heights; fall back to the legacy single "lift to"
      // requirement (treated as a floor→drop lift) for pre-pick/drop projects.
      const pick = app.pickHeightFt ?? 0
      const drop = app.dropHeightFt
        ?? (app.pickHeightFt == null ? (app.maxLiftHeightFt ?? 0) : 0)
      const hi = Math.max(pick, drop)
      const klass = vehicle.calc.liftClass
      const typeLabel = LIFT_CLASS_LABEL[klass]

      // No above-floor transfer requested → not a differentiator, skip.
      if (hi <= 0) {
        return skippedGate('lift_height', 'Lift / Transfer', 'hard', typeLabel, 'ft')
      }

      const sameHeight = Math.abs(drop - pick) < 0.01
      const reqDesc = sameHeight ? `transfer at ${hi} ft` : `lift ${pick}→${drop} ft`

      if (klass === 'forklift') {
        const reach = vehicle.calc.maxLiftHeightFt ?? 0
        const passed = reach >= hi
        return {
          gateId: 'lift_height', name: 'Lift / Transfer', severity: 'hard', passed, skipped: false,
          vehicleValue: `Forklift · ${reach} ft reach`, requiredValue: reqDesc,
          vehicleNumeric: reach, requiredNumeric: hi, unit: 'ft', delta: reach - hi,
          reason: passed
            ? `Forklift reaches ${reach} ft — covers ${reqDesc}`
            : `Forklift reaches only ${reach} ft, need ${hi} ft`,
        }
      }
      if (klass === 'lift_table') {
        return {
          gateId: 'lift_height', name: 'Lift / Transfer', severity: 'hard', passed: sameHeight, skipped: false,
          vehicleValue: 'Lift table · matched height', requiredValue: reqDesc,
          vehicleNumeric: 0, requiredNumeric: hi, unit: 'ft', delta: 0,
          reason: sameHeight
            ? `Lift table transfers at a matched height (${hi} ft)`
            : `Lift table needs equal pick/drop — application changes elevation ${pick}→${drop} ft`,
        }
      }
      // floor-to-floor: cannot transfer above the ground at all
      return {
        gateId: 'lift_height', name: 'Lift / Transfer', severity: 'hard', passed: false, skipped: false,
        vehicleValue: 'Floor-to-floor', requiredValue: reqDesc,
        vehicleNumeric: 0, requiredNumeric: hi, unit: 'ft', delta: -hi,
        reason: `Floor-to-floor only — cannot ${reqDesc}`,
      }
    } },

  // Operating environment. Tri-state: unset → skipped ("Not set"); Indoor
  // (false) → green pass (any vehicle works indoors); Outdoor (true) → hard,
  // vehicle must be outdoor-rated.
  { id: 'outdoor', name: 'Operating Environment', severity: 'hard',
    run(vehicle, app) {
      const req = app.outdoorRequired
      const cap = vehicle.specs.outdoorCapable
      if (req == null) return skippedGate('outdoor', 'Operating Environment', 'hard', cap ? 'Outdoor-rated' : 'Indoor only')
      if (req === false) {
        return {
          gateId: 'outdoor', name: 'Operating Environment', severity: 'hard', passed: true, skipped: false,
          vehicleValue: 'Indoor', requiredValue: 'Indoor',
          reason: 'Indoor operation — compatible',
        }
      }
      return {
        gateId: 'outdoor', name: 'Operating Environment', severity: 'hard', passed: cap, skipped: false,
        vehicleValue: cap ? 'Outdoor-rated' : 'Indoor only', requiredValue: 'Outdoor',
        reason: cap ? 'Vehicle rated for outdoor operation' : 'Vehicle is not outdoor-rated',
      }
    } },
  // Temperature environment — ONE gate with answer-driven severity. Unset →
  // skipped ("Not set"); Ambient → green pass; Refrigerated → SOFT (YELLOW) if
  // the vehicle isn't cold-rated; Freezer → HARD (RED) if not freezer-rated.
  // Falls back to the legacy freezerCapable boolean (true ⇒ Freezer).
  { id: 'temperature_env', name: 'Temperature', severity: 'hard',
    run(vehicle, app) {
      const env = app.temperatureEnvironment ?? (app.freezerCapable ? 'freezer' : undefined)
      const cap = vehicle.specs.freezerCapable
      if (env == null) return skippedGate('temperature_env', 'Temperature', 'hard', cap ? 'Freezer-rated' : 'Ambient')
      if (env === 'ambient') {
        return {
          gateId: 'temperature_env', name: 'Temperature', severity: 'hard', passed: true, skipped: false,
          vehicleValue: 'Ambient', requiredValue: 'Ambient',
          reason: 'Ambient environment — no thermal constraint',
        }
      }
      if (env === 'refrigerated') {
        return {
          gateId: 'temperature_env', name: 'Temperature', severity: 'soft', passed: cap, skipped: false,
          vehicleValue: cap ? 'Freezer-rated' : 'Ambient', requiredValue: 'Refrigerated',
          reason: cap ? 'Vehicle rated for cold/refrigerated operation' : 'Refrigerated rating unconfirmed — verify with vendor',
        }
      }
      // freezer
      return {
        gateId: 'temperature_env', name: 'Temperature', severity: 'hard', passed: cap, skipped: false,
        vehicleValue: cap ? 'Freezer-rated' : 'Ambient', requiredValue: 'Freezer',
        reason: cap ? 'Vehicle rated for freezer operation' : 'Vehicle is not freezer-rated',
      }
    } },

  // Temps follow the app-wide "0/empty = no requirement" sentinel convention
  // (same as weight and ramp). Real freezer requirements are negative °F —
  // those evaluate; a stray 0 from a partial project skips.
  numericGate({
    gateId: 'temp_min', name: 'Min Temperature', unit: '°F',
    req: a => a.tempMinF, present: r => r !== 0,
    veh: v => v.specs.tempMinF,
    pass: (veh, req) => veh <= req,
    delta: (veh, req) => req - veh,
    fmt: n => `${n}°F`,
    reason: (passed, veh, req) => passed
      ? `Rated to ${veh}°F vs. ${req}°F required`
      : `Rated only to ${veh}°F, need ${req}°F`,
  }),
  numericGate({
    gateId: 'temp_max', name: 'Max Temperature', unit: '°F',
    req: a => a.tempMaxF, present: r => r !== 0,
    veh: v => v.specs.tempMaxF,
    pass: (veh, req) => veh >= req,
    delta: (veh, req) => veh - req,
    fmt: n => `${n}°F`,
    reason: (passed, veh, req) => passed
      ? `Rated to ${veh}°F vs. ${req}°F required`
      : `Rated only to ${veh}°F, need ${req}°F`,
  }),

  // Ramp: a Yes/No requirement. When the site has a ramp it's always a YELLOW
  // review (gradeability needs a site check) — never auto-passes. Falls back to
  // the legacy `maxRampGrade > 0` for projects predating `rampRequired`.
  // Ramp. Tri-state: unset → skipped ("Not set"); No (false) → green pass; Yes
  // (true, or legacy maxRampGrade > 0) → soft YELLOW site review regardless of
  // rated grade. Soft — never blocks.
  { id: 'ramp', name: 'Ramp', severity: 'soft',
    run(vehicle, app) {
      const veh = vehicle.specs.maxRampGrade
      const legacyRamp = (app.maxRampGrade ?? 0) > 0
      if (app.rampRequired == null && !legacyRamp) {
        return skippedGate('ramp', 'Ramp', 'soft', `${veh}%`, '%')
      }
      if (app.rampRequired === false) {
        return {
          gateId: 'ramp', name: 'Ramp', severity: 'soft', passed: true, skipped: false,
          vehicleValue: 'No ramps', requiredValue: 'No ramps',
          reason: 'No ramps on site',
        }
      }
      const grade = app.maxRampGrade ?? 0
      return {
        gateId: 'ramp', name: 'Ramp', severity: 'soft', passed: false, skipped: false,
        vehicleValue: `${veh}%`, requiredValue: grade > 0 ? `${grade}%` : 'Ramp on site',
        vehicleNumeric: veh, requiredNumeric: grade, unit: '%', delta: veh - grade,
        reason: grade > 0
          ? `Ramp on site (${grade}%) — verify gradeability (rated ${veh}%)`
          : `Ramp on site — verify gradeability (rated ${veh}%)`,
      }
    } },

  { id: 'certifications', name: 'Certifications', severity: 'soft',
    run(vehicle, app) {
      const requiredCerts = app.certifications?.filter(c => c && c.length > 0) ?? []
      if (requiredCerts.length === 0) {
        return skippedGate('certifications', 'Certifications', 'soft', vehicle.specs.certifications.join(', ') || 'None listed')
      }
      const vehicleCertsLower = vehicle.specs.certifications.map(c => c.toLowerCase())
      const missing = requiredCerts.filter(c => !vehicleCertsLower.includes(c.toLowerCase()))
      const passed = missing.length === 0
      return {
        gateId: 'certifications', name: 'Certifications', severity: 'soft', passed, skipped: false,
        vehicleValue: vehicle.specs.certifications.join(', ') || 'None listed', requiredValue: requiredCerts.join(', '),
        reason: passed
          ? 'All required certifications listed'
          : `Not listed: ${missing.join(', ')} — verify availability with vendor`,
      }
    } },
]
