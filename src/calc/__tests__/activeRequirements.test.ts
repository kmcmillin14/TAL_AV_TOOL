import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { activeRequirements, GATES } from '../gates'
import type { ApplicationRequirements } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/** Step 2's "Active Requirements" strip named four hand-picked fields. Audited
 *  2026-10-09 against the nine gates, that list was wrong three ways:
 *   - it missed every hard gate but Weight, and every soft gate;
 *   - it advertised Aisle, which is explicitly NOT a gate;
 *   - its Transfer tag read the legacy `transferMethod`, which the Step 1 form
 *     stopped writing, so the tag never rendered while the gate was live.
 *  Deriving from GATES means the strip cannot drift from the gates again. */
let veh: Vehicle
beforeAll(() => {
  const dir = join(process.cwd(), 'src/content/vehicles')
  const f = readdirSync(dir).filter(x => x.endsWith('.json')).sort()[0]
  veh = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Vehicle
})

const EMPTY = {
  maxLoadWeightLbs: 0, typicalUnitType: '', transferMethod: '', deliveryPattern: '',
  minAisleWidthFt: 0,
} as ApplicationRequirements

describe('activeRequirements', () => {
  it('an empty project gates on nothing', () => {
    expect(activeRequirements(EMPTY, veh)).toEqual([])
  })

  it('a set requirement becomes an active one, with its gate name and severity', () => {
    const a = activeRequirements({ ...EMPTY, maxLoadWeightLbs: 2100 }, veh)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ id: 'weight', name: 'Weight Capacity', severity: 'hard' })
    expect(a[0].value).toContain('2,100')
  })

  it('REGRESSION: transferType drives the transfer gate — the legacy field does not', () => {
    // The strip read `transferMethod`, which the form stopped writing. A modern
    // project sets `transferType` and the gate runs, so the strip must see it.
    const modern = activeRequirements({ ...EMPTY, transferType: 'forklift' } as ApplicationRequirements, veh)
    expect(modern.some(r => r.id === 'transfer_method')).toBe(true)
  })

  it('REGRESSION: aisle width is NOT a gate and never appears', () => {
    const a = activeRequirements({ ...EMPTY, minAisleWidthFt: 12 }, veh)
    expect(a).toEqual([])
  })

  it('surfaces soft gates too, not just hard ones', () => {
    const soft = activeRequirements(
      { ...EMPTY, certifications: ['FM Approved'], rampRequired: true } as ApplicationRequirements, veh)
    const ids = soft.map(r => r.id)
    expect(ids).toContain('certifications')
    expect(ids).toContain('ramp')
    expect(soft.every(r => r.severity === 'soft')).toBe(true)
  })

  it('can surface every gate in the registry — none is unreachable', () => {
    const full = {
      ...EMPTY,
      maxLoadWeightLbs: 2100, typicalUnitType: 'Standard Pallet',
      transferType: 'forklift', pickHeightFt: 0, dropHeightFt: 8,
      outdoorRequired: true, temperatureEnvironment: 'freezer',
      rampRequired: true, palletEntryType: 'stringer',
      palletStacking: 'yes', palletStackingType: 'pin_post',
      certifications: ['FM Approved'],
    } as ApplicationRequirements
    const ids = new Set(activeRequirements(full, veh).map(r => r.id))
    for (const g of GATES) expect(ids.has(g.id), g.id).toBe(true)
  })
})
