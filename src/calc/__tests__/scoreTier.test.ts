import { describe, it, expect } from 'vitest'
import { scoreTier, clampToFloor, type TierPointTable } from '../scoreTier'

const table: TierPointTable = {
  points: { a: 1, b: 2, c: 5 },
  thresholds: { tier2: 3, tier3: 6 },
}

describe('scoreTier', () => {
  it('sums points for triggered boolean keys and skips false/absent ones', () => {
    const r = scoreTier({ a: true, b: false, c: true }, table, 1, 'floor')
    expect(r.score).toBe(6)
    expect(r.reasons).toEqual([{ label: 'a', points: 1 }, { label: 'c', points: 5 }])
    expect(r.notTriggered).toEqual(['b'])
  })

  it('derives tier 1 below tier2 threshold', () => {
    const r = scoreTier({ a: true }, table, 1, 'floor')
    expect(r.score).toBe(1)
    expect(r.tier).toBe(1)
    expect(r.flooredBy).toBeNull()
  })

  it('derives tier 2 at the tier2 boundary', () => {
    const r = scoreTier({ b: true, a: true }, table, 1, 'floor') // 2 + 1 = 3
    expect(r.score).toBe(3)
    expect(r.tier).toBe(2)
  })

  it('derives tier 3 at the tier3 boundary', () => {
    const r = scoreTier({ c: true, a: true }, table, 1, 'floor') // 5 + 1 = 6
    expect(r.score).toBe(6)
    expect(r.tier).toBe(3)
  })

  it('a vehicle floor raises the tier above what was scored, and reports flooredBy', () => {
    const r = scoreTier({}, table, 3, 'vehicle floor')
    expect(r.score).toBe(0)
    expect(r.tier).toBe(3)
    expect(r.flooredBy).toBe('vehicle floor')
  })

  it('does not report flooredBy when the scored tier already meets/exceeds the floor', () => {
    const r = scoreTier({ c: true, a: true }, table, 2, 'vehicle floor') // scores tier 3
    expect(r.tier).toBe(3)
    expect(r.flooredBy).toBeNull()
  })
})

describe('clampToFloor', () => {
  it('raises a tier below the floor and reports flooredBy', () => {
    expect(clampToFloor(1, 3, 'vehicle floor')).toEqual({ tier: 3, flooredBy: 'vehicle floor' })
  })
  it('leaves a tier at or above the floor unchanged, with no flooredBy', () => {
    expect(clampToFloor(2, 2, 'vehicle floor')).toEqual({ tier: 2, flooredBy: null })
    expect(clampToFloor(3, 1, 'vehicle floor')).toEqual({ tier: 3, flooredBy: null })
  })
})
