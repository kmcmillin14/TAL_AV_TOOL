import { describe, it, expect } from 'vitest'
import { qualifyVehicle } from '../trafficLight'
import type { ApplicationRequirements } from '../types'
import type { Vehicle } from '../../lib/vehicleLibrary'

// Minimal vehicle fixture — pallet forklift, conservative specs.
const fixtureVehicle = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: 'fx',
  name: 'Fixture Vehicle',
  display: {
    manufacturer: 'TestCo',
    partnership: 'TAL Integrated',
    tHive: false,
    fleetSoftware: 'Test FM',
    heroImage: '/test.png',
    typicalLoad: 'Standard Pallet',
    category: 'Test',
  },
  transferMethods: [
    { method: 'Fork', loadTimeSec: 5, unloadTimeSec: 5 },
  ],
  payloadTypes: ['Standard Pallet'],
  calc: {
    maxWeightLbs: 4000,
    widthFt: 4,
    liftClass: 'forklift',
    maxLiftHeightFt: 15,
    maxLoadLengthIn: 48,
    maxLoadWidthIn: 48,
    maxLoadHeightIn: 60,
    speedLoadedFps: 8,
    ratedAh: 200,
    voltageV: 48,
    dischargeA: 30,
    chargeA: 60,
    priceRange: { minUsd: 100000, maxUsd: 150000 },
  },
  specs: {
    tempMinF: 14,
    tempMaxF: 113,
    outdoorCapable: false,
    freezerCapable: false,
    maxRampGrade: 10,
    certifications: ['ISO 3691-4', 'ANSI B56.5'],
  },
  ...overrides,
})

// Minimal application requirements — nothing set; everything should skip.
const emptyApp: ApplicationRequirements = {
  maxLoadWeightLbs: 0,
  typicalUnitType: '',
  transferMethod: '',
  deliveryPattern: '',
  minAisleWidthFt: 0,
}

describe('qualifyVehicle — status logic', () => {
  it('returns GREEN when no requirements are set (everything skipped)', () => {
    const result = qualifyVehicle(fixtureVehicle(), emptyApp)
    expect(result.status).toBe('GREEN')
    expect(result.hardGates.every(g => g.skipped)).toBe(true)
    expect(result.softPreferences.every(g => g.skipped)).toBe(true)
  })

  it('returns RED when any hard gate fails', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ calc: { ...fixtureVehicle().calc, maxWeightLbs: 1000 } }),
      { ...emptyApp, maxLoadWeightLbs: 5000 },
    )
    expect(result.status).toBe('RED')
  })

  it('returns YELLOW when soft pref (certs) fails and hards pass', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, certifications: ['Cleanroom'] },
    )
    expect(result.status).toBe('YELLOW')
    const certs = result.softPreferences.find(g => g.gateId === 'certifications')!
    expect(certs.passed).toBe(false)
    expect(certs.skipped).toBe(false)
  })

  it('returns GREEN when all hards pass and all required certs are listed', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, maxLoadWeightLbs: 1000, certifications: ['ISO 3691-4'] },
    )
    expect(result.status).toBe('GREEN')
  })

  it('skipped gates do not affect status', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, maxLoadWeightLbs: 1000 },
    )
    // weight passes; everything else is skipped
    expect(result.status).toBe('GREEN')
    const weight = result.hardGates.find(g => g.gateId === 'weight')!
    expect(weight.skipped).toBe(false)
    expect(weight.passed).toBe(true)
  })
})

