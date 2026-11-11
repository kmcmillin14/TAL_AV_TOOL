import { describe, expect, it } from 'vitest'
import {
  addObject, copyPoints, snapToObjects, hitTest as hit2, movePoints, objectCorners, pointsInBox, removePoints, repeatPoint, segmentLengthFt, setCurve, splineHandles,
  addPoint, addSegment, emptyLayout, flowRefusal, flowStartRefusal, hitTest, linkFlow, linkSuggestions, measureFlows, notConnected,
  placeOnSegment, removePoint, rescaleLayout, routeDistanceFt, splitSegment, updatePoint, updateSegment, withLayoutDistance,
} from '../layoutEdit'
import type { SimLayout } from '../types'

/** Pick at (0,0), Drop at (400,0), joined by one two-way route. */
function line(): { L: SimLayout; a: string; b: string; s: string } {
  let L = emptyLayout()
  const A = addPoint(L, { x: 0, y: 0 }, 'stand', 'pick'); L = A.layout
  const B = addPoint(L, { x: 400, y: 0 }, 'conveyor', 'drop'); L = B.layout
  const S = addSegment(L, A.id, B.id)
  return { L: S.layout, a: A.id, b: B.id, s: S.id! }
}

describe('placing points and routes', () => {
  it('names flow points by type, gives them a role, and leaves junctions plain', () => {
    const { L } = line()
    expect(L.points.map(p => [p.name, p.role])).toEqual([['Stand 1', 'pick'], ['Conveyor 1', 'drop']])
    const J = addPoint(L, { x: 5, y: 5 }, 'junction').layout.points.at(-1)!
    expect(J.name).toBeUndefined(); expect(J.role).toBeUndefined()
    expect(addPoint(L, { x: 1, y: 1 }, 'charger').layout.points.at(-1)!.role).toBeUndefined()
  })

  it('refuses a route to itself and a duplicate route', () => {
    const { L, a, b } = line()
    expect(addSegment(L, a, a).id).toBeNull()
    expect(addSegment(L, b, a).id).toBeNull()
  })

  it('stores a one-way route as single-lane', () => {
    const { L, a } = line()
    const C = addPoint(L, { x: 0, y: 50 }, 'junction')
    const S = addSegment(C.layout, a, C.id, { dir: 'ab', lane: 'two' })
    expect(S.layout.segments.find(s => s.id === S.id)).toMatchObject({ dir: 'ab', lane: 'single' })
  })

  it('a 400 ft straight route measures 400 ft; one-way A→B makes B→A "No route" (acceptance 2)', () => {
    const { L, a, b, s } = line()
    expect(routeDistanceFt(L, a, b)).toBeCloseTo(400, 1)
    const oneWay = updateSegment(L, s, { dir: 'ab' })
    expect(routeDistanceFt(oneWay, a, b)).toBeCloseTo(400, 1)
    expect(routeDistanceFt(oneWay, b, a)).toBe(Infinity)
  })

  it('splitting a route keeps its length, direction and lane', () => {
    const { L, a, b, s } = line()
    const one = updateSegment(L, s, { dir: 'ab', lane: 'single' })
    const split = splitSegment(one, s, { x: 150, y: 7 })!
    expect(split.layout.points.find(p => p.id === split.id)).toMatchObject({ x: 150, y: 0, type: 'junction' })
    expect(split.layout.segments).toHaveLength(2)
    expect(split.layout.segments.every(q => q.dir === 'ab' && q.lane === 'single')).toBe(true)
    expect(routeDistanceFt(split.layout, a, b)).toBeCloseTo(400, 1)
    expect(routeDistanceFt(split.layout, b, a)).toBe(Infinity)
  })

  it('a point placed on a route joins it', () => {
    const { L, a, b, s } = line()
    const placed = placeOnSegment(L, s, { x: 100, y: 3 }, 'charger')!
    expect(placed.layout.points.find(p => p.id === placed.id)).toMatchObject({ x: 100, y: 0, type: 'charger', name: 'Charger 1' })
    expect(notConnected(placed.layout)).toEqual([])
    expect(routeDistanceFt(placed.layout, a, b)).toBeCloseTo(400, 1)
  })

  it('removing a point removes its routes', () => {
    const { L, a } = line()
    expect(removePoint(L, a).segments).toHaveLength(0)
  })

  it('hit-tests points before routes', () => {
    const { L, a, s } = line()
    expect(hitTest(L, { x: 1, y: 1 }, 3, 3)).toEqual({ kind: 'point', id: a })
    expect(hitTest(L, { x: 200, y: 2 }, 3, 3)).toMatchObject({ kind: 'segment', id: s, x: 200, y: 0 })
    expect(hitTest(L, { x: 200, y: 20 }, 3, 3)).toBeNull()
  })
})

