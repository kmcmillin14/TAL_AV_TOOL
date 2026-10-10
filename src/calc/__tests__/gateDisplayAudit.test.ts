import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { GATES, activeRequirements } from '../gates'
import type { ApplicationRequirements } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/** AUDIT: does Step 2's Active Requirements strip show every hard gate, and
 *  does it report the right severity — including `pallet_stacking`, whose
 *  severity is ANSWER-DRIVEN (declared soft at spec level, returned hard for
 *  pin-and-post / cup-and-cap)? */
let vehicles: Vehicle[]
beforeAll(() => {
  const dir = join(process.cwd(), 'src/content/vehicles')
  vehicles = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Vehicle)
})

const BASE = {
  maxLoadWeightLbs: 0, typicalUnitType: '', transferMethod: '', deliveryPattern: '',
  minAisleWidthFt: 0,
} as ApplicationRequirements

/** Everything answered, so every gate runs. */
const FULL = {
  ...BASE,
  maxLoadWeightLbs: 2100, typicalUnitType: 'Standard Pallet',
  transferType: 'forklift', pickHeightFt: 0, dropHeightFt: 12,
  outdoorRequired: true, temperatureEnvironment: 'freezer',
  rampRequired: true, palletEntryType: 'stringer',
  palletStacking: 'yes', palletStackingType: 'pin_post',
  certifications: ['FM Approved'],
} as ApplicationRequirements

describe('gate display audit', () => {
  it('every gate in the registry is reachable by the strip', () => {
    const shown = new Set(activeRequirements(FULL, vehicles).map(r => r.id))
    const missing = GATES.filter(g => !shown.has(g.id)).map(g => g.id)
    expect(missing, `gates never shown: ${missing.join(', ')}`).toEqual([])
  })

  it('REGRESSION: a requirement ANY vehicle is checked against must show', () => {
    // `pallet_entry` skips on the VEHICLE — it needs palletEntryCompatibility,
    // which only some chassis declare. Sampling one vehicle showed or hid
    // Pallet Entry depending on which chassis happened to be first in the
    // library (audit 2026-10-10). The union shows it if ANY vehicle gates.
    const declaring = vehicles.filter(
      v => ((v as unknown as { palletEntryCompatibility?: string[] }).palletEntryCompatibility ?? []).length > 0)
    expect(declaring.length, 'fixture: some but not all chassis declare it').toBeGreaterThan(0)
    expect(declaring.length).toBeLessThan(vehicles.length)

    expect(new Set(activeRequirements(FULL, vehicles).map(r => r.id)).has('pallet_entry')).toBe(true)
  })

  it('the strip does not depend on fleet ORDER', () => {
    const a = JSON.stringify(activeRequirements(FULL, vehicles))
    const b = JSON.stringify(activeRequirements(FULL, [...vehicles].reverse()))
    expect(b).toBe(a)
  })

  it('pallet stacking is reported HARD for pin-and-post and cup-and-cap', () => {
    for (const t of ['pin_post', 'cup_cap'] as const) {
      const r = activeRequirements(
        { ...BASE, palletStacking: 'yes', palletStackingType: t } as ApplicationRequirements,
        vehicles,
      ).find(x => x.id === 'pallet_stacking')
      expect(r, t).toBeDefined()
      expect(r!.severity, `${t} must drive a RED gate`).toBe('hard')
    }
  })

  it('pallet stacking is reported SOFT for flat and other', () => {
    for (const t of ['flat', 'other'] as const) {
      const r = activeRequirements(
        { ...BASE, palletStacking: 'yes', palletStackingType: t } as ApplicationRequirements,
        vehicles,
      ).find(x => x.id === 'pallet_stacking')
      expect(r, t).toBeDefined()
      expect(r!.severity, t).toBe('soft')
    }
  })

  it('every declared-hard gate reports hard when it runs', () => {
    const byId = new Map(activeRequirements(FULL, vehicles).map(r => [r.id, r]))
    for (const g of GATES) {
      if (g.severity !== 'hard') continue
      expect(byId.get(g.id)?.severity, g.id).toBe('hard')
    }
  })
})
