import { describe, expect, it } from 'vitest'
import { applyClearance, B56_5_RULE, envelopes, laneWidthFt, REDUCED_CLEARANCE, segmentClearances } from '../clearance'
import { snapToObjects } from '../layoutEdit'
import type { SimLayout, SimSegment } from '../types'

const ENV = 4                                     // ft envelope width
/** A 100 ft route along y = 0, and walls `gapIn` beyond the envelope edge on the listed sides. */
function aisle(gapIn: number, seg: Partial<SimSegment> = {}, sides: (1 | -1)[] = [1]): SimLayout {
  const edge = ENV / 2 + gapIn / 12
  return {
    points: [{ id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' }, { id: 'B', x: 100, y: 0, type: 'stand', role: 'drop' }],
    segments: [{ id: 's', a: 'A', b: 'B', dir: 'ab', lane: 'single', ...seg }],
    objects: sides.map((k, i) => ({ id: `w${i}`, x: 20, y: k > 0 ? edge : -edge - 1, w: 60, h: 1 })),
  }
}
const run = (L: SimLayout, rule = B56_5_RULE) => segmentClearances(L, () => ENV, rule)[0]

describe('B56.5 clearance per route (spec §5.9)', () => {
  it('no object near → clear, full speed', () => {
    expect(run({ ...aisle(8), objects: [] })).toMatchObject({ status: 'clear', tightestIn: null })
  })

  it('8 in → speed capped below 1.2 m/s, reason "B56.5 reduced clearance" (acceptance 30)', () => {
    const r = run(aisle(8))
    expect(r.status).toBe('capped')
    expect(r.capFps!).toBeLessThan(B56_5_RULE.thresholdFps)
    expect(r.reason).toBe(REDUCED_CLEARANCE)
  })

  it('reports the tightest clearance within ±0.05 in (acceptance 31)', () => {
    expect(Math.abs(run(aisle(8)).tightestIn! - 8)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(run(aisle(13.37)).tightestIn! - 13.37)).toBeLessThanOrEqual(0.05)
    expect(run(aisle(8)).callout).not.toBeNull()
  })

  it('≥ 0.5 m → full speed; under 6 in → violation', () => {
    expect(run(aisle(20)).status).toBe('full')
    expect(run(aisle(4)).status).toBe('violation')
  })

  it('a two-lane route that does not fit both envelopes is flagged; single-lane fits (acceptance 32)', () => {
    // walls 4.5 ft either side of the centreline: 6 in + 4 ft + 6 in shared + 4 ft + 6 in = 9.5 ft > 9 ft
    const L = aisle(30, { dir: 'two', lane: 'two' }, [1, -1])
    const two = run(L)
    expect(two.lanes).toBe(2)
    expect(two.twoLaneFits).toBe(false)
    // Flagged, not blocked: judged and driven as single-lane until the engineer makes it so.
    expect(two.status).toBe('full')
    expect(applyClearance(L, [two]).segments[0].lane).toBe('single')
    const one = run({ ...L, segments: [{ ...L.segments[0], lane: 'single' }] })
    expect(one.lanes).toBe(1)
    expect(one.status).toBe('full')
  })

  it('the shared middle clearance counts once', () => {
    // 4.75 ft each side: 6 + 48 + 6 + 48 + 6 in = 9.5 ft fits exactly with sharing, not without
    const L = aisle(33, { dir: 'two', lane: 'two' }, [1, -1])
    expect(run(L).twoLaneFits).toBe(true)
    expect(run(L, { ...B56_5_RULE, sharedBetweenVehicles: false }).twoLaneFits).toBe(false)
  })

  it('changing the rule re-derives every cap and violation (acceptance 33)', () => {
    const L = aisle(8)
    expect(run(L).status).toBe('capped')
    expect(run(L, { ...B56_5_RULE, fullSpeedIn: 6 }).status).toBe('full')
    expect(run(L, { ...B56_5_RULE, lowSpeedIn: 10, fullSpeedIn: 12 }).status).toBe('violation')
  })

  it('capped routes are slowed and violations removed for the run', () => {
    const capped = applyClearance(aisle(8), [run(aisle(8))])
    expect(capped.segments[0].speedLimitFps).toBeLessThan(B56_5_RULE.thresholdFps)
    expect(applyClearance(aisle(4), [run(aisle(4))]).segments).toHaveLength(0)
  })
})

describe('envelope width (acceptance 29)', () => {
  it('loaded legs use the wider of vehicle and payload; other routes the empty vehicle', () => {
    const L: SimLayout = {
      points: [
        { id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' }, { id: 'B', x: 50, y: 0, type: 'stand', role: 'drop' },
        { id: 'C', x: 0, y: 30, type: 'charger' },
      ],
      segments: [{ id: 'AB', a: 'A', b: 'B', dir: 'two' }, { id: 'AC', a: 'A', b: 'C', dir: 'two' }],
    }
    const env = envelopes(L, [{ fromPointId: 'A', toPointId: 'B', vehicleWidthFt: 4.19 }], 4.5)
    expect(env('AB')).toBe(4.5)
    expect(env('AC')).toBe(4.19)
    expect(envelopes(L, [{ fromPointId: 'A', toPointId: 'B', vehicleWidthFt: 4.19 }], 3.33)('AB')).toBe(4.19)
  })
})

describe('lane width from the pallet (owner 2026-11-11)', () => {
  const c = 19.69 / 12
  it('single lane: envelope + full-speed clearance each side', () => {
    expect(laneWidthFt({ dir: 'ab' }, 4.5)).toBeCloseTo(4.5 + 2 * c, 6)
    expect(laneWidthFt({ dir: 'two', lane: 'single' }, 4.5)).toBeCloseTo(4.5 + 2 * c, 6)
  })
  it('two lanes: two envelopes, outer clearances and one shared clearance', () => {
    expect(laneWidthFt({ dir: 'two', lane: 'two' }, 4.5)).toBeCloseTo(9 + 3 * c, 6)
    expect(laneWidthFt({ dir: 'two', lane: 'two' }, 4.5, { ...B56_5_RULE, sharedBetweenVehicles: false })).toBeCloseTo(9 + 4 * c, 6)
  })
  it('a route snapped beside a face keeps full-speed clearance (single and two-lane)', () => {
    for (const seg of [{ dir: 'ab', lane: 'single' }, { dir: 'two', lane: 'two' }] as const) {
      const wall = { id: 'w', x: 0, y: 20, w: 100, h: 1 }
      const off = Math.ceil((laneWidthFt(seg, ENV) / 2) * 10) / 10
      const y = snapToObjects({ points: [], segments: [], objects: [wall] }, { x: 50, y: 20 - off + 0.3 }, 1, off).at.y
      const L: SimLayout = {
        points: [{ id: 'A', x: 0, y, type: 'junction' }, { id: 'B', x: 100, y, type: 'junction' }],
        segments: [{ id: 's', a: 'A', b: 'B', ...seg }], objects: [wall],
      }
      expect(segmentClearances(L, () => ENV)[0].status).toBe('full')
    }
  })
  it('with no envelope yet: 10 ft two-lane, 6 ft single-lane', () => {
    expect(laneWidthFt({ dir: 'two' })).toBe(10)
    expect(laneWidthFt({ dir: 'ba' })).toBe(6)
  })
  it('a wider pallet widens the lane', () => {
    expect(laneWidthFt({ dir: 'ab' }, 5)).toBeGreaterThan(laneWidthFt({ dir: 'ab' }, 4.19))
  })
})
