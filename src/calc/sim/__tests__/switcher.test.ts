import { describe, expect, it } from 'vitest'
import { OFFER_RANK, preloadedVehicle, simulateAs, switcherVehicles } from '../switcher'
import { appRequirementsFromProject } from '@/src/lib/appRequirements'
import { LIBRARY } from './fixtures'

const app = appRequirementsFromProject({ id: 'p', name: 'p' } as never)

describe('vehicle switcher (simulation only)', () => {
  it('offers the Sizing vehicles first, then Step 2 green, then amber — never red', () => {
    const sizingId = LIBRARY[LIBRARY.length - 1].id
    const offered = switcherVehicles(LIBRARY, app, [sizingId])
    expect(offered[0]).toMatchObject({ vehicle: { id: sizingId }, status: 'SIZING' })
    expect(new Set(offered.map(o => o.vehicle.id)).size).toBe(offered.length)
    expect(offered.map(o => OFFER_RANK[o.status])).toEqual([...offered.map(o => OFFER_RANK[o.status])].sort())
    expect(switcherVehicles(LIBRARY, { ...app, maxLoadWeightLbs: 1e9 }, [])).toEqual([])
  })

  it('starts on the most used Sizing vehicle, else the first offered', () => {
    const offer = (...ids: string[]) => ids.map(id => ({ vehicle: { id }, status: 'GREEN' }) as never)
    expect(preloadedVehicle([{ vehicleId: 'a' }, { vehicleId: 'b' }, { vehicleId: 'b' }], offer('a', 'b'))).toBe('b')
    expect(preloadedVehicle([{ vehicleId: 'gone' }], offer('a'))).toBe('a')   // not offered (e.g. removed)
    expect(preloadedVehicle([{}], [{ vehicle: { id: 'x' }, status: 'GREEN' } as never])).toBe('x')
    expect(preloadedVehicle([], [])).toBeUndefined()
  })

  it('runs every flow as the switched vehicle; with no vehicle anywhere, as the preloaded one', () => {
    const flows = [{ id: '1', vehicleId: 'a', transferMethodIdx: 2, transferSecOverride: 9 }, { id: '2' }]
    const as = simulateAs(flows, 'm', 'a')
    expect(as).toMatchObject({ changed: true, flows: [{ vehicleId: 'm' }, { vehicleId: 'm' }] })
    expect(as.flows[0]).not.toHaveProperty('transferMethodIdx')   // Sizing's vehicle's transfer choice
    expect(as.flows[0]).not.toHaveProperty('transferSecOverride')
    // one blank flow among Sizing's: it stays out, as in Sizing — the run still speaks for Sizing
    expect(simulateAs(flows, undefined, 'a')).toEqual({ flows, changed: false })
    const blank: { id: string; vehicleId?: string }[] = [{ id: '2' }]
    expect(simulateAs(blank, undefined, 'a')).toMatchObject({ changed: true, flows: [{ vehicleId: 'a' }] })
    const same = [{ id: '1', vehicleId: 'a' }]
    expect(simulateAs(same, undefined, 'a')).toEqual({ flows: same, changed: false })
    expect(simulateAs(same, 'a', 'a').flows).toBe(same)
    expect(flows[1]).toEqual({ id: '2' })          // Sizing's flows are not changed
  })
})