describe('Not connected (acceptance 10)', () => {
  it('a point off every route is listed; junctions never are', () => {
    const { L } = line()
    const off = addPoint(L, { x: 50, y: 80 }, 'charger').layout
    expect(notConnected(off).map(p => p.name)).toEqual(['Charger 1'])
    expect(notConnected(addPoint(L, { x: 9, y: 9 }, 'junction').layout)).toEqual([])
  })
})

describe('flows from points (acceptance 11)', () => {
  it('refuses Drop → Pick, the same point twice, and a vehicle point', () => {
    const { L, a, b } = line()
    expect(flowRefusal(L, a, b)).toBeNull()
    expect(flowRefusal(L, b, a)).toBe('Start a flow at a Pick point.')
    expect(flowRefusal(L, a, a)).toBe('A flow needs two different points.')
    expect(flowStartRefusal(L, b)).toBe('Start a flow at a Pick point.')
    expect(flowStartRefusal(L, a)).toBeNull()
    const C = addPoint(L, { x: 0, y: 30 }, 'charger')
    expect(flowRefusal(C.layout, a, C.id)).toBe('End a flow at a Drop point.')
    expect(flowRefusal(updatePoint(L, b, { role: 'pickDrop' }), b, a)).toBe('End a flow at a Drop point.')
  })

  it('a linked flow takes its distance from the layout and its names from the points', () => {
    const { L, a, b } = line()
    const f = linkFlow(L, { id: 'f1', distanceFt: 55 }, a, b)
    expect(f).toMatchObject({ fromPointId: a, toPointId: b, distanceSource: 'layout', distanceFt: 400, origin: 'Stand 1', destination: 'Conveyor 1' })
    const moved = updatePoint(updatePoint(L, b, { x: 250, heightFt: 3 }), a, { heightFt: 1.5 })
    expect(withLayoutDistance(moved, f)).toMatchObject({ distanceFt: 250, liftHeightFt: 4.5 })
  })

  it('with no route the typed distance stays — nothing invented', () => {
    const { L, a, b, s } = line()
    const f = linkFlow(L, { id: 'f1', distanceFt: 55 }, a, b)
    expect(withLayoutDistance(updateSegment(L, s, { dir: 'ba' }), f).distanceFt).toBe(400)
    expect(withLayoutDistance(L, { id: 'typed', distanceFt: 55 }).distanceFt).toBe(55)
  })

  it('measures every linked flow at once and leaves typed flows alone', () => {
    const { L, a, b } = line()
    const typed = { id: 't', distanceFt: 55 }
    const flows = measureFlows(updatePoint(L, b, { x: 300 }), [linkFlow(L, { id: 'f' } as { id: string; distanceFt?: number }, a, b), typed])
    expect(flows[0].distanceFt).toBe(300)
    expect(flows[1]).toBe(typed)
    expect(measureFlows(L, [typed])[0]).toBe(typed)
  })

  it('suggests links by name for Sizing flows, Pick → Drop only', () => {
    const { L, a, b } = line()
    const flows = [
      { id: 'match', origin: ' stand 1', destination: 'CONVEYOR 1' },
      { id: 'backwards', origin: 'Conveyor 1', destination: 'Stand 1' },
      { id: 'linked', fromPointId: a, toPointId: b },
    ]
    expect(linkSuggestions(L, flows)).toEqual([{ flowId: 'match', from: a, to: b }, { flowId: 'backwards' }])
  })
})

describe('setting the drawing scale', () => {
  it('rescales what was drawn so it stays on the drawing', () => {
    const { L, a, b } = line()
    const k = rescaleLayout(L, 0.5)
    expect(routeDistanceFt(k, a, b)).toBeCloseTo(200, 1)
  })
})

describe('Repeat (acceptance 14)', () => {
  it('Repeat ×6 at 5 ft makes six named, evenly spaced points in one edit', () => {
    const base = addPoint(emptyLayout(), { x: 10, y: 20 }, 'charger')
    const { layout, ids } = repeatPoint(base.layout, base.id, 6, 5, { x: 1, y: 0 })
    const made = ids.map(id => layout.points.find(p => p.id === id)!)
    expect(made.map(p => p.name)).toEqual(['Charger 1', 'Charger 2', 'Charger 3', 'Charger 4', 'Charger 5', 'Charger 6'])
    expect(made.map(p => p.x)).toEqual([10, 15, 20, 25, 30, 35])
    expect(new Set(ids).size).toBe(6)
    expect(base.layout.points).toHaveLength(1)          // the old layout is untouched: one undo restores it
  })
})

