import { describe, expect, it } from 'vitest'
import { DERIVED, highwayConnections, highwayCorners, highwayEnds, highwayFromEnds, highwaysTouching, inJunction, insideHighway, withHighways } from '../highways'
import { addHighway, pointsInLoop, removeHighways, updateHighway, updateHighways, flowTargets, hitTest, notConnected, placeWithSpur, routeDistanceFt, spurTarget, splitSegment, snapDraw, highwayEndsAt, moveHighwayEnds, highwayLanes, laneKind } from '../layoutEdit'
import { segmentClearances, B56_5_RULE } from '../clearance'
import { runInputs } from '../runInputs'
import type { SimHighway, SimLayout } from '../types'
import { readinessChecks } from '../readiness'

const hw = (a: { x: number; y: number }, b: { x: number; y: number }, extra: Partial<SimHighway> = {}): SimHighway =>
  highwayFromEnds(a, b, 10, { id: extra.id ?? 'h1', dir: 'two', ...extra })

describe('highways: stored as rectangles, routes derived', () => {
  it('validation warns when the highways form separate networks', () => {
    const two: SimLayout = { points: [], segments: [], highways: [hw({ x: 0, y: 0 }, { x: 50, y: 0 }), hw({ x: 0, y: 100 }, { x: 50, y: 100 }, { id: 'h2' })] }
    const msg = (L: SimLayout) => readinessChecks({ layout: L, flows: [], vehicles: [], fleetNeeded: 0 }).map(c => c.text).join(' | ')
    expect(msg(two)).toMatch(/2 separate networks/)
    const joined = { ...two, highways: [...two.highways!, hw({ x: 25, y: 0 }, { x: 25, y: 100 }, { id: 'h3' })] }
    expect(msg(joined)).not.toMatch(/separate networks/)
  })

  it('connections: a crossing, a T and a corner each make one junction; loose ends and near misses are found', () => {
    const L: SimLayout = { points: [], segments: [], highways: [
      hw({ x: 0, y: 0 }, { x: 100, y: 0 }),                          // h1 main
      hw({ x: 50, y: -40 }, { x: 50, y: 40 }, { id: 'h2' }),          // crosses h1
      hw({ x: 80, y: 0 }, { x: 80, y: 40 }, { id: 'h3' }),            // T off h1 (end on its centre line)
      hw({ x: 100, y: 0 }, { x: 100, y: -40 }, { id: 'h4' }),         // corner at h1's end
      hw({ x: 0, y: 60 }, { x: 0, y: 103 }, { id: 'h5' }),            // stops 3 ft short of h6: near miss
      hw({ x: -30, y: 106 }, { x: 30, y: 106 }, { id: 'h6' }),
    ] }
    const { joins, loose } = highwayConnections(L)
    const pair = (a: string, b: string) => joins.find(j => j.ids.includes(a) && j.ids.includes(b))
    expect(pair('h1', 'h2')!.at).toMatchObject({ x: 50, y: 0 })
    expect(pair('h1', 'h3')).toBeTruthy()
    const corner = pair('h1', 'h4')!
    expect(inJunction([corner], { x: 104, y: 4 })).toBe(true)          // the outer corner is filled
    expect(inJunction(joins, { x: 30, y: 0 })).toBe(false)             // open aisle: not a junction
    const ends = loose.map(e => `${e.id}:${e.end}`)
    expect(ends).toEqual(expect.arrayContaining(['h1:a', 'h2:a', 'h2:b', 'h3:b', 'h4:b', 'h5:a', 'h5:b', 'h6:a', 'h6:b']))
    expect(ends).not.toContain('h1:b')                                    // the corner joins it
    const near = loose.find(e => e.id === 'h5' && e.end === 'b')!.near!
    expect(near.x).toBeCloseTo(0); expect(near.y).toBeCloseTo(106)                // straight on, along its own line
    expect(loose.find(e => e.id === 'h2' && e.end === 'a')!.near).toBeNull()
    expect(loose.find(e => e.id === 'h5' && e.end === 'b')!.join).toMatchObject({ id: 'h5', end: 'b' })   // h5 runs straight on
    // A side-on near miss: v stops beside h's end but its own line misses h; h runs straight on into v.
    const side: SimLayout = { points: [], segments: [], highways: [hw({ x: 0, y: 0 }, { x: 100, y: 0 }, { id: 'v' }), hw({ x: 50, y: 30 }, { x: 50, y: 10 }, { id: 'h' })] }
    const rot: SimLayout = { ...side, highways: [hw({ x: 170, y: 0 }, { x: 170, y: 120 }, { id: 'v' }), hw({ x: 0, y: 120 }, { x: 160, y: 120 }, { id: 'h' })] }
    expect(highwayConnections(side).loose.find(e => e.id === 'h' && e.end === 'b')!.join).toMatchObject({ id: 'h', end: 'b' })
    expect(highwayConnections(rot).loose.find(e => e.id === 'v' && e.end === 'b')!.join).toMatchObject({ id: 'h', end: 'b' })
  })

  it('a lasso selects every highway it touches, and changes or removes them together', () => {
    const L: SimLayout = {
      points: [{ id: 'S', x: 20, y: 0, type: 'stand' }, { id: 'far', x: 300, y: 300, type: 'stand' }], segments: [],
      highways: [hw({ x: 0, y: 0 }, { x: 40, y: 0 }), hw({ x: 0, y: 100 }, { x: 40, y: 100 }, { id: 'h2', dir: 'ab' }), hw({ x: 200, y: 0 }, { x: 200, y: 40 }, { id: 'h3' })],
    }
    // A loop that only crosses the first highway's end, and one that encloses the second whole.
    expect(highwaysTouching(L, [{ x: 35, y: -20 }, { x: 60, y: -20 }, { x: 60, y: 20 }, { x: 35, y: 20 }])).toEqual(['h1'])
    expect(highwaysTouching(L, [{ x: -10, y: 80 }, { x: 60, y: 80 }, { x: 60, y: 120 }, { x: -10, y: 120 }])).toEqual(['h2'])
    expect(highwaysTouching(L, [{ x: 100, y: 50 }, { x: 120, y: 50 }, { x: 110, y: 60 }])).toEqual([])
    expect(pointsInLoop(L, [{ x: 10, y: -5 }, { x: 30, y: -5 }, { x: 30, y: 5 }, { x: 10, y: 5 }])).toEqual(['S'])
    const wide = updateHighways(L, ['h1', 'h3'], () => ({ widthFt: 14 }))
    expect(wide.highways!.map(h => h.widthFt)).toEqual([14, 10, 14])
    const moved = updateHighways(L, ['h1', 'h2'], h => ({ x: h.x + 5 }))
    expect(moved.points.find(p => p.id === 'S')!.x).toBe(25)                  // the station on h1 goes with it
    expect(removeHighways(L, ['h1', 'h3']).highways!.map(h => h.id)).toEqual(['h2'])
  })

  it('moving two crossing highways together moves their shared junction once; a loop drawn round twice still holds its points', () => {
    const L: SimLayout = { points: [{ id: 'J', x: 20, y: 20, type: 'junction' }], segments: [],
      highways: [hw({ x: 0, y: 20 }, { x: 40, y: 20 }), hw({ x: 20, y: 0 }, { x: 20, y: 40 }, { id: 'h2' })] }
    const up = updateHighways(L, ['h1', 'h2'], h => ({ y: h.y - 5 }))
    expect(up.points[0]).toMatchObject({ x: 20, y: 15 })
    const sq = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }]
    expect(pointsInLoop(L, [...sq, ...sq])).toEqual(['J'])
  })

  it('a point on the centre line goes with the highway when it moves or stretches; the angle stays within ±180°', () => {
    const L: SimLayout = { points: [{ id: 'J', x: 10, y: 0, type: 'junction' }, { id: 'far', x: 10, y: 9, type: 'stand' }], segments: [], highways: [hw({ x: 0, y: 0 }, { x: 40, y: 0 })] }
    const moved = updateHighway(L, 'h1', { y: 2 })
    expect(moved.points.map(p => [p.x, p.y])).toEqual([[10, 2], [10, 9]])
    const { a } = highwayEnds(L.highways![0])
    const stretched = updateHighway(L, 'h1', highwayFromEnds(a, { x: 60, y: 0 }, 10, { id: 'h1', dir: 'two' }))
    expect(stretched.points[0].x).toBeCloseTo(10)                            // kept from the end that stayed
    expect(updateHighway(L, 'h1', { angleDeg: 400 }).highways![0].angleDeg).toBeCloseTo(40)
    expect(updateHighway(L, 'h1', { angleDeg: 270 }).highways![0].angleDeg).toBeCloseTo(-90)
  })

  it('two points facing each other across the line at the same station are both joined', () => {
    const L: SimLayout = { points: [{ id: 'P', x: 20, y: 0.5, type: 'stand', role: 'pick' }, { id: 'D', x: 20, y: -0.5, type: 'stand', role: 'drop' }], segments: [], highways: [hw({ x: 0, y: 0 }, { x: 40, y: 0 })] }
    expect(routeDistanceFt(L, `${DERIVED}h1:a`, `${DERIVED}h1:b`)).toBeLessThan(42)
    expect(isFinite(routeDistanceFt(L, 'P', 'D'))).toBe(true)
  })

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
    expect(withHighways(L)).toBe(net)                                       // expanded once per layout
    // A point just past an end (within reach) is the end — no gap at the highway's end.
    const past: SimLayout = { points: [{ id: 'P', x: -0.5, y: 0, type: 'stand', role: 'pick' }], segments: [], highways: [hw({ x: 0, y: 0 }, { x: 30, y: 0 })] }
    expect(notConnected(past)).toEqual([])
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
    expect(splitSegment(L, `${DERIVED}nope:0`, { x: 5, y: 3 })).toBeNull()
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
    const r = runInputs(L, [{ id: 'f', fromPointId: 'P', toPointId: 'D', thruPerHr: 10, vehicleId: 'x' }], new Map(), B56_5_RULE)
    expect(Object.entries(r.laneWidths).filter(([k]) => k.startsWith(DERIVED)).every(([, w]) => w === 10)).toBe(true)
    expect(flowTargets(L, 'P', [])!.targets.find(t => t.id === 'D')).toMatchObject({ ok: true, distanceFt: 40 })
  })
})

