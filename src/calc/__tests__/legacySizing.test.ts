import { describe, it, expect } from 'vitest'
import {
  legacyMissionVehicles, legacyChargingMultiplier, legacyFleetSize,
  LEGACY_VEHICLE_SPECS,
} from '../legacySizing'

// Anchors = the workbook's own cells (sheet "(01) Fleet Calculation").
describe('legacy workbook — anchored to its cells', () => {
  it('reproduces the Example row (CB18, 500 ft roundtrip, 20/hr → 1.073 veh)', () => {
    // C=TRUNC(500·0.3048,2)=152.4 → >100 → D=TRUNC(1.3·1.2,2)=1.56 →
    // E=TRUNC(152.4/1.56,2)=97.69 → F=TRUNC(0.2·97.69,2)=19.53 → G=75 →
    // H=ROUNDUP(75+19.53+97.69)=193 → I=193·20=3860 → J=ROUNDUP(3860/3600,3)=1.073
    expect(legacyMissionVehicles(500, 20, LEGACY_VEHICLE_SPECS.cb18)).toBe(1.073)
  })

  it('workbook-default transfer times: CB18 75 s (AC31), ML2 13.25 s (AH22)', () => {
    expect(LEGACY_VEHICLE_SPECS.cb18.transferSec).toBe(75)
    expect(LEGACY_VEHICLE_SPECS.ml2.transferSec).toBe(13.25)
  })

  it('the >100 m ×1.2 speed bump: short mission uses base speed, long uses ×1.2', () => {
    // 300 ft = 91.44 m ≤ 100 → base speed 1.3; 400 ft = 121.92 m > 100 → 1.56.
    const short = legacyMissionVehicles(300, 10, LEGACY_VEHICLE_SPECS.cb18)
    const long = legacyMissionVehicles(400, 10, LEGACY_VEHICLE_SPECS.cb18)
    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(0)
  })

  it('charging multiplier is the V13 schedule table (1×8 = 0, escalating)', () => {
    expect(legacyChargingMultiplier(1, 8)).toBe(0)      // single shift charges free
    expect(legacyChargingMultiplier(2, 8)).toBe(0.15)
    expect(legacyChargingMultiplier(2, 12)).toBe(0.3)
    expect(legacyChargingMultiplier(3, 8)).toBe(0.3)
    expect(legacyChargingMultiplier(1, 10)).toBe(0.15)
    expect(legacyChargingMultiplier(5, 8)).toBe(0)      // unknown combo → falls through to 0
  })

  it('full fleet: raw → +charging(sched) → +20% buffer → ceil once', () => {
    const m = [{ roundtripFt: 500, freqPerHr: 20 }]
    // raw 1.073; 2×8 charging 0.15 → 0.16095; buffer (1.23395)·0.2 → 0.24679;
    // fleet = ROUNDUP(1.48074) = 2.
    const r = legacyFleetSize(m, LEGACY_VEHICLE_SPECS.cb18, 2, 8)
    expect(r.raw).toBeCloseTo(1.073, 6)
    expect(r.charging).toBeCloseTo(0.16095, 6)
    expect(r.fleet).toBe(2)
    // 1×8 charges free → charging 0, still ceils to 2.
    expect(legacyFleetSize(m, LEGACY_VEHICLE_SPECS.cb18, 1, 8).charging).toBe(0)
  })

  it('empty / zero missions contribute nothing', () => {
    expect(legacyMissionVehicles(0, 20, LEGACY_VEHICLE_SPECS.cb18)).toBe(0)
    expect(legacyMissionVehicles(500, 0, LEGACY_VEHICLE_SPECS.cb18)).toBe(0)
    expect(legacyFleetSize([], LEGACY_VEHICLE_SPECS.m10, 2, 8).fleet).toBe(0)
  })
})
