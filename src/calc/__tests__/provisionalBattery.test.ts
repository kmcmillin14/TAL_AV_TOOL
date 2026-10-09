import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chargingForGroup } from '../fleet'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/** m10, 8TB50A and 8HBC40A had no average draw and no charge input on the owner
 *  sheet. Rather than silently sizing them at availability = 1 — which quoted
 *  them as if charging were free — the two cells are back-derived from each
 *  platform's own estimated runtime and charge time and flagged
 *  `batterySpecProvisional`. The fleet sizes honestly; every surface says the
 *  figures are placeholders. */
const IDS = ['cb18', 'ml2', 'm10', 'ebase7', '8tb50a', '8hbc40a'] as const
const PROVISIONAL = new Set(['m10', '8tb50a', '8hbc40a'])

let byId: Map<string, Vehicle>
beforeAll(() => {
  const dir = join(process.cwd(), 'src/content/vehicles')
  byId = new Map(IDS.map(id => [id, JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')) as Vehicle]))
})

describe('provisional battery spec', () => {
  it('every platform can now be sized — no silent availability = 1 fallback', () => {
    for (const id of IDS) {
      const c = byId.get(id)!.calc
      expect(c.avgPowerDrawKw, id).toBeGreaterThan(0)
      expect(c.chargerPowerKw, id).toBeGreaterThan(0)
      expect(c.usableCapacityPct, id).toBeGreaterThan(0)
    }
  })

  it('exactly the three platforms missing sheet data are flagged provisional', () => {
    for (const id of IDS) {
      expect(byId.get(id)!.calc.batterySpecProvisional ?? false, id).toBe(PROVISIONAL.has(id))
    }
  })

  it('the back-derivation is self-consistent with the stored hours', () => {
    for (const id of PROVISIONAL) {
      const c = byId.get(id)!.calc
      const usable = (c.voltageV * c.ratedAh / 1000) * (c.usableCapacityPct! / 100)
      expect(usable / c.avgPowerDrawKw!).toBeCloseTo(c.runTimeHr, 1)
      expect(usable / c.chargerPowerKw! * 60).toBeCloseTo(c.chargeTimeMin!, 0)
    }
  })

  it('the flag reaches the charging result, and the reason says so', () => {
    for (const id of IDS) {
      const c = byId.get(id)!.calc
      const r = chargingForGroup({
        battery: {
          voltageV: c.voltageV, ratedAh: c.ratedAh, usableCapacityPct: c.usableCapacityPct!,
          avgPowerDrawKw: c.avgPowerDrawKw!, chargerPowerKw: c.chargerPowerKw!,
        },
        method: 'opportunity', staffedHr: 16, provisional: c.batterySpecProvisional ?? false,
      })
      expect(r.sustainable, id).toBe(true)
      expect(r.provisional, id).toBe(PROVISIONAL.has(id))
      expect(r.reason.includes('PROVISIONAL'), id).toBe(PROVISIONAL.has(id))
    }
  })

  it('REGRESSION: a provisional platform is NOT quoted as charging-free', () => {
    // The old fallback gave availability = 1 to any platform without battery
    // data, so it needed zero charging vehicles — the most expensive error.
    const c = byId.get('m10')!.calc
    const r = chargingForGroup({
      battery: {
        voltageV: c.voltageV, ratedAh: c.ratedAh, usableCapacityPct: c.usableCapacityPct!,
        avgPowerDrawKw: c.avgPowerDrawKw!, chargerPowerKw: c.chargerPowerKw!,
      },
      method: 'opportunity', staffedHr: 24, provisional: true,
    })
    expect(r.availability!).toBeLessThan(0.8)
    expect(r.availability).toBeCloseTo(r.dutyRatio!, 10)   // 24/7 → the floor
  })
})