describe('a run on highways alone', () => {
  it('drives a full shift: the Pick and Drop sit on a highway, chargers join it by spurs', async () => {
    const { createSim, runFor } = await import('../engine')
    const { results } = await import('../results')
    const { LIBRARY, settings } = await import('./fixtures')
    const L: SimLayout = {
      points: [
        { id: 'A', x: 0, y: 0, type: 'stand', role: 'pick', name: 'A' }, { id: 'B', x: 150, y: 0, type: 'stand', role: 'drop', name: 'B' },
        { id: 'J', x: 20, y: 0, type: 'junction' }, { id: 'C', x: 20, y: 20, type: 'charger', name: 'Charger 1' },
      ],
      segments: [{ id: 's1', a: 'J', b: 'C', dir: 'two', lane: 'single' }],
      highways: [{ ...highwayFromEnds({ x: 0, y: 0 }, { x: 150, y: 0 }, 13.4, { id: 'h1', dir: 'two' }) }],
    }
    const flows = [{ id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 10, vehicleId: 'cb18' }]
    const r = runInputs(L, flows, new Map(LIBRARY.map(v => [v.id, v])), B56_5_RULE)
    const S = createSim(r.layout, r.flows, LIBRARY, settings())!
    expect(S).not.toBeNull()
    runFor(S, 2 * 3600)
    const t = results(S).types.find(x => x.vehicleId === 'cb18')!
    expect(t.done).toBeGreaterThan(10)
  })
})

