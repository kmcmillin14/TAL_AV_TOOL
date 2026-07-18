import { describe, it, expect } from 'vitest'
import { resilience, type ResilienceInput } from '../romSensitivity'
import type { FleetSummary } from '../types'

function fleet(rows: Array<{ vehicleId: string; groupRaw: number; fleetSold: number }>): FleetSummary {
  return {
    groups: rows.map(r => ({
      vehicleId: r.vehicleId, groupRaw: r.groupRaw, baseFleet: Math.ceil(r.groupRaw),
      charging: { method: 'plugged', runHr: 5, chargeHr: 5, availability: 1, aEnergy: null, aCap: null, chargingDelta: 0, sustainable: true, reason: '' },
      fleetWithCharging: r.fleetSold, fleetSold: r.fleetSold, binding: 'utilization' as const,
    })),
    totalBaseFleet: 0, totalChargingDelta: 0,
    totalFleetSold: rows.reduce((s, r) => s + r.fleetSold, 0), bufferPct: 0.1,
  }
}

describe('resilience', () => {
  it('throughput is held when removing one vehicle still covers raw demand', () => {
    const r = resilience({ fleet: fleet([{ vehicleId: 'cb18', groupRaw: 2.4, fleetSold: 4 }]) } as ResilienceInput)
    expect(r.throughputHeldWithOneDown).toBe(true)
    expect(r.retainedPct).toBeCloseTo(1, 5)
  })

  it('throughput drops when one down falls below raw demand', () => {
    const r = resilience({ fleet: fleet([{ vehicleId: 'cb18', groupRaw: 3.6, fleetSold: 4 }]) } as ResilienceInput)
    expect(r.throughputHeldWithOneDown).toBe(false)
    expect(r.retainedPct).toBeCloseTo(3 / 3.6, 5)
  })
})
