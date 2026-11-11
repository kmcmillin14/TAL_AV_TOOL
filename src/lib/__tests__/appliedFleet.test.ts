// Fleet Simulation D-1 — a simulated fleet applied to pricing (spec v2 §9, acceptance 38).
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sample from '@/src/content/samples/company-a-project.json'
import { simulatedDelta, simulatedNote } from '@/src/calc/fleet'
import { simInputsKey } from '@/src/calc/sim/runInputs'
import { bufferDerivation } from '../derivation'
import { computeFleetModel, projectFleetSettings } from '../fleetModel'
import type { StoredProject } from '../storage'
import type { Vehicle } from '../vehicleLibrary'

const dir = join(process.cwd(), 'src/content/vehicles')
const vehicles = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Vehicle)
const base = { ...sample.project, id: 'company-a' } as unknown as StoredProject
const withApplied = (applied: Record<string, number>): StoredProject => ({
  ...base, simSettings: { appliedFleet: Object.fromEntries(Object.entries(applied).map(([v, n]) => [v, { fleet: n, key: 'k' }])) },
})

describe('Use N in pricing (D-1, raise-only)', () => {
  const engine = computeFleetModel(base, vehicles)
  const g0 = engine.fleet.groups[0]

  it('raises the priced fleet for that type and labels it, everything else unchanged', () => {
    const m = computeFleetModel(withApplied({ [g0.vehicleId]: g0.fleetSold + 2 }), vehicles)
    const g = m.fleet.groups.find(x => x.vehicleId === g0.vehicleId)!
    expect(g.fleetSold).toBe(g0.fleetSold + 2)
    expect(g.engineFleetSold).toBe(g0.fleetSold)
    expect(simulatedDelta(g)).toBe(2)
    expect(simulatedNote(g)).toBe(`simulated (engine ${g0.fleetSold})`)
    expect(m.fleet.totalFleetSold).toBe(engine.fleet.totalFleetSold + 2)
    expect(m.fleet.totalEngineFleetSold).toBe(engine.fleet.totalFleetSold)
    expect(simulatedNote(m.fleet)).toBe(`simulated (engine ${engine.fleet.totalFleetSold})`)
    expect(g.binding).toBe('simulation')
    // The engine's own stages are untouched — the raise is its own term.
    expect(g.utilizationDelta).toBe(g0.utilizationDelta)
    for (const o of m.fleet.groups.filter(x => x.vehicleId !== g0.vehicleId)) {
      expect(o).toEqual(engine.fleet.groups.find(x => x.vehicleId === o.vehicleId))
    }
    expect(m.rom.pricing.totalMid).toBeGreaterThan(engine.rom.pricing.totalMid)
  })

  it('never lowers a type below the engine', () => {
    const m = computeFleetModel(withApplied({ [g0.vehicleId]: 1 }), vehicles)
    expect(m.fleet).toEqual(engine.fleet)
    expect(simulatedNote(m.fleet)).toBeNull()
  })

  it('Back to engine restores every figure exactly', () => {
    const back = computeFleetModel({ ...withApplied({ [g0.vehicleId]: g0.fleetSold + 2 }), simSettings: { appliedFleet: {} } }, vehicles)
    expect(back.fleet).toEqual(engine.fleet)
    expect(back.rom).toEqual(engine.rom)
  })

  it('the calculation trail adds a "+ simulated" stage that sums to the sold figure', () => {
    const m = computeFleetModel(withApplied({ [g0.vehicleId]: g0.fleetSold + 2 }), vehicles)
    const g = m.fleet.groups.find(x => x.vehicleId === g0.vehicleId)!
    const d = bufferDerivation(g, m.settings.targetUtilization)
    expect(d.steps.find(s => s.label === '+ simulated')?.result).toBe('+2')
    expect(g.baseFleet + g.chargingDelta + g.utilizationDelta + simulatedDelta(g)).toBe(g.fleetSold)
  })

  it('projectFleetSettings carries only the applied figures', () => {
    expect(projectFleetSettings(base).appliedFleet).toBeUndefined()
    expect(projectFleetSettings(withApplied({ cb18: 5 })).appliedFleet).toEqual({ cb18: 5 })
  })
})

describe('simInputsKey (stale marker)', () => {
  const linked = { id: 'f', fromPointId: 'A', toPointId: 'B', thruPerHr: 20, vehicleId: 'cb18' }
  const p = { ...base, flows: [linked, { id: 'typed', thruPerHr: 5 }], simLayout: { points: [], segments: [] }, simSettings: { pacePct: 70 } }
  const byId = new Map(vehicles.map(v => [v.id, v]))
  it('ignores the stepper, the stored result, the applied fleet and flows the run does not use', () => {
    const k = simInputsKey(p, byId)
    expect(simInputsKey({ ...p, simSettings: { ...p.simSettings, fleet: { cb18: 9 }, lastRun: { key: 'x', types: {} }, appliedFleet: {} } } as typeof p, byId)).toBe(k)
    expect(simInputsKey({ ...p, flows: [linked, { id: 'typed', thruPerHr: 50 }] }, byId)).toBe(k)
  })
  it('changes with linked flows, layout, loads, run assumptions and the vehicle data used', () => {
    const k = simInputsKey(p, byId)
    expect(simInputsKey({ ...p, flows: [{ ...linked, thruPerHr: 21 }] }, byId)).not.toBe(k)
    expect(simInputsKey({ ...p, simLayout: { points: [{ id: 'a' }], segments: [] } } as typeof p, byId)).not.toBe(k)
    expect(simInputsKey({ ...p, loads: [] }, byId)).not.toBe(k)
    expect(simInputsKey({ ...p, simSettings: { pacePct: 60 } }, byId)).not.toBe(k)
    const faster = new Map(byId); const cb = byId.get('cb18')!
    faster.set('cb18', { ...cb, calc: { ...cb.calc, widthFt: cb.calc.widthFt + 1 } })
    expect(simInputsKey(p, faster)).not.toBe(k)
  })
})
