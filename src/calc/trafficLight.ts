// Traffic Light qualification logic
// PURE FUNCTION — no React, no database, no side effects

import type { GateResult, QualificationResult, ApplicationRequirements } from './types'
import type { Vehicle } from '../lib/vehicleLibrary'

const SKIP_REASON = 'No requirement provided'

function skippedGate(
  gateId: string,
  name: string,
  severity: 'hard' | 'soft',
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
      : `Deck only ${vehicleMax} ${unit}, need ${required} ${unit} (${Math.abs(delta)} ${unit} short)`,
  }
}

export function qualifyVehicle(vehicle: Vehicle, app: ApplicationRequirements): QualificationResult {
  const hardGates: GateResult[] = []
  const softPreferences: GateResult[] = []

  // HARD: Weight
  const weightReq = app.maxLoadWeightLbs
  if (weightReq && weightReq > 0) {
    const passed = vehicle.calc.maxWeightLbs >= weightReq
    const delta = vehicle.calc.maxWeightLbs - weightReq
    hardGates.push({
      gateId: 'weight',
      name: 'Weight Capacity',
      severity: 'hard',
      passed,
      skipped: false,
      vehicleValue: `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`,
      requiredValue: `${weightReq.toLocaleString()} lbs`,
      vehicleNumeric: vehicle.calc.maxWeightLbs,
      requiredNumeric: weightReq,
      unit: 'lbs',
      delta,
      reason: passed
        ? `Rated ${vehicle.calc.maxWeightLbs.toLocaleString()} lbs vs. ${weightReq.toLocaleString()} lbs required (${delta.toLocaleString()} lbs headroom)`
        : `Vehicle rated ${vehicle.calc.maxWeightLbs.toLocaleString()} lbs, need ${weightReq.toLocaleString()} lbs (${Math.abs(delta).toLocaleString()} lbs short)`,
    })
  } else {
    hardGates.push(skippedGate('weight', 'Weight Capacity', 'hard', `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`, 'lbs'))
  }

  // HARD: Load Length / Width / Height
  hardGates.push(loadDimensionGate('load_length', 'Load Length', vehicle.calc.maxLoadLengthIn, app.loadLengthIn))
  hardGates.push(loadDimensionGate('load_width',  'Load Width',  vehicle.calc.maxLoadWidthIn,  app.loadWidthIn))
  hardGates.push(loadDimensionGate('load_height', 'Load Height', vehicle.calc.maxLoadHeightIn, app.loadHeightIn))

  // HARD: Payload Type Match
  const unitType = app.typicalUnitType?.trim()
  if (unitType) {
    const supports = vehicle.payloadTypes.includes(unitType)
    hardGates.push({
      gateId: 'payload_type',
      name: 'Payload Type',
      severity: 'hard',
      passed: supports,
      skipped: false,
      vehicleValue: vehicle.payloadTypes.join(', ') || 'None',
      requiredValue: unitType,
      reason: supports
        ? `Carries ${unitType}`
        : `Does not carry ${unitType}. Carries: ${vehicle.payloadTypes.join(', ') || 'none'}`,
    })
  } else {
    hardGates.push(skippedGate('payload_type', 'Payload Type', 'hard', vehicle.payloadTypes.join(', ') || 'None'))
  }

  // HARD: Transfer Method (canonical enum match — case-insensitive equality)
  const transferReq = app.transferMethod?.trim()
  if (transferReq) {
    const methods = vehicle.transferMethods.map(tm => tm.method)
    const supports = methods.some(m => m.toLowerCase() === transferReq.toLowerCase())
    hardGates.push({
      gateId: 'transfer_method',
      name: 'Transfer Method',
      severity: 'hard',
      passed: supports,
      skipped: false,
      vehicleValue: methods.join(', ') || '—',
      requiredValue: transferReq,
      reason: supports
        ? `Supports ${transferReq}`
        : `Does not support ${transferReq}. Supports: ${methods.join(', ') || 'none'}`,
    })
  } else {
    hardGates.push(skippedGate('transfer_method', 'Transfer Method', 'hard', vehicle.transferMethods.map(tm => tm.method).join(', ') || '—'))
  }

  // HARD: Lift Height (only when delivery pattern involves height)
  const requiresLift = !!app.deliveryPattern && (
    app.deliveryPattern.includes('Height') ||
    app.deliveryPattern === 'Conveyor-Conveyor'
  )
  const liftReq = app.maxLiftHeightFt
  if (requiresLift && liftReq != null && liftReq > 0) {
    const vehLift = vehicle.calc.maxLiftHeightFt ?? 0
    const passed = vehLift >= liftReq
    const delta = vehLift - liftReq
    hardGates.push({
      gateId: 'lift_height',
      name: 'Lift Height',
      severity: 'hard',
      passed,
      skipped: false,
      vehicleValue: `${vehLift} ft`,
      requiredValue: `${liftReq} ft`,
      vehicleNumeric: vehLift,
      requiredNumeric: liftReq,
      unit: 'ft',
      delta,
      reason: passed
        ? `Lifts to ${vehLift} ft vs. ${liftReq} ft required`
        : `Lifts to ${vehLift} ft, need ${liftReq} ft (${Math.abs(delta).toFixed(1)} ft short)`,
    })
  } else {
    const reason = !requiresLift
      ? 'Delivery pattern does not involve height'
      : SKIP_REASON
    hardGates.push(skippedGate('lift_height', 'Lift Height', 'hard', `${vehicle.calc.maxLiftHeightFt ?? 0} ft`, 'ft', reason))
  }

  // HARD: Outdoor capability
  if (app.outdoorRequired) {
    const passed = vehicle.specs.outdoorCapable
    hardGates.push({
      gateId: 'outdoor',
      name: 'Outdoor Capable',
      severity: 'hard',
      passed,
      skipped: false,
      vehicleValue: vehicle.specs.outdoorCapable ? 'Yes' : 'No',
      requiredValue: 'Required',
      reason: passed
        ? 'Vehicle rated for outdoor operation'
        : 'Vehicle is not outdoor-rated',
    })
  } else {
    hardGates.push(skippedGate('outdoor', 'Outdoor Capable', 'hard', vehicle.specs.outdoorCapable ? 'Yes' : 'No'))
  }

  // HARD: Freezer capability
  if (app.freezerCapable) {
    const passed = vehicle.specs.freezerCapable
    hardGates.push({
      gateId: 'freezer',
      name: 'Freezer Capable',
      severity: 'hard',
      passed,
      skipped: false,
      vehicleValue: vehicle.specs.freezerCapable ? 'Yes' : 'No',
      requiredValue: 'Required',
      reason: passed
        ? 'Vehicle rated for freezer operation'
        : 'Vehicle is not freezer-rated',
    })
  } else {
    hardGates.push(skippedGate('freezer', 'Freezer Capable', 'hard', vehicle.specs.freezerCapable ? 'Yes' : 'No'))
  }

  // HARD: Min temperature
  if (app.tempMinF != null) {
    const passed = vehicle.specs.tempMinF <= app.tempMinF
    const delta = app.tempMinF - vehicle.specs.tempMinF
    hardGates.push({
      gateId: 'temp_min',
      name: 'Min Temperature',
      severity: 'hard',
      passed,
      skipped: false,
      vehicleValue: `${vehicle.specs.tempMinF}°F`,
      requiredValue: `${app.tempMinF}°F`,
      vehicleNumeric: vehicle.specs.tempMinF,
      requiredNumeric: app.tempMinF,
      unit: '°F',
      delta,
      reason: passed
        ? `Rated to ${vehicle.specs.tempMinF}°F vs. ${app.tempMinF}°F required`
        : `Rated only to ${vehicle.specs.tempMinF}°F, need ${app.tempMinF}°F`,
    })
  } else {
    hardGates.push(skippedGate('temp_min', 'Min Temperature', 'hard', `${vehicle.specs.tempMinF}°F`, '°F'))
  }

  // HARD: Max temperature
  if (app.tempMaxF != null) {
    const passed = vehicle.specs.tempMaxF >= app.tempMaxF
    const delta = vehicle.specs.tempMaxF - app.tempMaxF
    hardGates.push({
      gateId: 'temp_max',
      name: 'Max Temperature',
      severity: 'hard',
      passed,
      skipped: false,
      vehicleValue: `${vehicle.specs.tempMaxF}°F`,
      requiredValue: `${app.tempMaxF}°F`,
      vehicleNumeric: vehicle.specs.tempMaxF,
      requiredNumeric: app.tempMaxF,
      unit: '°F',
      delta,
      reason: passed
        ? `Rated to ${vehicle.specs.tempMaxF}°F vs. ${app.tempMaxF}°F required`
        : `Rated only to ${vehicle.specs.tempMaxF}°F, need ${app.tempMaxF}°F`,
    })
  } else {
    hardGates.push(skippedGate('temp_max', 'Max Temperature', 'hard', `${vehicle.specs.tempMaxF}°F`, '°F'))
  }

  // HARD: Ramp grade
  if (app.maxRampGrade != null && app.maxRampGrade > 0) {
    const passed = vehicle.specs.maxRampGrade >= app.maxRampGrade
    const delta = vehicle.specs.maxRampGrade - app.maxRampGrade
    hardGates.push({
      gateId: 'ramp',
      name: 'Ramp Grade',
      severity: 'hard',
      passed,
      skipped: false,
      vehicleValue: `${vehicle.specs.maxRampGrade}%`,
      requiredValue: `${app.maxRampGrade}%`,
      vehicleNumeric: vehicle.specs.maxRampGrade,
      requiredNumeric: app.maxRampGrade,
      unit: '%',
      delta,
      reason: passed
        ? `Handles ${vehicle.specs.maxRampGrade}% vs. ${app.maxRampGrade}% required`
        : `Handles only ${vehicle.specs.maxRampGrade}%, need ${app.maxRampGrade}%`,
    })
  } else {
    hardGates.push(skippedGate('ramp', 'Ramp Grade', 'hard', `${vehicle.specs.maxRampGrade}%`, '%'))
  }

  // SOFT: Certifications
  const requiredCerts = app.certifications?.filter(c => c && c.length > 0) ?? []
  if (requiredCerts.length > 0) {
    const vehicleCertsLower = vehicle.specs.certifications.map(c => c.toLowerCase())
    const missing = requiredCerts.filter(c => !vehicleCertsLower.includes(c.toLowerCase()))
    const passed = missing.length === 0
    softPreferences.push({
      gateId: 'certifications',
      name: 'Certifications',
      severity: 'soft',
      passed,
      skipped: false,
      vehicleValue: vehicle.specs.certifications.join(', ') || 'None listed',
      requiredValue: requiredCerts.join(', '),
      reason: passed
        ? 'All required certifications listed'
        : `Not listed: ${missing.join(', ')} — verify availability with vendor`,
    })
  } else {
    softPreferences.push(skippedGate('certifications', 'Certifications', 'soft', vehicle.specs.certifications.join(', ') || 'None listed'))
  }

  // ────────────────────────────────────────────────────────────
  // Decide status — non-skipped failures only
  // ────────────────────────────────────────────────────────────
  const hardFail = hardGates.some(g => !g.skipped && !g.passed)
  if (hardFail) return { status: 'RED', hardGates, softPreferences }

  const softFail = softPreferences.some(g => !g.skipped && !g.passed)
  if (softFail) return { status: 'YELLOW', hardGates, softPreferences }

  return { status: 'GREEN', hardGates, softPreferences }
}
