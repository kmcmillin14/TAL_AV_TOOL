// Declarative suitability-gate registry. PURE — no React, no I/O.
// Each gate is a GateSpec whose `run` resolves to a GateResult. qualifyVehicle
// (trafficLight.ts) just walks GATES and applies the GREEN/YELLOW/RED rollup.
// Adding a gate = appending one entry; SP3's comparison grid can iterate GATES.

import type { GateResult, Severity, ApplicationRequirements } from './types'
import type { Vehicle } from '../lib/vehicleLibrary'

const SKIP_REASON = 'No requirement provided'

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
  req: (app: ApplicationRequirements) => number | null | undefined
  present: (r: number) => boolean
  veh: (v: Vehicle) => number
  pass: (veh: number, req: number) => boolean
  delta: (veh: number, req: number) => number
  fmt: (n: number) => string
  reason: (passed: boolean, veh: number, req: number, delta: number) => string
}): GateSpec {
  return {
    id: o.gateId,
    name: o.name,
    severity: 'hard',
    run(vehicle, app) {
      const vehVal = o.veh(vehicle)
      const reqRaw = o.req(app)
      if (reqRaw == null || !o.present(reqRaw)) {
        return skippedGate(o.gateId, o.name, 'hard', o.fmt(vehVal), o.unit)
      }
      const passed = o.pass(vehVal, reqRaw)
      const delta = o.delta(vehVal, reqRaw)
      return {
        gateId: o.gateId,
        name: o.name,
        severity: 'hard',
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

/** Required-capability boolean gate (outdoor, freezer). */
function booleanGate(o: {
  gateId: string
  name: string
  required: (app: ApplicationRequirements) => boolean | undefined
  capable: (v: Vehicle) => boolean
  yes: string
  no: string
}): GateSpec {
  return {
    id: o.gateId,
    name: o.name,
    severity: 'hard',
    run(vehicle, app) {
      const cap = o.capable(vehicle)
      if (!o.required(app)) return skippedGate(o.gateId, o.name, 'hard', cap ? 'Yes' : 'No')
      return {
        gateId: o.gateId,
        name: o.name,
        severity: 'hard',
        passed: cap,
        skipped: false,
        vehicleValue: cap ? 'Yes' : 'No',
        requiredValue: 'Required',
        reason: cap ? o.yes : o.no,
      }
    },
  }
}

/** Load-dimension gate (length/width/height) — distinct "no requirement" vs
 *  "vehicle has no load deck" skip paths. */
function loadDimensionGate(
  gateId: string,
  name: string,
  vehicleMax: number | null | undefined,
  required: number | null | undefined,
  unit = 'in',
): GateResult {
  if (required == null || required <= 0) {
    return skippedGate(gateId, name, 'hard', vehicleMax != null ? `${vehicleMax} ${unit}` : 'n/a', unit)
  }
  if (vehicleMax == null) {
    return {
      gateId,
      name,
      severity: 'hard',
      passed: true,
      skipped: true,
      skipReason: 'Vehicle has no load deck',
      vehicleValue: 'n/a',
      requiredValue: `${required} ${unit}`,
      requiredNumeric: required,
      unit,
      reason: 'Not evaluated — vehicle has no load deck (tugger/tow class)',
    }
  }
  const passed = vehicleMax >= required
  const delta = vehicleMax - required
  return {
    gateId,
    name,
    severity: 'hard',
    passed,
    skipped: false,
    vehicleValue: `${vehicleMax} ${unit}`,
    requiredValue: `${required} ${unit}`,
    vehicleNumeric: vehicleMax,
    requiredNumeric: required,
    unit,
    delta,
    reason: passed
      ? `Deck accepts ${vehicleMax} ${unit} vs. ${required} ${unit} required`
      : `Deck only ${vehicleMax} ${unit}, need ${required} ${unit} (${Math.abs(delta).toFixed(1)} ${unit} short)`,
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

  { id: 'load_length', name: 'Load Length', severity: 'hard',
    run: (v, a) => loadDimensionGate('load_length', 'Load Length', v.calc.maxLoadLengthIn, a.loadLengthIn) },
  { id: 'load_width', name: 'Load Width', severity: 'hard',
    run: (v, a) => loadDimensionGate('load_width', 'Load Width', v.calc.maxLoadWidthIn, a.loadWidthIn) },
  { id: 'load_height', name: 'Load Height', severity: 'hard',
    run: (v, a) => loadDimensionGate('load_height', 'Load Height', v.calc.maxLoadHeightIn, a.loadHeightIn) },

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

  { id: 'lift_height', name: 'Lift Height', severity: 'hard',
    run(vehicle, app) {
      const requiresLift = deliveryPatternRequiresLift(app.deliveryPattern)
      const liftReq = app.maxLiftHeightFt
      if (requiresLift && liftReq != null && liftReq > 0) {
        // Vehicle with no lift capability at all (tugger/tow class, null in JSON)
        if (vehicle.calc.maxLiftHeightFt == null) {
          return {
            gateId: 'lift_height', name: 'Lift Height', severity: 'hard', passed: false, skipped: false,
            vehicleValue: 'No lift', requiredValue: `${liftReq} ft`,
            vehicleNumeric: 0, requiredNumeric: liftReq, unit: 'ft', delta: -liftReq,
            reason: 'No lift capability — floor-level transport only',
          }
        }
        const vehLift = vehicle.calc.maxLiftHeightFt
        const passed = vehLift >= liftReq
        const delta = vehLift - liftReq
        return {
          gateId: 'lift_height', name: 'Lift Height', severity: 'hard', passed, skipped: false,
          vehicleValue: `${vehLift} ft`, requiredValue: `${liftReq} ft`,
          vehicleNumeric: vehLift, requiredNumeric: liftReq, unit: 'ft', delta,
          reason: passed
            ? `Lifts to ${vehLift} ft vs. ${liftReq} ft required`
            : `Lifts to ${vehLift} ft, need ${liftReq} ft (${Math.abs(delta).toFixed(1)} ft short)`,
        }
      }
      const reason = !requiresLift ? 'Delivery pattern does not involve height' : SKIP_REASON
      const vehLiftDisplay = vehicle.calc.maxLiftHeightFt != null ? `${vehicle.calc.maxLiftHeightFt} ft` : 'No lift'
      return skippedGate('lift_height', 'Lift Height', 'hard', vehLiftDisplay, 'ft', reason)
    } },

  booleanGate({
    gateId: 'outdoor', name: 'Outdoor Capable',
    required: a => a.outdoorRequired, capable: v => v.specs.outdoorCapable,
    yes: 'Vehicle rated for outdoor operation', no: 'Vehicle is not outdoor-rated',
  }),
  booleanGate({
    gateId: 'freezer', name: 'Freezer Capable',
    required: a => a.freezerCapable, capable: v => v.specs.freezerCapable,
    yes: 'Vehicle rated for freezer operation', no: 'Vehicle is not freezer-rated',
  }),

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

  numericGate({
    gateId: 'ramp', name: 'Ramp Grade', unit: '%',
    req: a => a.maxRampGrade, present: r => r > 0,
    veh: v => v.specs.maxRampGrade,
    pass: (veh, req) => veh >= req,
    delta: (veh, req) => veh - req,
    fmt: n => `${n}%`,
    reason: (passed, veh, req) => passed
      ? `Handles ${veh}% vs. ${req}% required`
      : `Handles only ${veh}%, need ${req}%`,
  }),

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