describe('path editor (owner, 2026-11-16)', () => {
  const two = (id: string, a: { x: number; y: number }, b: { x: number; y: number }) => highwayFromEnds(a, b, 10, { id, dir: 'two', lane: 'single' })
  const L0 = { points: [], segments: [], highways: [two('h1', { x: 0, y: 0 }, { x: 100, y: 0 }), two('h2', { x: 100, y: 0 }, { x: 100, y: 60 })] }

  it('snaps a drawn end to 45° and, with Shift, to any angle', () => {
    const empty = { points: [], segments: [] }
    const s = snapDraw(empty, { x: 50, y: 46 }, { px: 0.01, from: { x: 0, y: 0 }, diag: true })
    expect(s.at.x).toBeCloseTo(s.at.y, 6)
    const flat = snapDraw(empty, { x: 50, y: 8 }, { px: 0.01, from: { x: 0, y: 0 }, diag: true })
    expect(flat.at.y).toBe(0)
    const free = snapDraw(empty, { x: 50, y: 46 }, { px: 0.01, from: { x: 0, y: 0 }, diag: true, lock: true })
    expect(free.at.y).not.toBeCloseTo(free.at.x, 1)
  })

  it('joins another path along the drawn angle', () => {
    // From (60, 40) at 45° up-left towards h1's centre line (y = 0): lands at x = 20.
    const s = snapDraw(withHighways(L0), { x: 20.3, y: 0.4 }, { px: 0.05, from: { x: 60, y: 40 }, diag: true })
    expect(s.kind).toBe('route')
    expect(s.at.x).toBeCloseTo(20, 6)
    expect(s.at.y).toBeCloseTo(0, 6)
  })

  it('finds the ends at a corner and moves them together', () => {
    const at = { x: 100, y: 0 }
    expect(highwayEndsAt(L0, at, 'h1')).toEqual([{ id: 'h2', end: 'a' }])
    const moved = moveHighwayEnds(L0, [{ id: 'h1', end: 'b' }, { id: 'h2', end: 'a' }], { x: 90, y: 10 })
    const [h1, h2] = moved.highways!.map(highwayEnds)
    expect(h1.b.x).toBeCloseTo(90); expect(h1.b.y).toBeCloseTo(10)
    expect(h2.a.x).toBeCloseTo(90); expect(h2.a.y).toBeCloseTo(10)
    expect(h2.b.y).toBeCloseTo(60)
  })

  it('moves a corner as one or not at all', () => {
    // h2 would be under 2 ft: neither end moves, so the corner stays joined.
    expect(moveHighwayEnds(L0, [{ id: 'h1', end: 'b' }, { id: 'h2', end: 'a' }], { x: 100, y: 59 })).toBe(L0)
  })

  it('counts lanes and sets direction for a lane count', () => {
    expect(highwayLanes({ dir: 'two', lane: 'two' })).toBe(2)
    expect(highwayLanes({ dir: 'two' })).toBe(2)
    expect(highwayLanes({ dir: 'two', lane: 'single' })).toBe(1)
    expect(highwayLanes({ dir: 'ab', lane: 'two' })).toBe(1)
    expect(laneKind({ dir: 'ab' }, 2)).toEqual({ dir: 'two', lane: 'two' })
    expect(laneKind({ dir: 'two' }, 1)).toEqual({ dir: 'two', lane: 'single' })
    expect(laneKind({ dir: 'ba' }, 1)).toEqual({ dir: 'ba', lane: undefined })
  })
})
