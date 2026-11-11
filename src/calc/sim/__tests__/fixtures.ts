// Test fixtures for the simulation engine.
// `sampleLayout` is the TAL proof-of-concept sample (docs/superpowers/reference/fleet-simulation-poc/sample.js),
// kept in src/content/samples/simulate-sample.json: 3 line EOLs → wrapper → warehouse conveyor, 4 chargers, 2 parking.

import cb18Json from '@/src/content/vehicles/cb18.json'
import hbc40aJson from '@/src/content/vehicles/8hbc40a.json'
import sample from '@/src/content/samples/simulate-sample.json'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { SimFlow, SimLayout, SimSettings } from '../types'

export const cb18 = cb18Json as unknown as Vehicle
export const hbc40a = hbc40aJson as unknown as Vehicle
export const LIBRARY = [cb18, hbc40a]

export function settings(over: Partial<SimSettings> = {}): SimSettings {
  return {
    fleet: { cb18: 1 }, demandPct: 100, seed: 1, arrivals: 'regular', pacePct: 70, safetyFt: 3,
    staffedHr: 16, targetUtilization: 0.9, ...over,
  }
}

/** The proof-of-concept sample, from the same file Simulate's "Load sample" uses (one source). */
export function sampleLayout(): { layout: SimLayout; flows: SimFlow[] } {
  const layout = structuredClone(sample.layout) as SimLayout
  const flows = sample.flows.map(f => ({ id: f.id.replace('sample-', ''), fromPointId: f.fromPointId, toPointId: f.toPointId, thruPerHr: f.thruPerHr, vehicleId: f.vehicleId }))
  return { layout, flows }
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
