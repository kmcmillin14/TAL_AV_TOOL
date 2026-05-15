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
  calc: {
    maxWeightLbs: 4000,
    widthFt: 4,
    maxLiftHeightFt: 15,
    speedLoadedFps: 8,
    batteryKwh: 24,
    energyKwhPerFt: 0.02,
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

describe('qualifyVehicle — lift height gate', () => {
  it('skips lift when delivery pattern is Floor-Floor', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, deliveryPattern: 'Floor-Floor', maxLiftHeightFt: 10 },
    )
    const lift = result.hardGates.find(g => g.gateId === 'lift_height')!
    expect(lift.skipped).toBe(true)
    expect(lift.skipReason).toContain('Delivery pattern does not involve height')
  })

  it('evaluates lift when delivery pattern involves height', () => {
    const result = qualifyVehicle(
      fixtureVehicle(),
      { ...emptyApp, deliveryPattern: 'Floor-Height', maxLiftHeightFt: 10 },
    )
    const lift = result.hardGates.find(g => g.gateId === 'lift_height')!
    expect(lift.skipped).toBe(false)
    expect(lift.passed).toBe(true)
  })

  it('fails lift when vehicle cannot reach height', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ calc: { ...fixtureVehicle().calc, maxLiftHeightFt: 5 } }),
      { ...emptyApp, deliveryPattern: 'Floor-Height', maxLiftHeightFt: 12 },
    )
    expect(result.status).toBe('RED')
    const lift = result.hardGates.find(g => g.gateId === 'lift_height')!
    expect(lift.passed).toBe(false)
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
      { ...emptyApp, tempMinF: 0 },
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
})

describe('qualifyVehicle — ramp grade gate', () => {
  it('skips ramp when no ramp grade specified', () => {
    const result = qualifyVehicle(fixtureVehicle(), emptyApp)
    const ramp = result.hardGates.find(g => g.gateId === 'ramp')!
    expect(ramp.skipped).toBe(true)
  })

  it('fails ramp when grade exceeds vehicle capability', () => {
    const result = qualifyVehicle(
      fixtureVehicle({ specs: { ...fixtureVehicle().specs, maxRampGrade: 5 } }),
      { ...emptyApp, maxRampGrade: 15 },
    )
    expect(result.status).toBe('RED')
    const ramp = result.hardGates.find(g => g.gateId === 'ramp')!
    expect(ramp.passed).toBe(false)
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

describe('qualifyVehicle — determinism', () => {
  it('produces identical results for identical inputs', () => {
    const v = fixtureVehicle()
    const app = { ...emptyApp, maxLoadWeightLbs: 2000, transferMethod: 'Fork' }
    const a = qualifyVehicle(v, app)
    const b = qualifyVehicle(v, app)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
