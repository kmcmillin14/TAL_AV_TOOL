import { describe, expect, it } from 'vitest'
import { createSim, flowExclusion, runFor } from '../engine'
import { buildGraph } from '../graph'
import { flipRack, rackCount, rackFromBox, rackGeometry, rackLengthFor, rackSlots, stretchRack, withRackSlots } from '../racks'
import { results } from '../results'
import type { SimLayout, SimPoint, SimRack } from '../types'
import { LIBRARY, cb18, corridor, settings } from './fixtures'

const loads = [{ id: 'L1', lengthIn: 48, widthIn: 40, heightIn: 48 }]
const rack = (over: Partial<SimRack> = {}): SimRack => ({ lengthFt: 40, angleDeg: 0, depthFt: 4, away: 1, levels: 3, perBay: 2, face: 'short', pallet: { loadId: 'L1' }, ...over })
const at = (r: SimRack): SimPoint => ({ id: 'R', x: 0, y: 0, type: 'rack', role: 'drop', name: 'Rack 1', rack: r })

describe('racks (Milestone 7a)', () => {
  it('sizes a position from the pallet and the face picked up (gaps 4 / 5 / 6 in)', () => {
    const g = rackGeometry(at(rack()), loads)!
    expect(g.slotIn).toBe(44)              // 40 in face + 4
    expect(g.levelIn).toBe(59)             // 48 + 5 + 6
    expect(g.depthIn).toBe(48)
    expect(g.bayIn).toBe(92)               // 2 × 44 + 4
    expect(g.bays).toBe(5)                 // 480 in ÷ 92
    expect(rackCount(g, 3)).toBe('10 long × 3 high = 30 positions')
    expect(g.topBeamFt).toBeCloseTo(118 / 12, 9)
    const long = rackGeometry(at(rack({ face: 'long' })), loads)!
    expect([long.slotIn, long.depthIn]).toEqual([52, 40])
    const edited = rackGeometry(at(rack({ levelIn: 50 })), loads)!
    expect(edited.levelIn).toBe(50)
    expect(edited.auto!.levelIn).toBe(59)
  })

  it('asks for the pallet when none is chosen, and warns when drawn too shallow', () => {
    expect(rackGeometry(at(rack({ pallet: undefined })), loads)!.warnings).toEqual(['Choose the pallet'])
    expect(rackGeometry(at(rack({ depthFt: 2 })), loads)!.warnings[0]).toMatch(/Shallower than the pallet/)
    expect(rackSlots(at(rack({ pallet: undefined })), loads)).toEqual([])
  })

  it('a typed total snaps the length to the fewest bays that hold it', () => {
    const len = rackLengthFor(at(rack()), loads, 40)!       // 40 ÷ (2 × 3) → 7 bays
    expect(len).toBeCloseTo((7 * 92) / 12, 9)
    expect(rackGeometry(at(rack({ lengthFt: len })), loads)!.positions).toBe(42)
    expect(rackGeometry(at(rack({ lengthFt: (7 * 92 - 1e-9) / 12 })), loads)!.bays).toBe(7)   // float dust
  })

  it('a box serves its long side nearest a path; flip and stretch keep the body', () => {
    const made = rackFromBox({ x: 0, y: 0 }, { x: 40, y: 4 }, f => Math.abs(f[0].y - 10), { levels: 3, perBay: 2, face: 'short', pallet: { loadId: 'L1' } })!
    expect(made.at).toEqual({ x: 20, y: 4 })                 // the bottom side, nearer y = 10
    const p: SimPoint = { id: 'R', ...made.at, type: 'rack', rack: made.rack }
    expect(rackGeometry(p, loads)!.corners.map(c => [c.x, c.y])).toEqual([[0, 4], [40, 4], [40, 0], [0, 0]])
    const flipped = flipRack(p)
    expect([flipped.x, flipped.y]).toEqual([20, 0])
    const longer = stretchRack(p, 'b', { x: 60, y: 9 }, 8)
    expect([longer.rack!.lengthFt, longer.x]).toEqual([60, 30])
  })

  it('cycles its positions for the run: every level and bay, offsets along the face', () => {
    const s = rackSlots(at(rack({ lengthFt: 48 / 12, perBay: 1 })), loads)   // one 48 in bay, one pallet, 3 levels
    expect(s.map(q => +q.heightFt.toFixed(3))).toEqual([0, +(59 / 12).toFixed(3), +(118 / 12).toFixed(3)])
    expect(s.every(q => Math.abs(q.alongFt - (-(48 / 2) + 4 + 22) / 12) < 1e-9)).toBe(true)
  })

  it('acceptance 18 — a top level above the vehicle reach refuses the flow, with the reason', () => {
    const layout = corridor(200)
    const L: SimLayout = { ...layout, points: layout.points.map(p => (p.id === 'B' ? { ...p, type: 'rack', rack: rack({ levels: 4 }) } : p)) }
    const G = buildGraph(withRackSlots(L, loads))
    const f = { id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 10, vehicleId: 'cb18' }
    const byId = new Map(LIBRARY.map(v => [v.id, v]))
    expect(cb18.calc.maxLiftHeightFt).toBeCloseTo(14.67, 2)
    expect(flowExclusion(G, f, byId, 100)).toMatch(/top level at 14\.8 ft is above .* reach \(14\.7 ft\)/)
    const ok = buildGraph(withRackSlots({ ...L, points: L.points.map(p => (p.id === 'B' ? { ...p, rack: rack({ levels: 3 }) } : p)) }, loads))
    expect(flowExclusion(ok, f, byId, 100)).toBeNull()
  })

  it('a move at a rack takes longer than at a floor stand: lift and travel along the aisle', () => {
    const layout = corridor(200)
    const flow = [{ id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 10, vehicleId: 'cb18' }]
    const per = (L: SimLayout) => { const S = createSim(withRackSlots(L, loads), flow, LIBRARY, settings())!; runFor(S, 3 * 3600); return results(S).types[0].vehicleSecPerMove! }
    const asRack: SimLayout = { ...layout, points: layout.points.map(p => (p.id === 'B' ? { ...p, type: 'rack', rack: rack() } : p)) }
    expect(per(asRack)).toBeGreaterThan(per(layout) + 2)
  })
})
