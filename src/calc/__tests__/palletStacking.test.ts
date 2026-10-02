import { describe, it, expect } from 'vitest'
import { qualifyVehicle } from '../trafficLight'
import type { ApplicationRequirements } from '../types'
import type { Vehicle } from '../../lib/vehicleLibrary'
import { projectSchema } from '../../lib/validations/schemas'

// Same minimal fixture shape as trafficLight.test.ts — a vehicle that passes
// every other gate, so the verdict isolates pallet stacking.
const fixtureVehicle = (): Vehicle => ({
  id: 'fx', name: 'Fixture Vehicle',
  display: {
    manufacturer: 'TestCo', partnership: 'TAL Integrated', tHive: false,
    fleetSoftware: 'Test FM', heroImage: '/test.png',
    typicalLoad: 'Standard Pallet', category: 'Test',
  },
  transferMethods: [{ method: 'Fork', loadTimeSec: 5, unloadTimeSec: 5 }],
  payloadTypes: ['Standard Pallet'],
  calc: {
    maxWeightLbs: 4000, widthFt: 4, liftClass: 'forklift', maxLiftHeightFt: 15,
    maxLoadLengthIn: 48, maxLoadWidthIn: 48, maxLoadHeightIn: 60,
    speedLoadedFps: 8, ratedAh: 200, voltageV: 48, runTimeHr: 5.3,
    priceRange: { minUsd: 100000, maxUsd: 150000 },
  },
  specs: {
    tempMinF: 14, tempMaxF: 113, outdoorCapable: false, freezerCapable: false,
    maxRampGrade: 10, certifications: ['ISO 3691-4', 'ANSI B56.5'],
  },
} as unknown as Vehicle)

/** Every hard gate answered and passing — GREEN before stacking is considered. */
const completeApp: ApplicationRequirements = {
  maxLoadWeightLbs: 1000,
  typicalUnitType: 'Standard Pallet',
  transferMethod: 'Fork',
  deliveryPattern: '',
  minAisleWidthFt: 0,
  loadLengthIn: 40, loadWidthIn: 40, loadHeightIn: 40,
  liftTypeNeeded: 'floor',
  outdoorRequired: false,
  temperatureEnvironment: 'ambient',
} as unknown as ApplicationRequirements

const gateOf = (app: ApplicationRequirements) => {
  const r = qualifyVehicle(fixtureVehicle(), app)
  return [...r.hardGates, ...r.softPreferences].find(g => g.gateId === 'pallet_stacking')
}
const statusOf = (app: ApplicationRequirements) => qualifyVehicle(fixtureVehicle(), app).status

describe('pallet stacking gate', () => {
  it('skips when the question is unanswered — and does not block GREEN', () => {
    expect(gateOf(completeApp)?.skipped).toBe(true)
    expect(statusOf(completeApp)).toBe('GREEN')
  })

  it('passes when the AGV is not asked to stack', () => {
    const app = { ...completeApp, palletStacking: 'no' } as unknown as ApplicationRequirements
    expect(gateOf(app)?.skipped).toBe(false)
    expect(gateOf(app)?.passed).toBe(true)
    expect(statusOf(app)).toBe('GREEN')
  })

  it.each(['pin_post', 'cup_cap'] as const)('fails HARD → RED for %s', type => {
    const app = { ...completeApp, palletStacking: 'yes', palletStackingType: type } as unknown as ApplicationRequirements
    expect(gateOf(app)?.severity).toBe('hard')
    expect(gateOf(app)?.passed).toBe(false)
    expect(statusOf(app)).toBe('RED')
  })

  it.each(['flat', 'other'] as const)('fails SOFT → YELLOW for %s', type => {
    const app = { ...completeApp, palletStacking: 'yes', palletStackingType: type } as unknown as ApplicationRequirements
    expect(gateOf(app)?.severity).toBe('soft')
    expect(gateOf(app)?.passed).toBe(false)
    expect(statusOf(app)).toBe('YELLOW')
  })

  it('stacking required with an unanswered type is a review, never a pass', () => {
    const app = { ...completeApp, palletStacking: 'yes' } as unknown as ApplicationRequirements
    expect(gateOf(app)?.severity).toBe('soft')
    expect(gateOf(app)?.passed).toBe(false)
    expect(statusOf(app)).toBe('YELLOW')
  })

  it('"Not sure" is a review, never a pass — the real answer might be interlocked', () => {
    const app = { ...completeApp, palletStacking: 'not_sure' } as unknown as ApplicationRequirements
    expect(gateOf(app)?.skipped).toBe(false)
    expect(gateOf(app)?.passed).toBe(false)
    expect(gateOf(app)?.severity).toBe('soft')
    expect(statusOf(app)).toBe('YELLOW')
  })

  it('still accepts the boolean this field briefly shipped as', () => {
    // projectSchema coerces legacy true/false -> 'yes'/'no' (z.preprocess).
    const parsed = projectSchema.partial().parse({ palletStacking: true })
    expect(parsed.palletStacking).toBe('yes')
    expect(projectSchema.partial().parse({ palletStacking: false }).palletStacking).toBe('no')
  })
})