describe('qualifyVehicle — per-gate v2 schema', () => {
  it('every gate has gateId, severity, skipped, reason', () => {
    const result = qualifyVehicle(fixtureVehicle(), emptyApp)
    for (const gate of [...result.hardGates, ...result.softPreferences]) {
      expect(gate.gateId).toBeTruthy()
      expect(['hard', 'soft']).toContain(gate.severity)
      expect(typeof gate.skipped).toBe('boolean')
      expect(gate.reason).toBeTruthy()
    }
  })

  it('weight gate carries delta, unit, and numeric values when active', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, maxLoadWeightLbs: 3000 },
    )
    const weight = result.hardGates.find(g => g.gateId === 'weight')!
    expect(weight.unit).toBe('lbs')
    expect(weight.vehicleNumeric).toBe(4000)
    expect(weight.requiredNumeric).toBe(3000)
    expect(weight.delta).toBe(1000)
  })

  it('failed weight gate reports the shortfall in the reason', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ calc: { ...fixtureVehicle().calc, maxWeightLbs: 500 } }),
      { ...emptyApp, maxLoadWeightLbs: 2000 },
    )
    const weight = result.hardGates.find(g => g.gateId === 'weight')!
    expect(weight.passed).toBe(false)
    expect(weight.reason).toContain('1,500 lbs short')
  })

  it('passed weight gate reports the headroom in the reason', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, maxLoadWeightLbs: 1000 },
    )
    const weight = result.hardGates.find(g => g.gateId === 'weight')!
    expect(weight.passed).toBe(true)
    expect(weight.reason).toContain('3,000 lbs headroom')
  })
})

describe('qualifyVehicle — lift / transfer gate (lift class)', () => {
  it('skips when pick and drop are both at floor (no above-floor transfer)', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, pickHeightFt: 0, dropHeightFt: 0 },
    )
    const lift = result.hardGates.find(g => g.gateId === 'lift_height')!
    expect(lift.skipped).toBe(true)
  })

  it('forklift passes a floor→height lift within its reach', () => {
    const result = qualifyVehicle(
      fixtureVehicle(), // forklift, reach 15
      { ...emptyApp, pickHeightFt: 0, dropHeightFt: 10 },
    )
    const lift = result.hardGates.find(g => g.gateId === 'lift_height')!
    expect(lift.skipped).toBe(false)
    expect(lift.passed).toBe(true)
  })

  it('forklift fails when the drop exceeds its reach', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ calc: { ...fixtureVehicle().calc, maxLiftHeightFt: 5 } }),
      { ...emptyApp, pickHeightFt: 0, dropHeightFt: 12 },
    )
    expect(result.status).toBe('RED')
    expect(result.hardGates.find(g => g.gateId === 'lift_height')!.passed).toBe(false)
  })

  it('lift table passes a matched-height transfer but fails an elevation change', () => {
    const liftTable = fixtureVehicle({ calc: { ...fixtureVehicle().calc, liftClass: 'lift_table', maxLiftHeightFt: null } })
    const matched = qualifyVehicle(liftTable, { ...emptyApp, pickHeightFt: 2.5, dropHeightFt: 2.5 })
    expect(matched.hardGates.find(g => g.gateId === 'lift_height')!.passed).toBe(true)
    const changed = qualifyVehicle(liftTable, { ...emptyApp, pickHeightFt: 0, dropHeightFt: 5 })
    expect(changed.hardGates.find(g => g.gateId === 'lift_height')!.passed).toBe(false)
  })

  it('floor-to-floor fails any above-floor transfer', () => {
    const tugger = fixtureVehicle({ calc: { ...fixtureVehicle().calc, liftClass: 'floor', maxLiftHeightFt: null } })
    const result = qualifyVehicle(tugger, { ...emptyApp, pickHeightFt: 0, dropHeightFt: 4 })
    expect(result.hardGates.find(g => g.gateId === 'lift_height')!.passed).toBe(false)
  })

  it('falls back to legacy maxLiftHeightFt when pick/drop are unset', () => {
    const result = qualifyVehicle(
      fixtureVehicle(), // forklift reach 15
      { ...emptyApp, maxLiftHeightFt: 10 },
    )
    const lift = result.hardGates.find(g => g.gateId === 'lift_height')!
    expect(lift.skipped).toBe(false)
    expect(lift.passed).toBe(true)
  })
})

