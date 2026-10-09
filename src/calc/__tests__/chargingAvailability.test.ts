import { describe, it, expect } from 'vitest'
import { chargingAvailability, type BatterySpec } from '../fleet'

/** Charging model v4 (2026-10-09). ONE availability term, built from PHYSICAL
 *  inputs — capacity, usable %, average draw, charge input, staffed window.
 *  Replaces v3's aCap + aEnergy + an uncapped break credit.
 *
 *  Owner decisions encoded here: charging is staggered across the fleet (so
 *  availability is the duration-weighted average over the staffed window, not
 *  the worst moment), and there is one charger per vehicle (so dock contention
 *  is not modelled). */

/** cb18: 564 Ah @ 48 V, 80% usable, 1.30 kW draw, 2.90 kW charger. */
const CB18: BatterySpec = {
  voltageV: 48, ratedAh: 564, usableCapacityPct: 80,
  avgPowerDrawKw: 1.30, chargerPowerKw: 2.90,
}
/** ml2: small pack, very fast charger — the best ratio in the library. */
const ML2: BatterySpec = {
  voltageV: 24, ratedAh: 63, usableCapacityPct: 80,
  avgPowerDrawKw: 0.19, chargerPowerKw: 0.96,
}

describe('chargingAvailability', () => {
  it('derives runtime and recharge from the physical chain', () => {
    const r = chargingAvailability(CB18, 16)!
    expect(r.usableKwh).toBeCloseTo(21.6576, 4)     // 48 × 564 / 1000 × 0.80
    expect(r.runTimeHr).toBeCloseTo(21.6576 / 1.30, 6)
    expect(r.chargeHr).toBeCloseTo(21.6576 / 2.90, 6)
  })

  it('the duty ratio is a CURRENT ratio — capacity cancels out', () => {
    const d = 2.9 / (2.9 + 1.3)
    for (const pct of [50, 70, 80, 100]) {
      for (const ah of [100, 564, 2000]) {
        const r = chargingAvailability({ ...CB18, usableCapacityPct: pct, ratedAh: ah }, 24)!
        expect(r.dutyRatio).toBeCloseTo(d, 12)
      }
    }
  })

  it('collapses to the bare duty ratio at 24/7 — no overnight reset to credit', () => {
    for (const b of [CB18, ML2]) {
      const r = chargingAvailability(b, 24)!
      expect(r.offShiftCharge).toBe(0)
      expect(r.availability).toBeCloseTo(r.dutyRatio, 12)
    }
  })

  it('credits the overnight charge, then the sustained duty ratio', () => {
    // cb18 at 16 h: Ch = 7.47 h, off-shift 8 h → z = 1, so the full 16.66 h
    // runtime is free and the battery covers the whole window.
    const r = chargingAvailability(CB18, 16)!
    expect(r.offShiftCharge).toBe(1)
    expect(r.availability).toBe(1)
  })

  it('a partial off-shift gives a partial start charge, continuously', () => {
    // Squeeze the window so (24 − H) < Ch and z goes fractional. No cliff.
    const seen = [20, 21, 22, 23, 24].map(H => chargingAvailability(CB18, H)!.availability)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1])
    expect(chargingAvailability(CB18, 22)!.offShiftCharge).toBeLessThan(1)
    expect(chargingAvailability(CB18, 22)!.offShiftCharge).toBeGreaterThan(0)
  })

  it('never reports below the duty ratio, and never above 1', () => {
    for (const draw of [0.1, 0.8, 1.3, 3]) {
      for (const chg of [0.5, 0.96, 2.9, 10]) {
        for (const H of [0.5, 8, 15, 16, 22.5, 24]) {
          const r = chargingAvailability({ ...CB18, avgPowerDrawKw: draw, chargerPowerKw: chg }, H)!
          expect(r.availability).toBeGreaterThanOrEqual(r.dutyRatio - 1e-12)
          expect(r.availability).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is monotonic in the charge:draw ratio — the platform signature', () => {
    const H = 24
    const a = [0.5, 1, 2, 5, 15]
      .map(ratio => chargingAvailability({ ...CB18, avgPowerDrawKw: 1, chargerPowerKw: ratio }, H)!.availability)
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1])
  })

  it('returns null when any physical input is missing or non-positive', () => {
    expect(chargingAvailability({ ...CB18, ratedAh: 0 }, 16)).toBeNull()
    expect(chargingAvailability({ ...CB18, voltageV: 0 }, 16)).toBeNull()
    expect(chargingAvailability({ ...CB18, usableCapacityPct: 0 }, 16)).toBeNull()
    expect(chargingAvailability({ ...CB18, avgPowerDrawKw: 0 }, 16)).toBeNull()
    expect(chargingAvailability({ ...CB18, chargerPowerKw: 0 }, 16)).toBeNull()
    expect(chargingAvailability(CB18, 0)).toBeNull()
  })

  it('REGRESSION: breaks and operating days are not inputs', () => {
    // v3 credited breakHrs × (runTimeHr/chargeHr) uncapped, which handed ml2
    // 40 h of effective runtime on a 24 h day, and carried a day-off term that
    // could only ever bind because of that same credit.
    expect(chargingAvailability.length).toBe(2)
  })
})
