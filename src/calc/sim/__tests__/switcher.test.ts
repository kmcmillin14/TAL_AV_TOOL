import { describe, expect, it } from 'vitest'
import { preloadedVehicle, simulateAs, switcherVehicles } from '../switcher'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { LIBRARY } from './fixtures'

const app = appRequirementsFromProject({ id: 'p', name: 'p' } as never)

describe('vehicle switcher (simulation only)', () => {
  it('offers the Sizing vehicles first, then Step 2 green, then amber — never red', () => {
    const sizingId = LIBRARY[LIBRARY.length - 1].id
    const offered = switcherVehicles(LIBRARY, app, [sizingId])
    expect(offered[0]).toMatchObject({ vehicle: { id: sizingId }, status: 'SIZING' })
    expect(new Set(offered.map(o => o.vehicle.id)).size).toBe(offered.length)
    const rank = { SIZING: 0, GREEN: 1, YELLOW: 2, INCOMPLETE: 3 }
    expect(offered.map(o => rank[o.status])).toEqual([...offered.map(o => rank[o.status])].sort())
    expect(switcherVehicles(LIBRARY, { ...app, maxLoadWeightLbs: 1e9 }, [])).toEqual([])
  })

  it('starts on the most used Sizing vehicle, else the first offered', () => {
    expect(preloadedVehicle([{ vehicleId: 'a' }, { vehicleId: 'b' }, { vehicleId: 'b' }], [])).toBe('b')
    expect(preloadedVehicle([{}], [{ vehicle: { id: 'x' }, status: 'GREEN' } as never])).toBe('x')
    expect(preloadedVehicle([], [])).toBeUndefined()
  })

  it('runs every flow as the switched vehicle; a flow with no vehicle as the preloaded one', () => {
    const flows = [{ id: '1', vehicleId: 'a' }, { id: '2' }]
    expect(simulateAs(flows, 'm', 'a').map(f => f.vehicleId)).toEqual(['m', 'm'])
    expect(simulateAs(flows, undefined, 'a').map(f => f.vehicleId)).toEqual(['a', 'a'])
    const same = [{ id: '1', vehicleId: 'a' }]
    expect(simulateAs(same, undefined, 'a')).toBe(same)
    expect(simulateAs(same, 'a', 'a')).toBe(same)
    expect(flows[1]).toEqual({ id: '2' })          // Sizing's flows are not changed
  })
})
