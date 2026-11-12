import { describe, expect, it } from 'vitest'
import { payloadFtOf, payloadsByVehicle, simFlows, simVehicleTypes, vehicleChoices } from '../simVehicles'
import { runInputs } from '../runInputs'
import { B56_5_RULE } from '../clearance'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { LIBRARY } from './fixtures'
import type { SimLayout } from '../types'

const app = appRequirementsFromProject({ id: 'p', name: 'p' } as never)
const loads = [{ id: 'L1', lengthIn: 48, widthIn: 40 }, { id: 'L2', lengthIn: 24, widthIn: 16 }]

describe('simulation vehicles (simulation only)', () => {
  it('lists every vehicle for + Vehicle: Sizing first, red last with the requirement it fails', () => {
    const sizingId = LIBRARY[LIBRARY.length - 1].id
    const c = vehicleChoices(LIBRARY, app, [sizingId])
    expect(c[0]).toMatchObject({ vehicle: { id: sizingId }, sizing: true })
    expect(c).toHaveLength(LIBRARY.length)
    const heavy = vehicleChoices(LIBRARY, { ...app, maxLoadWeightLbs: 1e9 }, [])
    expect(heavy.every(x => x.status === 'RED' && x.why)).toBe(true)
  })

  it('prefills from Sizing (first load each), honours a stored list and an earlier switch', () => {
    const flows = [{ vehicleId: 'b' }, { vehicleId: 'a' }, { vehicleId: 'b' }, {}]
    expect(simVehicleTypes(undefined, flows, loads)).toEqual([{ vehicleId: 'b', payload: { loadId: 'L1' } }, { vehicleId: 'a', payload: { loadId: 'L1' } }])
    expect(simVehicleTypes(undefined, flows, [])).toEqual([{ vehicleId: 'b' }, { vehicleId: 'a' }])
    expect(simVehicleTypes(undefined, flows, loads, 'm')).toEqual([{ vehicleId: 'm', payload: { loadId: 'L1' } }])
    expect(simVehicleTypes([], flows, loads)).toEqual([])                       // emptied on purpose
  })

  it('payloads: a Step 1 load or custom dims, in ft; none when missing', () => {
    expect(payloadFtOf({ loadId: 'L2' }, loads)).toEqual({ length: 2, width: 16 / 12 })
    expect(payloadFtOf({ lengthIn: 60, widthIn: 36 }, loads)).toEqual({ length: 5, width: 3 })
    expect(payloadFtOf({ loadId: 'gone' }, loads)).toBeNull()
    expect(payloadsByVehicle([{ vehicleId: 'a', payload: { loadId: 'L1' } }, { vehicleId: 'b' }], loads)).toEqual({ a: { length: 4, width: 40 / 12 } })
  })

  it('runs each flow on its chosen type, else its Sizing vehicle, else the first type', () => {
    const flows = [{ id: '1', vehicleId: 'a', transferMethodIdx: 2 }, { id: '2', vehicleId: 'gone' }, { id: '3' }, { id: '4', vehicleId: 'a' }]
    const types = [{ vehicleId: 'b' }, { vehicleId: 'a' }]
    const r = simFlows(flows, types, { 4: 'b', 1: 'nope' })
    expect(r.changed).toBe(true)
    expect(r.flows.map(f => f.vehicleId)).toEqual(['a', 'b', 'b', 'b'])
    expect(r.flows[0]).toBe(flows[0])                                            // unchanged flow kept
    expect(r.flows[3]).not.toHaveProperty('transferMethodIdx')
    const same = [{ id: '1', vehicleId: 'a' }]
    expect(simFlows(same, [{ vehicleId: 'a' }])).toEqual({ flows: same, changed: false })
    expect(simFlows([{ id: '1' }], []).changed).toBe(false)                     // nothing to run yet
  })

  it("each type's payload sets the lanes its own flows drive", () => {
    const L: SimLayout = {
      points: [{ id: 'A', x: 0, y: 0, type: 'stand', role: 'pick' }, { id: 'B', x: 50, y: 0, type: 'stand', role: 'drop' },
        { id: 'C', x: 0, y: 40, type: 'stand', role: 'pick' }, { id: 'D', x: 50, y: 40, type: 'stand', role: 'drop' }],
      segments: [{ id: 'AB', a: 'A', b: 'B', dir: 'ab', lane: 'single' }, { id: 'CD', a: 'C', b: 'D', dir: 'ab', lane: 'single' }],
    }
    const [v1, v2] = LIBRARY
    const flows = [{ id: 'f1', fromPointId: 'A', toPointId: 'B', thruPerHr: 5, vehicleId: v1.id }, { id: 'f2', fromPointId: 'C', toPointId: 'D', thruPerHr: 5, vehicleId: v2.id }]
    const r = runInputs(L, flows, new Map(LIBRARY.map(v => [v.id, v])), B56_5_RULE, { [v1.id]: { width: 20 } })
    expect(r.laneWidths.AB).toBeGreaterThan(20)
    expect(r.laneWidths.CD).toBeLessThan(20)
  })
})