describe('qualifyVehicle — transfer method gate', () => {
  it('passes when vehicle supports the requested method', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, transferMethod: 'Fork' },
    )
    const tm = result.hardGates.find(g => g.gateId === 'transfer_method')!
    expect(tm.passed).toBe(true)
  })

  it('fails when vehicle does not support the requested method', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, transferMethod: 'Conveyor Interface' },
    )
    expect(result.status).toBe('RED')
    const tm = result.hardGates.find(g => g.gateId === 'transfer_method')!
    expect(tm.passed).toBe(false)
  })

  it('matches case-insensitively', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, transferMethod: 'fork' },
    )
    const tm = result.hardGates.find(g => g.gateId === 'transfer_method')!
    expect(tm.passed).toBe(true)
  })
})

describe('qualifyVehicle — temperature gates', () => {
  it('fails min temp when vehicle cannot go cold enough', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ specs: { ...fixtureVehicle().specs, tempMinF: 32 } }),
      { ...emptyApp, tempMinF: 10 },
    )
    expect(result.status).toBe('RED')
    const tmin = result.hardGates.find(g => g.gateId === 'temp_min')!
    expect(tmin.passed).toBe(false)
  })

  it('passes max temp when vehicle exceeds requirement', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, tempMaxF: 100 },
    )
    const tmax = result.hardGates.find(g => g.gateId === 'temp_max')!
    expect(tmax.passed).toBe(true)
  })

  // 0 is the app-wide "no requirement given" sentinel (weight, ramp, aisle all
  // treat 0/empty as unset). Temps follow the same convention — a stray 0 in a
  // partial project must not turn the whole matrix RED. Real freezer specs use
  // negative °F (and the freezerCapable flag).
  it('skips both temp gates when the requirement is 0 (unset sentinel)', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, tempMinF: 0, tempMaxF: 0 },
    )
    const tmin = result.hardGates.find(g => g.gateId === 'temp_min')!
    const tmax = result.hardGates.find(g => g.gateId === 'temp_max')!
    expect(tmin.skipped).toBe(true)
    expect(tmax.skipped).toBe(true)
    expect(result.status).toBe('GREEN')
  })

  it('evaluates negative freezer temps as real requirements', () => {
    const result = qualifyVehicle(
      fixtureVehicle(), // rated to 14°F — cannot reach -10°F
      { ...emptyApp, tempMinF: -10 },
    )
    expect(result.status).toBe('RED')
    const tmin = result.hardGates.find(g => g.gateId === 'temp_min')!
    expect(tmin.passed).toBe(false)
  })
})

describe('qualifyVehicle — ramp grade gate (soft)', () => {
  it('skips ramp when no ramp grade specified', () => {
    const result = qualifyVehicle(fixtureVehicle(), emptyApp)
    const ramp = result.softPreferences.find(g => g.gateId === 'ramp')!
    expect(ramp.skipped).toBe(true)
  })

  it('auto-yellows whenever a ramp grade > 0 is required (review flag, even if rated to it)', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ specs: { ...fixtureVehicle().specs, maxRampGrade: 30 } }), // amply rated
      { ...emptyApp, maxRampGrade: 5 },
    )
    expect(result.status).toBe('YELLOW')
    const ramp = result.softPreferences.find(g => g.gateId === 'ramp')!
    expect(ramp.passed).toBe(false)
    expect(ramp.severity).toBe('soft')
  })
})

