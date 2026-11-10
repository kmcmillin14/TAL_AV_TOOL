import { describe, expect, it } from 'vitest'
import { loadVehicleLibrary, type Vehicle, type VehicleSimData } from '@/src/lib/vehicleLibrary'
import { createSim } from '../engine'
import { corridor, settings } from './fixtures'

/** Every vehicle in the library — a new vehicle file is checked without editing this test. */
const LIBRARY: Vehicle[] = await loadVehicleLibrary()
const CB18 = LIBRARY.find(v => v.id === 'cb18')!
const FIELDS: (keyof VehicleSimData)[] = ['overallLengthFt', 'forkLengthFt', 'pathRefPointFt', 'accelFps2', 'decelFps2', 'turnSpeedFps',
  'approachSpeedFps', 'approachDistanceFt', 'reverseSpeedFps', 'travelDirection', 'preferredTravel', 'reorientSec',
  'doubleDeep', 'availabilityPct', 'tugger', 'spriteAsset', 'spriteRefPx']
/** The only simulation values sourced so far — the owner's CB18 assumption (D-7). */
const SOURCED: Record<string, Record<string, unknown>> = { cb18: { overallLengthFt: 9.63, forkLengthFt: 3.5 } }

describe('vehicle calc.sim — nothing invented (spec §2.1)', () => {
  it.each(LIBRARY.map(v => [v.id, v] as const))('%s carries every field, null unless sourced, with provenance', (id, v) => {
    const sim = v.calc.sim as Record<string, unknown>
    expect(sim).toBeDefined()
    for (const f of FIELDS) {
      expect(f in sim).toBe(true)
      expect(sim[f]).toEqual(SOURCED[id]?.[f] ?? null)
    }
    expect(sim.provisional).toBe(true)
    expect(String(sim.dataNote).length).toBeGreaterThan(40)
  })
})

describe('the engine reads calc.sim and transfer orientation from the vehicle JSON', () => {
  const flow = [{ id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 10, vehicleId: 'cb18' }]

  it('uses the JSON overall length without any override', () => {
    const S = createSim(corridor(100), flow, LIBRARY, settings())!
    expect(S.profiles.get('cb18')!.lengthFt).toBe(9.63)
    expect(S.flags.some(f => f.field === 'overallLengthFt')).toBe(false)
  })

  it('a transfer method with an orientation is not flagged', () => {
    const withOrientation = { ...CB18, transferMethods: CB18.transferMethods.map(m => ({ ...m, orientation: 'rear' as const })) }
    const S = createSim(corridor(100), flow, [withOrientation], settings())!
    expect(S.flags.some(f => f.field === 'transferOrientation')).toBe(false)
    expect(S.flows[0].orientation).toBe('rear')
  })

  it('a per-project override is laid over the JSON field by field', () => {
    const S = createSim(corridor(100), flow, LIBRARY, settings(), { cb18: { turnSpeedFps: 3 } })!
    const p = S.profiles.get('cb18')!
    expect(p.turnSpeed).toBe(3)
    expect(p.lengthFt).toBe(9.63) // still from the JSON
  })

  it('an empty override never hides the JSON value', () => {
    const S = createSim(corridor(100), flow, LIBRARY, settings(), { cb18: { overallLengthFt: null } })!
    expect(S.profiles.get('cb18')!.lengthFt).toBe(9.63)
  })
})
