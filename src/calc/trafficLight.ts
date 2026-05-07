// Traffic Light qualification logic
// PURE FUNCTION — no React, no database, no side effects

import type { GateResult, QualificationResult, ApplicationRequirements } from './types'
import type { Vehicle } from '../lib/vehicleLibrary'

export function qualifyVehicle(vehicle: Vehicle, app: ApplicationRequirements): QualificationResult {
  const hardGates: GateResult[] = []
  const softPreferences: GateResult[] = []

  // HARD GATE 1: Weight capacity (only if a weight requirement was set)
  if (app.maxLoadWeightLbs && app.maxLoadWeightLbs > 0) {
    hardGates.push({
      name: 'Weight Capacity',
      vehicleValue: `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs`,
      requiredValue: `${app.maxLoadWeightLbs.toLocaleString()} lbs`,
      passed: vehicle.calc.maxWeightLbs >= app.maxLoadWeightLbs,
      reason: vehicle.calc.maxWeightLbs < app.maxLoadWeightLbs
        ? `Vehicle rated ${vehicle.calc.maxWeightLbs.toLocaleString()} lbs, need ${app.maxLoadWeightLbs.toLocaleString()} lbs`
        : undefined,
    })
  }

  // HARD GATE 2: Lift height (only if delivery pattern requires height AND lift height was set)
  const requiresLift = app.deliveryPattern &&
    (app.deliveryPattern.includes('Height') || app.deliveryPattern === 'Height-Height' ||
     app.deliveryPattern === 'Floor-Height' || app.deliveryPattern === 'Height-Floor')

  if (requiresLift && app.maxLiftHeightFt != null && app.maxLiftHeightFt > 0) {
    const passed = vehicle.calc.maxLiftHeightFt >= app.maxLiftHeightFt
    hardGates.push({
      name: 'Lift Height',
      vehicleValue: `${vehicle.calc.maxLiftHeightFt} ft`,
      requiredValue: `${app.maxLiftHeightFt} ft`,
      passed,
      reason: !passed
        ? `Vehicle lifts to ${vehicle.calc.maxLiftHeightFt} ft, need ${app.maxLiftHeightFt} ft`
        : undefined,
    })
  }

  // HARD GATE 3: Transfer method (only if a method was specified)
  if (app.transferMethod && app.transferMethod.length > 0) {
    const supportsMethod = vehicle.transferMethods.some(
      tm => tm.method.toLowerCase() === app.transferMethod.toLowerCase()
    )
    hardGates.push({
      name: 'Transfer Method',
      vehicleValue: vehicle.transferMethods.map(tm => tm.method).join(', '),
      requiredValue: app.transferMethod,
      passed: supportsMethod,
      reason: !supportsMethod
        ? `Vehicle supports: ${vehicle.transferMethods.map(tm => tm.method).join(', ')}`
        : undefined,
    })
  }

  // HARD GATE 4: Certifications (ALL required must be present)
  const requiredCerts = app.certifications?.filter(c => c.length > 0) || []
  if (requiredCerts.length > 0) {
    const hasCerts = requiredCerts.every(c =>
      vehicle.specs.certifications.map(vc => vc.toLowerCase()).includes(c.toLowerCase())
    )
    const missing = requiredCerts.filter(
      c => !vehicle.specs.certifications.map(vc => vc.toLowerCase()).includes(c.toLowerCase())
    )
    hardGates.push({
      name: 'Certifications',
      vehicleValue: vehicle.specs.certifications.join(', ') || 'None',
      requiredValue: requiredCerts.join(', '),
      passed: hasCerts,
      reason: !hasCerts ? `Missing: ${missing.join(', ')}` : undefined,
    })
  }

  // HARD GATE 5: Temperature range (if provided)
  if (app.tempMinF != null) {
    const passed = vehicle.specs.tempMinF <= app.tempMinF
    hardGates.push({
      name: 'Min Temperature',
      vehicleValue: `${vehicle.specs.tempMinF}°F`,
      requiredValue: `${app.tempMinF}°F`,
      passed,
      reason: !passed
        ? `Vehicle rated to ${vehicle.specs.tempMinF}°F, need ${app.tempMinF}°F`
        : undefined,
    })
  }
  if (app.tempMaxF != null) {
    const passed = vehicle.specs.tempMaxF >= app.tempMaxF
    hardGates.push({
      name: 'Max Temperature',
      vehicleValue: `${vehicle.specs.tempMaxF}°F`,
      requiredValue: `${app.tempMaxF}°F`,
      passed,
      reason: !passed
        ? `Vehicle rated to ${vehicle.specs.tempMaxF}°F, need ${app.tempMaxF}°F`
        : undefined,
    })
  }

  // HARD GATE 6: Ramp grade (if provided and > 0)
  if (app.maxRampGrade != null && app.maxRampGrade > 0) {
    const passed = vehicle.specs.maxRampGrade >= app.maxRampGrade
    hardGates.push({
      name: 'Ramp Grade',
      vehicleValue: `${vehicle.specs.maxRampGrade}%`,
      requiredValue: `${app.maxRampGrade}%`,
      passed,
      reason: !passed
        ? `Vehicle handles ${vehicle.specs.maxRampGrade}%, need ${app.maxRampGrade}%`
        : undefined,
    })
  }

  // If ANY hard gate fails → RED
  if (hardGates.some(g => !g.passed)) {
    return { status: 'RED', hardGates, softPreferences: [] }
  }

  // SOFT PREFERENCE 1: Payload headroom < 10% (only if weight was set)
  if (app.maxLoadWeightLbs && app.maxLoadWeightLbs > 0) {
    const headroom = (vehicle.calc.maxWeightLbs - app.maxLoadWeightLbs) / app.maxLoadWeightLbs
    softPreferences.push({
      name: 'Payload Headroom',
      vehicleValue: `${vehicle.calc.maxWeightLbs.toLocaleString()} lbs (${(headroom * 100).toFixed(0)}% margin)`,
      requiredValue: `${app.maxLoadWeightLbs.toLocaleString()} lbs`,
      passed: headroom >= 0.10,
      reason: headroom < 0.10
        ? `Only ${(headroom * 100).toFixed(1)}% margin — tight fit, verify with applications engineer`
        : undefined,
    })
  }

  // SOFT PREFERENCE 2: Aisle clearance < 1 ft (informational only — not a hard gate)
  if (app.minAisleWidthFt && app.minAisleWidthFt > 0) {
    const clearance = app.minAisleWidthFt - vehicle.calc.widthFt
    softPreferences.push({
      name: 'Aisle Clearance',
      vehicleValue: `${vehicle.calc.widthFt} ft wide`,
      requiredValue: `${app.minAisleWidthFt} ft aisle`,
      passed: clearance >= 1.0,
      reason: clearance < 1.0
        ? `Only ${clearance.toFixed(1)} ft clearance — verify with site survey`
        : undefined,
    })
  }

  // SOFT PREFERENCE 3: Load type match (only if both are set)
  if (app.typicalUnitType && app.typicalUnitType.length > 0) {
    const loadMatch =
      vehicle.display.typicalLoad === app.typicalUnitType ||
      (app.typicalUnitType.toLowerCase().includes('pallet') &&
       vehicle.display.typicalLoad?.toLowerCase().includes('pallet')) ||
      (app.typicalUnitType.toLowerCase().includes('tote') &&
       vehicle.display.typicalLoad?.toLowerCase().includes('tote'))

    softPreferences.push({
      name: 'Load Type Match',
      vehicleValue: vehicle.display.typicalLoad,
      requiredValue: app.typicalUnitType,
      passed: loadMatch,
      reason: !loadMatch
        ? `Vehicle designed for ${vehicle.display.typicalLoad}, you need ${app.typicalUnitType}`
        : undefined,
    })
  }

  if (softPreferences.some(p => !p.passed)) {
    return { status: 'YELLOW', hardGates, softPreferences }
  }

  return { status: 'GREEN', hardGates, softPreferences }
}
