import { describe, expect, it } from 'vitest'
import { DERIVED, highwayCorners, highwayEnds, highwayFromEnds, insideHighway, withHighways } from '../highways'
import { addHighway, flowTargets, hitTest, notConnected, placeWithSpur, routeDistanceFt, spurTarget, splitSegment } from '../layoutEdit'
import { segmentClearances, B56_5_RULE } from '../clearance'
import { runInputs } from '../runInputs'
import type { SimHighway, SimLayout } from '../types'

const hw = (a: { x: number; y: number }, b: { x: number; y: number }, extra: Partial<SimHighway> = {}): SimHighway =>
  highwayFromEnds(a, b, 10, { id: extra.id ?? 'h1', dir: 'two', ...extra })

describe('highways: stored as rectangles, routes derived', () => {
  it('ends, corners and inside follow the angle', () => {
    const h = hw({ x: 0, y: 0 }, { x: 0, y: 40 })
    expect(h).toMatchObject({ x: 0, y: 20, lengthFt: 40, angleDeg: 90 })
    const { a, b } = highwayEnds(h)
    expect(a.y).toBeCloseTo(0); expect(b.y).toBeCloseTo(40)
    expect(highwayCorners(h).map(c => Math.round(Math.abs(c.x)))).toEqual([5, 5, 5, 5])
    expect(insideHighway(h, { x: 4, y: 10 })).toBe(true)
    expect(insideHighway(h, { x: 6, y: 10 })).toBe(false)
  })

  it('becomes routes: ends, points on its centre line and crossings split it; a second call is a no-op', () => {
    const L: SimLayout = {
      points: [{ id: 'S', x: 20, y: 0, type: 'stand', role: 'pick' }, { id: 'off', x: 20, y: 6, type: 'stand', role: 'drop' }],
      segments: [],
      highways: [hw({ x: 0, y: 0 }, { x: 40, y: 0 }), hw({ x: 30, y: -20 }, { x: 30, y: 20 }, { id: 'h2', dir: 'ab' })],
    }
    const net = withHighways(L)
    expect(net.highways).toBeUndefined()
    expect(withHighways(net)).toBe(net)
    const h1 = net.segments.filter(s => s.highwayId === 'h1')
    // h1: end a → S → crossing → end b
    expect(h1.map(s => [s.a, s.b])).toEqual([[`${DERIVED}h1:a`, 'S'], ['S', `${DERIVED}x:h1:h2`], [`${DERIVED}x:h1:h2`, `${DERIVED}h1:b`]])
    expect(h1.every(s => s.dir === 'two' && s.lane === 'two' && s.widthFt === 10)).toBe(true)
    expect(net.segments.filter(s => s.highwayId === 'h2').map(s => s.dir)).toEqual(['ab', 'ab'])
    // routed like any route; the point off the centre line is not joined
    expect(routeDistanceFt(L, 'S', `${DERIVED}h1:b`)).toBeCloseTo(20)
    expect(notConnected(L).map(p => p.id)).toEqual(['off'])
  })

  it('an existing point at an end is joined; two highways meeting end to end connect', () => {
    const L: SimLayout = { points: [{ id: 'C', x: 0, y: 0, type: 'charger' }], segments: [], highways: [hw({ x: 0, y: 0 }, { x: 30, y: 0 }), hw({ x: 30, y: 0 }, { x: 30, y: 30 }, { id: 'h2' })] }
    const net = withHighways(L)
    expect(net.segments[0].a).toBe('C')
    expect(routeDistanceFt(L, 'C', `${DERIVED}h2:b`)).toBeCloseTo(60)
  })

  it('spurs, splits and hit tests treat a highway like a route — and store only a junction on it', () => {
    const L: SimLayout = { points: [], segments: [], highways: [hw({ x: 0, y: 0 }, { x: 40, y: 0 })] }
    const t = spurTarget(L, { x: 10, y: 15 })!
    expect(t.at).toEqual({ x: 10, y: 0 })
    const placed = placeWithSpur(L, { x: 10, y: 15 }, 'stand', 'pick', t)
    expect(placed.layout.highways).toHaveLength(1)
    expect(placed.layout.segments).toHaveLength(1)                          // only the spur is stored
    expect(notConnected(placed.layout)).toEqual([])
    expect(routeDistanceFt(placed.layout, placed.id, `${DERIVED}h1:b`)).toBeCloseTo(15 + 30)
    expect(splitSegment(L, `${DERIVED}h1:0`, { x: 5, y: 3 })!.layout.points[0]).toMatchObject({ x: 5, y: 0, type: 'junction' })
    expect(hitTest(L, { x: 20, y: 3 }, 1, 1)).toEqual({ kind: 'highway', id: 'h1' })
    expect(addHighway(L, { x: 0, y: 0 }, { x: 1, y: 0 }, 10).id).toBeNull()   // too short
  })

  it('width is judged by B56.5 like a wall each side: full speed, slowed, blocked; a second lane that does not fit', () => {
    const at = (w: number, extra: Partial<SimHighway> = {}) => {
      const L = withHighways({ points: [], segments: [], highways: [{ ...hw({ x: 0, y: 0 }, { x: 40, y: 0 }, extra), widthFt: w }] })
      return segmentClearances(L, () => 4, B56_5_RULE)[0]
    }
    const c = B56_5_RULE.fullSpeedIn / 12, low = B56_5_RULE.lowSpeedIn / 12
    expect(at(4 + 2 * c + 0.01, { dir: 'ab' }).status).toBe('full')
    expect(at(4 + 2 * low + 0.01, { dir: 'ab' }).status).toBe('capped')
    expect(at(4 + 2 * low - 0.1, { dir: 'ab' }).status).toBe('violation')
    expect(at(2 * 4 + 3 * c + 0.01).status).toBe('full')
    expect(at(4 + 2 * c + 0.01).twoLaneFits).toBe(false)                   // two-way, room for one lane
  })

  it('drives the run: lane widths at the highway width; flow targets reach across it', () => {
    const L: SimLayout = {
      points: [{ id: 'P', x: 0, y: 10, type: 'stand', role: 'pick' }, { id: 'D', x: 40, y: 10, type: 'stand', role: 'drop' }],
      segments: [], highways: [hw({ x: 0, y: 10 }, { x: 40, y: 10 })],
    }
    const r = runInputs(L, [{ id: 'f', fromPointId: 'P', toPointId: 'D', thruPerHr: 10, vehicleId: 'x' }], new Map(), B56_5_RULE, 0)
    expect(Object.entries(r.laneWidths).filter(([k]) => k.startsWith(DERIVED)).every(([, w]) => w === 10)).toBe(true)
    expect(flowTargets(L, 'P', [])!.targets.find(t => t.id === 'D')).toMatchObject({ ok: true, distanceFt: 40 })
  })
})