describe('qualifyVehicle — temperature environment (one gate, answer-driven severity)', () => {
  const temp = (r: ReturnType<typeof qualifyVehicle>) =>
    [...r.hardGates, ...r.softPreferences].find(g => g.gateId === 'temperature_env')!

  it('skips when unset (not pre-selected)', () => {
    expect(temp(qualifyVehicle(fixtureVehicle(), emptyApp)).skipped).toBe(true)
  })

  it('Ambient → green pass for any vehicle', () => {
    const r = qualifyVehicle(fixtureVehicle(), { ...emptyApp, temperatureEnvironment: 'ambient' })
    expect(r.status).toBe('GREEN')
    expect(temp(r).passed).toBe(true)
  })

  it('Refrigerated → soft YELLOW for a non-cold-rated vehicle', () => {
    const r = qualifyVehicle(fixtureVehicle(), { ...emptyApp, temperatureEnvironment: 'refrigerated' })
    expect(r.status).toBe('YELLOW')
    expect(temp(r).severity).toBe('soft')
    expect(temp(r).passed).toBe(false)
  })

  it('Freezer → hard RED for a non-freezer-rated vehicle', () => {
    const r = qualifyVehicle(fixtureVehicle(), { ...emptyApp, temperatureEnvironment: 'freezer' })
    expect(r.status).toBe('RED')
    expect(temp(r).severity).toBe('hard')
    expect(temp(r).passed).toBe(false)
  })

  it('a freezer-rated vehicle passes both Refrigerated and Freezer', () => {
    const cold = fixtureVehicle({ specs: { ...fixtureVehicle().specs, freezerCapable: true } })
    expect(qualifyVehicle(cold, { ...emptyApp, temperatureEnvironment: 'refrigerated' }).status).toBe('GREEN')
    expect(temp(qualifyVehicle(cold, { ...emptyApp, temperatureEnvironment: 'freezer' })).passed).toBe(true)
  })

  it('legacy freezerCapable=true still maps to a Freezer requirement', () => {
    const g = temp(qualifyVehicle(fixtureVehicle(), { ...emptyApp, freezerCapable: true }))
    expect(g.skipped).toBe(false)
    expect(g.severity).toBe('hard')
  })
})

describe('qualifyVehicle — certifications gate (soft)', () => {
  it('soft fails when any required cert is missing → YELLOW', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, certifications: ['Cleanroom', 'ISO 3691-4'] },
    )
    expect(result.status).toBe('YELLOW')
    const certs = result.softPreferences.find(g => g.gateId === 'certifications')!
    expect(certs.severity).toBe('soft')
    expect(certs.passed).toBe(false)
    expect(certs.reason).toContain('Cleanroom')
  })

  it('passes when every required cert is listed', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, certifications: ['ISO 3691-4', 'ANSI B56.5'] },
    )
    expect(result.status).toBe('GREEN')
    const certs = result.softPreferences.find(g => g.gateId === 'certifications')!
    expect(certs.passed).toBe(true)
  })
})

describe('qualifyVehicle — outdoor gate', () => {
  it('skips when unset (not pre-selected)', () => {
    const result = qualifyVehicle(fixtureVehicle(), emptyApp)
    const outdoor = result.hardGates.find(g => g.gateId === 'outdoor')!
    expect(outdoor.skipped).toBe(true)
  })

  it('Indoor (false) → green pass for any vehicle', () => {
    const result = qualifyVehicle(fixtureVehicle(), { ...emptyApp, outdoorRequired: false })
    const outdoor = result.hardGates.find(g => g.gateId === 'outdoor')!
    expect(outdoor.skipped).toBe(false)
    expect(outdoor.passed).toBe(true)
  })

  it('passes when outdoor required and vehicle is outdoor-capable', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ specs: { ...fixtureVehicle().specs, outdoorCapable: true } }),
      { ...emptyApp, outdoorRequired: true },
    )
    expect(result.status).toBe('GREEN')
    const outdoor = result.hardGates.find(g => g.gateId === 'outdoor')!
    expect(outdoor.passed).toBe(true)
  })

  it('fails when outdoor required and vehicle is not outdoor-capable', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, outdoorRequired: true },
    )
    expect(result.status).toBe('RED')
    const outdoor = result.hardGates.find(g => g.gateId === 'outdoor')!
    expect(outdoor.passed).toBe(false)
  })
})


