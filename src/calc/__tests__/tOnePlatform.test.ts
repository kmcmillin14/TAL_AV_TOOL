import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/** T-One (formerly T-Hive — same product, two names until 2026-10-09) ships
 *  with BlueBotics. It is a property of the FLEET SOFTWARE, not the chassis, so
 *  `display.tOne` must agree with `display.fleetSoftware` on every vehicle.
 *
 *  It did not: 8TB50A and 8HBC40A are BlueBotics ANT but were flagged
 *  `tOne: false`, so a fleet of those two would have had T-One silently dropped
 *  from the quote's software line. Two fields describing one fact is exactly
 *  the drift this pins. */
const DIR = join(process.cwd(), 'src/content/vehicles')

let vehicles: Vehicle[]
beforeAll(() => {
  vehicles = readdirSync(DIR).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Vehicle)
})

const isBlueBotics = (v: Vehicle) => (v.display.fleetSoftware ?? '').toLowerCase().includes('bluebotics')

describe('T-One tracks the fleet software, not the chassis', () => {
  it('every vehicle declares both fields', () => {
    expect(vehicles.length).toBeGreaterThan(0)
    for (const v of vehicles) {
      expect(typeof v.display.tOne, v.id).toBe('boolean')
      expect(v.display.fleetSoftware, v.id).toBeTruthy()
    }
  })

  it('tOne === runs BlueBotics, on every vehicle', () => {
    for (const v of vehicles) expect(v.display.tOne, v.id).toBe(isBlueBotics(v))
  })

  it('REGRESSION: the two Toyota platforms are BlueBotics, so they have T-One', () => {
    for (const id of ['8tb50a', '8hbc40a']) {
      const v = vehicles.find(x => x.id === id)!
      expect(isBlueBotics(v), id).toBe(true)
      expect(v.display.tOne, id).toBe(true)
    }
  })

  it('REGRESSION: the old `tHive` key is gone — one name, one field', () => {
    for (const v of vehicles) {
      expect('tHive' in (v.display as unknown as Record<string, unknown>), v.id).toBe(false)
    }
  })
})
