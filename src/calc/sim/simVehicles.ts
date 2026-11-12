// src/calc/sim/simVehicles.ts — the simulation's vehicles (owner, 2026-11-12; replaces the vehicle
// switcher): the types it runs, each with its payload, and the vehicle each flow runs as. PURE.
// Simulation only: Sizing's flows are never changed (Sizing → Simulation → Price only).

import { qualifyVehicle } from '@/src/calc/trafficLight'
import type { ApplicationRequirements, TrafficLightStatus } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/** A type's payload: one of Step 1's loads, or custom dimensions (in). */
export type SimPayload = { loadId: string } | { lengthIn: number; widthIn: number; heightIn?: number }
export interface SimVehicleType { vehicleId: string; payload?: SimPayload }

interface FlowVehicle { id: string; vehicleId?: string; transferMethodIdx?: number; transferSecOverride?: number }
interface LoadDims { id: string; lengthIn?: number | null; widthIn?: number | null }

/** One card in the + Vehicle window: its Step 2 status, whether Sizing uses it, and (red) why not. */
export interface VehicleChoice { vehicle: Vehicle; status: TrafficLightStatus; sizing: boolean; why?: string }

const CHOICE_RANK: Record<TrafficLightStatus, number> = { GREEN: 0, YELLOW: 1, INCOMPLETE: 2, RED: 3 }

/** Every vehicle for the + Vehicle window: Sizing's first, then compatible, review, not checked, and
 *  red last (shown, not addable — `why` names the first requirement it fails). */
export function vehicleChoices(vehicles: Vehicle[], app: ApplicationRequirements, sizingIds: string[]): VehicleChoice[] {
  const sizing = new Set(sizingIds)
  return vehicles.map((vehicle): VehicleChoice => {
    const q = qualifyVehicle(vehicle, app)
    const fail = q.status === 'RED' ? q.hardGates.find(g => !g.skipped && !g.passed) : undefined
    return { vehicle, status: q.status, sizing: sizing.has(vehicle.id), ...(fail ? { why: `${fail.name}: needs ${fail.requiredValue}, has ${fail.vehicleValue}` } : {}) }
  }).sort((a, b) => Number(b.sizing) - Number(a.sizing) || CHOICE_RANK[a.status] - CHOICE_RANK[b.status] || a.vehicle.name.localeCompare(b.vehicle.name))
}

/**
 * The types the simulation runs: the stored list once changed; else Sizing's vehicles in the order its
 * flows use them (an earlier switch, `vehicleAs`, as a one-type list), each carrying Step 1's largest load.
 */
export function simVehicleTypes(stored: SimVehicleType[] | undefined, sizingFlows: { vehicleId?: string }[], loads: LoadDims[], vehicleAs?: string): SimVehicleType[] {
  if (stored) return stored
  const big = largestLoad(loads), payload = big ? { loadId: big.id } : undefined
  const ids = vehicleAs ? [vehicleAs] : [...new Set(sizingFlows.flatMap(f => (f.vehicleId ? [f.vehicleId] : [])))]
  return ids.map(vehicleId => ({ vehicleId, ...(payload ? { payload } : {}) }))
}

/** The load a new type carries: Step 1's widest (then longest) — the one that sizes the aisles. */
export function largestLoad<L extends LoadDims>(loads: L[]): L | undefined {
  return [...loads].sort((a, b) => (b.widthIn ?? 0) - (a.widthIn ?? 0) || (b.lengthIn ?? 0) - (a.lengthIn ?? 0))[0]
}

/** A payload's footprint, ft — null when it has no dimensions (or its Step 1 load is gone). */
export function payloadFtOf(p: SimPayload | undefined, loads: LoadDims[]): { length: number; width: number } | null {
  const d = !p ? null : 'loadId' in p ? loads.find(l => l.id === p.loadId) : p
  const length = (d?.lengthIn ?? 0) / 12, width = (d?.widthIn ?? 0) / 12
  return length > 0 || width > 0 ? { length, width } : null
}

/** Each type's payload footprint, ft, by vehicle id (types with none are left out). */
export function payloadsByVehicle(types: SimVehicleType[], loads: LoadDims[]): Record<string, { length: number; width: number }> {
  return Object.fromEntries(types.flatMap(t => { const p = payloadFtOf(t.payload, loads); return p ? [[t.vehicleId, p]] : [] }))
}

/**
 * The flows as the simulation runs them: each on its chosen vehicle (`flowVehicle`), else its Sizing
 * vehicle, when that is a type; a flow whose Sizing vehicle was removed from the types runs as the
 * first type. A flow with no vehicle in Sizing runs as the first type only while no flow has one
 * (simulate first); otherwise it stays out of the run, as in Sizing. A flow moved off its Sizing vehicle drops its
 * transfer choice (the method index and timing belong to that vehicle) and takes the new one's default.
 * `changed`: some flow does not run on its Sizing vehicle, so the run cannot speak for Sizing or the
 * price. The same array comes back when nothing changes.
 */
export function simFlows<F extends FlowVehicle>(flows: F[], types: SimVehicleType[], flowVehicle: Record<string, string> = {}): { flows: F[]; changed: boolean } {
  const ids = new Set(types.map(t => t.vehicleId)), first = types[0]?.vehicleId
  const none = !flows.some(f => f.vehicleId)
  const target = (f: F) => {
    const chosen = flowVehicle[f.id]
    if (chosen && ids.has(chosen)) return chosen
    if (!f.vehicleId) return none ? first : undefined
    return ids.has(f.vehicleId) ? f.vehicleId : first
  }
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
