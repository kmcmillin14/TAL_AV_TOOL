// src/calc/sim/switcher.ts — the vehicle switcher (owner, 2026-11-12): which vehicles the simulation
// can run as, the one it starts on, and the flows as it runs them. PURE. Simulation only: Sizing's
// flows are never changed (Sizing → Simulation → Price only).

import { qualifyVehicle } from '@/src/calc/trafficLight'
import type { ApplicationRequirements } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface FlowVehicle { vehicleId?: string }

const RANK = { GREEN: 1, YELLOW: 2, INCOMPLETE: 3 } as const

export interface Offered { vehicle: Vehicle; status: 'SIZING' | keyof typeof RANK }

/** The vehicles offered: the Sizing flows' vehicles first, then Step 2 green, amber, and not yet
 *  checked (incomplete — e.g. before Step 1 is filled in, so the simulation can come first), by name.
 *  Red vehicles are never offered. */
export function switcherVehicles(vehicles: Vehicle[], app: ApplicationRequirements, sizingIds: string[]): Offered[] {
  const sizing = new Set(sizingIds)
  const rated = vehicles.flatMap((v): (Offered & { rank: number })[] => {
    if (sizing.has(v.id)) return [{ vehicle: v, status: 'SIZING', rank: 0 }]
    const s = qualifyVehicle(v, app).status
    return s === 'RED' ? [] : [{ vehicle: v, status: s, rank: RANK[s] }]
  })
  return rated.sort((a, b) => a.rank - b.rank || a.vehicle.name.localeCompare(b.vehicle.name)).map(({ vehicle, status }) => ({ vehicle, status }))
}

/** The vehicle the switcher starts on: the Sizing flows' most used vehicle, else the first offered. */
export function preloadedVehicle(flows: FlowVehicle[], offered: Offered[]): string | undefined {
  const count = new Map<string, number>()
  for (const f of flows) if (f.vehicleId) count.set(f.vehicleId, (count.get(f.vehicleId) ?? 0) + 1)
  let best: string | undefined, most = 0
  for (const [id, n] of count) if (n > most) { best = id; most = n }
  return best ?? offered[0]?.vehicle.id
}

/** The flows as the simulation runs them: every flow as `asId` when switched; otherwise a flow with
 *  no vehicle runs as `fallbackId` (so the simulation can come before Sizing is finished). The same
 *  array comes back when nothing changes. */
export function simulateAs<F extends FlowVehicle>(flows: F[], asId: string | undefined, fallbackId: string | undefined): F[] {
  const target = (f: F) => asId ?? f.vehicleId ?? fallbackId
  return flows.some(f => target(f) !== f.vehicleId) ? flows.map(f => ({ ...f, vehicleId: target(f) })) : flows
}
