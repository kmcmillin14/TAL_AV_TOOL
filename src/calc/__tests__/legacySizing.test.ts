import { describe, it, expect } from 'vitest'
import { legacyFleetSize, LEGACY_CHARGE_AVAILABILITY, LEGACY_BUFFER } from '../legacySizing'

describe('legacyFleetSize (stated hand rule: ÷0.75 charge adder, ×1.20 buffer, per-stage ceil)', () => {
  it('constants match the stated 3:1 run:charge + 20% buffer', () => {
    expect(LEGACY_CHARGE_AVAILABILITY).toBe(0.75)
    expect(LEGACY_BUFFER).toBe(0.20)
  })

  it('raw 4.0 → ⌈4/0.75⌉=6 → ⌈6×1.2⌉=8', () => {
    const r = legacyFleetSize(4.0)
    expect(r.afterCharging).toBe(6)
    expect(r.fleet).toBe(8)
  })

  it('raw 8.0 → ⌈10.67⌉=11 → ⌈13.2⌉=14', () => {
    const r = legacyFleetSize(8.0)
    expect(r.afterCharging).toBe(11)
    expect(r.fleet).toBe(14)
  })

  it('applies the charge adder unconditionally (no schedule credit — the known over-quote)', () => {
    // Even tiny demand pays the ÷0.75 + ×1.2 stack: 1.0 → ⌈1.33⌉=2 → ⌈2.4⌉=3.
    expect(legacyFleetSize(1.0).fleet).toBe(3)
  })

  it('zero / negative raw → zero fleet, no NaN', () => {
    expect(legacyFleetSize(0).fleet).toBe(0)
    expect(legacyFleetSize(-5).fleet).toBe(0)
  })
})
