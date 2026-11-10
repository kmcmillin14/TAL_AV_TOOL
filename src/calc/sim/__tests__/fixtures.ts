// Test fixtures for the simulation engine.
// `sampleLayout` is the TAL proof-of-concept sample (docs/superpowers/reference/fleet-simulation-poc/sample.js),
// converted to point ids: 3 line EOLs → wrapper → warehouse conveyor, 4 chargers, 2 parking.

import cb18Json from '@/src/content/vehicles/cb18.json'
import hbc40aJson from '@/src/content/vehicles/8hbc40a.json'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { SimFlow, SimLayout, SimPoint, SimSegment, SimSettings } from '../types'

export const cb18 = cb18Json as unknown as Vehicle
export const hbc40a = hbc40aJson as unknown as Vehicle
export const LIBRARY = [cb18, hbc40a]

export function settings(over: Partial<SimSettings> = {}): SimSettings {
  return {
    fleet: { cb18: 1 }, demandPct: 100, seed: 1, arrivals: 'regular', pacePct: 70, safetyFt: 3,
    staffedHr: 16, targetUtilization: 0.9, ...over,
  }
}

export function sampleLayout(): { layout: SimLayout; flows: SimFlow[] } {
  const points: SimPoint[] = [], segments: SimSegment[] = []
  const byXY = new Map<string, string>()
  const pt = (x: number, y: number) => {
    const k = `${x},${y}`
    let id = byXY.get(k)
    if (!id) { id = 'p' + (points.length + 1); points.push({ id, x, y, type: 'junction' }); byXY.set(k, id) }
    return id
  }
  const seg = (a: [number, number], b: [number, number]) =>
    segments.push({ id: 's' + (segments.length + 1), a: pt(...a), b: pt(...b), dir: 'two', lane: 'two' })
  const xsA = [20, 60, 110, 160, 210, 240, 300], xsB = [20, 60, 72, 84, 96, 120, 132, 160, 240, 280, 300]
  for (let i = 1; i < xsA.length; i++) seg([xsA[i - 1], 60], [xsA[i], 60])
  for (let i = 1; i < xsB.length; i++) seg([xsB[i - 1], 140], [xsB[i], 140])
  for (const x of [20, 160, 300]) seg([x, 60], [x, 140])
  seg([60, 60], [60, 30]); seg([110, 60], [110, 30]); seg([210, 60], [210, 30])
  seg([240, 60], [240, 85]); seg([240, 140], [240, 115])
  seg([280, 140], [280, 165])
  for (const x of [60, 72, 84, 96]) seg([x, 140], [x, 160])
  for (const x of [120, 132]) seg([x, 140], [x, 160])
  const set = (x: number, y: number, p: Partial<SimPoint>) => Object.assign(points.find(q => q.id === byXY.get(`${x},${y}`))!, p)
  set(60, 30, { name: 'Line 1 EOL', type: 'machine', role: 'pick' })
  set(110, 30, { name: 'Line 2 EOL', type: 'machine', role: 'pick' })
  set(210, 30, { name: 'Line 3 EOL', type: 'machine', role: 'pick' })
  set(240, 85, { name: 'Wrapper Infeed', type: 'conveyor', role: 'drop' })
  // POC flow f4 lifts 3 ft, split half at pick and half at drop
  set(240, 115, { name: 'Wrapper Outfeed', type: 'conveyor', role: 'pick', heightFt: 1.5 })
  set(280, 165, { name: 'Warehouse Infeed', type: 'conveyor', role: 'drop', heightFt: 1.5 })
  ;[60, 72, 84, 96].forEach((x, i) => set(x, 160, { name: `Charger ${i + 1}`, type: 'charger' }))
  ;[120, 132].forEach((x, i) => set(x, 160, { name: `Park ${i + 1}`, type: 'parking' }))
  const id = (x: number, y: number) => byXY.get(`${x},${y}`)!
  const flows: SimFlow[] = [
    { id: 'f1', fromPointId: id(60, 30), toPointId: id(240, 85), thruPerHr: 24, vehicleId: 'cb18' },
    { id: 'f2', fromPointId: id(110, 30), toPointId: id(240, 85), thruPerHr: 24, vehicleId: 'cb18' },
    { id: 'f3', fromPointId: id(210, 30), toPointId: id(240, 85), thruPerHr: 18, vehicleId: 'cb18' },
    { id: 'f4', fromPointId: id(240, 115), toPointId: id(280, 165), thruPerHr: 66, vehicleId: 'cb18' },
  ]
  return { layout: { points, segments }, flows }
}

/** A straight two-point corridor: Pick at x=0, Drop at x=len, one charger off the start. */
export function corridor(len: number, opts: { dir?: 'two' | 'ab'; lane?: 'single' | 'two'; pickH?: number; dropH?: number } = {}) {
  const layout: SimLayout = {
    points: [
      { id: 'A', x: 0, y: 0, type: 'stand', role: 'pick', name: 'A', heightFt: opts.pickH ?? 0 },
      { id: 'B', x: len, y: 0, type: 'stand', role: 'drop', name: 'B', heightFt: opts.dropH ?? 0 },
      { id: 'J', x: -20, y: 0, type: 'junction' },
      { id: 'C1', x: -20, y: 20, type: 'charger', name: 'Charger 1' },
      { id: 'C2', x: -20, y: -20, type: 'charger', name: 'Charger 2' },
    ],
    segments: [
      { id: 'AB', a: 'A', b: 'B', dir: opts.dir ?? 'two', lane: opts.lane ?? 'two' },
      { id: 'JA', a: 'J', b: 'A', dir: 'two' },
      { id: 'JC1', a: 'J', b: 'C1', dir: 'two' },
      { id: 'JC2', a: 'J', b: 'C2', dir: 'two' },
    ],
  }
  return layout
}
