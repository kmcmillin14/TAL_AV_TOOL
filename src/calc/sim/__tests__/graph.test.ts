import { describe, expect, it } from 'vitest'
import { segmentGeometry } from '../geometry'
import { buildGraph, pathLen, route } from '../graph'
import { corridor } from './fixtures'

describe('geometry', () => {
  it('straight segment length and midpoint', () => {
    const g = segmentGeometry({ x: 0, y: 0 }, { x: 30, y: 40 })
    expect(g.length).toBeCloseTo(50, 9)
    expect(g.at(25)).toMatchObject({ x: 15, y: 20 })
  })
  it('arc through a mid handle: quarter circle r = 10 has length 5π', () => {
    const mid = { x: 10 * Math.cos(-Math.PI / 4), y: 10 + 10 * Math.sin(-Math.PI / 4) }
    const g = segmentGeometry({ x: 0, y: 0 }, { x: 10, y: 10 }, { kind: 'arc', mid })
    expect(g.length).toBeCloseTo(5 * Math.PI, 6)
    const end = g.at(g.length)
    expect(end.x).toBeCloseTo(10, 6); expect(end.y).toBeCloseTo(10, 6)
    // tangent at the start points along +x (leaving the bottom of the circle)
    expect(g.at(0).tx).toBeCloseTo(1, 6)
  })
  it('a Bézier with collinear handles measures the straight distance', () => {
    const g = segmentGeometry({ x: 0, y: 0 }, { x: 90, y: 0 }, { kind: 'bezier', c1: { x: 30, y: 0 }, c2: { x: 60, y: 0 } })
    expect(g.length).toBeCloseTo(90, 3)
  })
})

describe('graph (acceptance 2, 3)', () => {
  it('2 — a 400 ft straight two-way route measures 400 ft', () => {
    const G = buildGraph(corridor(400))
    expect(pathLen(G, G.idx.get('A')!, G.idx.get('B')!)).toBeCloseTo(400, 1)
    expect(pathLen(G, G.idx.get('B')!, G.idx.get('A')!)).toBeCloseTo(400, 1)
  })
  it('2 — one-way A→B gives B→A "No route"', () => {
    const G = buildGraph(corridor(400, { dir: 'ab' }))
    expect(route(G, G.idx.get('A')!, G.idx.get('B')!)).not.toBeNull()
    expect(route(G, G.idx.get('B')!, G.idx.get('A')!)).toBeNull()
  })
  it('3 — crossing routes without a joined point create no junction', () => {
    const G = buildGraph({
      points: [
        { id: 'P1', x: 0, y: 0, type: 'stand', role: 'pick' }, { id: 'P2', x: 100, y: 100, type: 'junction' },
        { id: 'P3', x: 0, y: 100, type: 'stand', role: 'drop' }, { id: 'P4', x: 100, y: 0, type: 'junction' },
      ],
      segments: [{ id: 'x1', a: 'P1', b: 'P2', dir: 'two' }, { id: 'x2', a: 'P3', b: 'P4', dir: 'two' }],
    })
    expect(route(G, G.idx.get('P1')!, G.idx.get('P3')!)).toBeNull()
  })
  it('lists points no route touches as not connected', () => {
    const L = corridor(100)
    L.points.push({ id: 'X', x: 50, y: 50, type: 'stand', role: 'drop', name: 'Loose' })
    expect(buildGraph(L).unconnected).toEqual(['X'])
  })
})