describe('qualifyVehicle — payload type gate', () => {
  it('skips when no typical unit type is set', () => {
    const result = qualifyVehicle(fixtureVehicle(), emptyApp)
    const gate = result.hardGates.find(g => g.gateId === 'payload_type')!
    expect(gate.skipped).toBe(true)
  })

  it('passes when vehicle handles the requested unit type', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, typicalUnitType: 'Standard Pallet' },
    )
    expect(result.status).toBe('GREEN')
    const gate = result.hardGates.find(g => g.gateId === 'payload_type')!
    expect(gate.passed).toBe(true)
  })

  it('fails when vehicle does not handle the requested unit type', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ payloadTypes: ['Tote'] }),
      { ...emptyApp, typicalUnitType: 'Standard Pallet' },
    )
    expect(result.status).toBe('RED')
    const gate = result.hardGates.find(g => g.gateId === 'payload_type')!
    expect(gate.passed).toBe(false)
    expect(gate.reason).toContain('Does not carry Standard Pallet')
  })
})

describe('qualifyVehicle — determinism', () => {
  it('produces identical results for identical inputs', () => {
    const v = fixtureVehicle()
    const app = { ...emptyApp, maxLoadWeightLbs: 2000, transferMethod: 'Fork' }
    const a = qualifyVehicle(v, app)
    const b = qualifyVehicle(v, app)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('qualifyVehicle — multi-load rollup (matrix-only)', () => {
  // Fixture vehicle: payloadTypes ['Standard Pallet'], 4000 lbs, deck 48×48×60.
  const palletLoad = { loadId: 'l1', unitType: 'Standard Pallet', lengthIn: 48, widthIn: 40, heightIn: 60, weightLbs: 2000 }
  const toteLoad   = { loadId: 'l2', unitType: 'Tote', lengthIn: 24, widthIn: 16, heightIn: 14, weightLbs: 50 }

  it('GREEN when every load passes all load-coupled gates', () => {
    const result = qualifyVehicle(fixtureVehicle(), { ...emptyApp, loads: [palletLoad] })
    expect(result.status).toBe('GREEN')
    expect(result.perLoad).toHaveLength(1)
    expect(result.perLoad![0]).toMatchObject({ loadId: 'l1', passed: true, failedGates: [] })
  })

  it('YELLOW when some loads pass and some fail — failing gates named per load', () => {
    const result = qualifyVehicle(fixtureVehicle(), { ...emptyApp, loads: [palletLoad, toteLoad] })
    expect(result.status).toBe('YELLOW')
    const tote = result.perLoad!.find(l => l.loadId === 'l2')!
    expect(tote.passed).toBe(false)
    expect(tote.failedGates).toContain('payload_type')
    const pallet = result.perLoad!.find(l => l.loadId === 'l1')!
    expect(pallet.passed).toBe(true)
  })

  it('RED when no load passes', () => {
    const v = fixtureVehicle({ payloadTypes: ['Cart'] })
    const result = qualifyVehicle(v, { ...emptyApp, loads: [palletLoad, toteLoad] })
    expect(result.status).toBe('RED')
  })

  it('RED on a load-independent hard fail even when all loads pass', () => {
    const result = qualifyVehicle(
      fixtureVehicle(), // outdoorCapable: false
      { ...emptyApp, loads: [palletLoad], outdoorRequired: true },
    )
    expect(result.status).toBe('RED')
  })

  it('per-load weight falls back to project maxLoadWeightLbs', () => {
    const noWeight = { loadId: 'l3', unitType: 'Standard Pallet' }
    const result = qualifyVehicle(
      fixtureVehicle(), // rated 4000 lbs
      { ...emptyApp, maxLoadWeightLbs: 9000, loads: [noWeight] },
    )
    expect(result.status).toBe('RED')
    expect(result.perLoad![0].failedGates).toContain('weight')
  })

  it('no declared loads → legacy single-load behavior, no perLoad detail', () => {
    const result = qualifyVehicle(fixtureVehicle(), emptyApp)
    expect(result.perLoad).toBeUndefined()
  })

  it('multi-load gate rows are name-suffixed with the unit type for display', () => {
    const result = qualifyVehicle(fixtureVehicle(), { ...emptyApp, loads: [palletLoad, toteLoad] })
    expect(result.hardGates.map(g => g.name)).toContain('Payload Type — Tote')
  })
})
