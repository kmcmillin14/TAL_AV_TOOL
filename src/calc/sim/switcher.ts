// src/calc/sim/switcher.ts — the vehicle switcher (owner, 2026-11-12): which vehicles the simulation
// can run as, the one it starts on, and the flows as it runs them. PURE. Simulation only: Sizing's
// flows are never changed (Sizing → Simulation → Price only).

import { qualifyVehicle } from '@/src/calc/trafficLight'
import type { ApplicationRequirements } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface FlowVehicle { vehicleId?: string; transferMethodIdx?: number; transferSecOverride?: number }

/** The order the switcher lists vehicles in: Sizing's, then Step 2 green, amber, not yet checked. */
export const OFFER_RANK = { SIZING: 0, GREEN: 1, YELLOW: 2, INCOMPLETE: 3 } as const

export interface Offered { vehicle: Vehicle; status: keyof typeof OFFER_RANK }

/** The vehicles offered: the Sizing flows' vehicles first, then Step 2 green, amber, and not yet
 *  checked (incomplete — e.g. before Step 1 is filled in, so the simulation can come first), by name.
 *  Red vehicles are never offered. */
export function switcherVehicles(vehicles: Vehicle[], app: ApplicationRequirements, sizingIds: string[]): Offered[] {
  const sizing = new Set(sizingIds)
  const offered = vehicles.flatMap((v): Offered[] => {
    if (sizing.has(v.id)) return [{ vehicle: v, status: 'SIZING' }]
    const status = qualifyVehicle(v, app).status
    return status === 'RED' ? [] : [{ vehicle: v, status }]
  })
  return offered.sort((a, b) => OFFER_RANK[a.status] - OFFER_RANK[b.status] || a.vehicle.name.localeCompare(b.vehicle.name))
}

/** The vehicle the switcher starts on: the Sizing flows' most used vehicle (one the switcher offers),
 *  else the first offered. */
export function preloadedVehicle(flows: FlowVehicle[], offered: Offered[]): string | undefined {
  const listed = new Set(offered.map(o => o.vehicle.id)), count = new Map<string, number>()
  for (const f of flows) if (f.vehicleId && listed.has(f.vehicleId)) count.set(f.vehicleId, (count.get(f.vehicleId) ?? 0) + 1)
  let best: string | undefined, most = 0
  for (const [id, n] of count) if (n > most) { best = id; most = n }
  return best ?? offered[0]?.vehicle.id
}

/** The flows as the simulation runs them: every flow as `asId` when switched. With no vehicle on any
 *  flow yet (simulate first), every flow runs as `fallbackId`; otherwise a flow with no vehicle stays
 *  out of the run, as in Sizing. A flow moved to another vehicle drops its transfer choice (the method
 *  index and timing belong to its Sizing vehicle) and takes the new vehicle's default.
 *  `changed`: the run does not drive Sizing's flows as they are, so it cannot speak for Sizing or the
 *  price. The same array comes back when nothing changes. */
export function simulateAs<F extends FlowVehicle>(flows: F[], asId: string | undefined, fallbackId: string | undefined): { flows: F[]; changed: boolean } {
  const none = !flows.some(f => f.vehicleId)
  const target = (f: F) => asId ?? (none ? fallbackId : f.vehicleId)
  const changed = flows.some(f => target(f) !== f.vehicleId)
  if (!changed) return { flows, changed }
  return {
    changed,
    flows: flows.map(f => {
      if (target(f) === f.vehicleId) return f
      const { transferMethodIdx: _m, transferSecOverride: _s, ...rest } = f
      return { ...rest, vehicleId: target(f) } as F
    }),
  }
}