describe('copy, move, remove, marquee', () => {
  it('copies points and the routes between them, with fresh names', () => {
    const { L, a, b } = line()
    const { layout, ids } = copyPoints(L, [a, b], { x: 0, y: 50 })
    expect(ids).toHaveLength(2)
    expect(layout.segments).toHaveLength(2)
    expect(layout.points.slice(2).map(p => [p.name, p.y])).toEqual([['Stand 2', 50], ['Conveyor 2', 50]])
    expect(routeDistanceFt(layout, ids[0], ids[1])).toBeCloseTo(400, 1)
  })

  it('moves several points together and removes several at once', () => {
    const { L, a, b } = line()
    expect(routeDistanceFt(movePoints(L, [a, b], { x: 3, y: 4 }), a, b)).toBeCloseTo(400, 1)
    expect(removePoints(L, [a, b])).toMatchObject({ points: [], segments: [] })
  })

  it('selects the points inside a box', () => {
    const { L, a } = line()
    expect(pointsInBox(L, { x: -5, y: -5 }, { x: 100, y: 5 })).toEqual([a])
  })
})

describe('curves (spec §5.5)', () => {
  it('a bent route is longer than the straight one and is still hit along its curve', () => {
    const { L, a, b, s } = line()
    const bent = setCurve(L, s, { kind: 'arc', mid: { x: 200, y: 100 } })
    const seg = bent.segments[0]
    expect(segmentLengthFt(bent, seg)).toBeGreaterThan(400)
    expect(routeDistanceFt(bent, a, b)).toBeCloseTo(segmentLengthFt(bent, seg), 0)
    expect(hit2(bent, { x: 200, y: 98 }, 1, 3)).toMatchObject({ kind: 'segment', id: s })
    expect(hit2(bent, { x: 200, y: 2 }, 1, 3)).toBeNull()
  })

  it('spline handles start on the route, so converting does not move it', () => {
    const { L, s } = line()
    const h = splineHandles(L, s)!
    if (h.kind !== 'bezier') throw new Error('expected a spline')
    expect([h.c1.x, h.c1.y, h.c2.x, h.c2.y].map(v => Math.round(v * 1000) / 1000)).toEqual([133.333, 0, 266.667, 0])
    expect(segmentLengthFt(setCurve(L, s, splineHandles(L, s)!), L.segments[0])).toBeCloseTo(400, 0)
  })
})

describe('fixed objects (spec §5.8)', () => {
  it('a dragged rectangle becomes an object that can be hit; tiny drags are ignored', () => {
    const { L } = line()
    const o = addObject(L, { x: 100, y: 20 }, { x: 140, y: 30 })
    expect(o.layout.objects).toEqual([{ id: 'o1', x: 100, y: 20, w: 40, h: 10, name: 'Object 1' }])
    expect(hit2(o.layout, { x: 120, y: 25 }, 1, 1)).toEqual({ kind: 'object', id: 'o1' })
    expect(addObject(L, { x: 0, y: 0 }, { x: 0.05, y: 3 }).id).toBeNull()
  })

  it('a turned object has turned corners', () => {
    const c = objectCorners({ id: 'o', x: 0, y: 0, w: 10, h: 2, rotationDeg: 90 })
    expect(c.map(p => [Math.round(p.x), Math.round(p.y)])).toEqual([[6, -4], [6, 6], [4, 6], [4, -4]])
  })
})

describe('routes snap to objects', () => {
  const L = { points: [], segments: [], objects: [{ id: 'o', x: 10, y: 10, w: 20, h: 4 }] }
  it('snaps to a corner first, then to an edge, else leaves the spot', () => {
    expect(snapToObjects(L, { x: 10.6, y: 9.5 }, 1)).toEqual({ at: { x: 10, y: 10 }, snapped: 'corner' })
    expect(snapToObjects(L, { x: 20, y: 9.4 }, 1)).toEqual({ at: { x: 20, y: 10 }, snapped: 'edge' })
    expect(snapToObjects(L, { x: 50, y: 50 }, 1)).toEqual({ at: { x: 50, y: 50 }, snapped: null })
  })
  it('new routes take the chosen direction and lanes', () => {
    const { L: line0 } = line()
    const J = addPoint(line0, { x: 0, y: 50 }, 'junction')
    const s = addSegment(J.layout, line0.points[0].id, J.id, { dir: 'ab', lane: 'single' })
    expect(s.layout.segments.at(-1)).toMatchObject({ dir: 'ab', lane: 'single' })
  })
})
