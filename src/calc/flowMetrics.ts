import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { TURN_TIME_SEC } from './types'
import type { Flow, FlowDerived, GroupSummary, ProjectFlowSummary } from './types'

/**
 * Round-trip cycle time for one move on a flow, in seconds.
 *
 *   cycle = (distance / speedLoaded)         // travel out, loaded
 *         + (distance / speedUnloaded)       // travel back, empty
 *         + load + unload                    // transfer method's static times
 *         + (lifts ? liftHeightFt / liftSpeedFps : 0)
 *         + turns × TURN_TIME_SEC
 *
 * `liftHeightFt` is the per-cycle total vertical travel of the load (engineer
 * enters the sum across all lift events in one cycle). Only added when the
 * chosen transfer method has `lifts: true` AND the vehicle declares a
 * positive `liftSpeedFps`. Otherwise lift time is 0 (does not error).
 *
 * Returns `null` when inputs make the calculation undefined. Callers display
 * "—" rather than render a number.
 */
export function cycleSeconds(
  distanceFt: number,
  vehicle: Pick<Vehicle, 'calc' | 'transferMethods'>,
  turns: number,
  liftHeightFt: number,
  transferMethodIdx: number = 0,
): number | null {
  if (distanceFt < 0) return null
  if (turns < 0) return null
  if (liftHeightFt < 0) return null
  if (!vehicle.transferMethods || vehicle.transferMethods.length === 0) return null
  const transfer = vehicle.transferMethods[transferMethodIdx]
  if (!transfer) return null

  const sLoaded = vehicle.calc.speedLoadedFps
  const sEmpty = vehicle.calc.speedUnloadedFps
  if (!sLoaded || sLoaded <= 0) return null
  if (!sEmpty || sEmpty <= 0) return null

  const travelLoaded = distanceFt / sLoaded
  const travelEmpty = distanceFt / sEmpty

  const liftSpeed = vehicle.calc.liftSpeedFps
  const liftTime = transfer.lifts && liftSpeed && liftSpeed > 0
    ? liftHeightFt / liftSpeed
    : 0

  return travelLoaded + travelEmpty
       + transfer.loadTimeSec + transfer.unloadTimeSec
       + liftTime
       + turns * TURN_TIME_SEC
}

/**
 * Fractional raw vehicle demand for a flow. No factors applied.
 *
 * Returns `null` when cycle is null. Returns 0 when demand is 0 or negative.
 */
export function rawVehicles(
  thruPerHr: number,
  cycleSec: number | null,
): number | null {
  if (cycleSec == null) return null
  if (thruPerHr <= 0) return 0
  return (thruPerHr * cycleSec) / 3600
}

/**
 * Compose `cycleSeconds` and `rawVehicles` for one flow. Pure wrapper.
 */
export function flowDerived(
  flow: Flow,
  vehicle: Vehicle | undefined,
): FlowDerived {
  if (!vehicle) return { cycleSeconds: null, rawVehicles: null }
  const cycle = cycleSeconds(
    flow.distanceFt,
    vehicle,
    flow.turns,
    flow.liftHeightFt,
    flow.transferMethodIdx ?? 0,
  )
  return {
    cycleSeconds: cycle,
    rawVehicles: rawVehicles(flow.thruPerHr, cycle),
  }
}

/**
 * Aggregate per-vehicle group summary. `derivedByFlowId` is precomputed by
 * the caller so React doesn't recompute cycles inside this function.
 *
 *   groupRaw     = Σ rawVehicles  over flows of this vehicleId
 *   baseFleet    = ceil(groupRaw)
 *   headroom     = (baseFleet − groupRaw) / baseFleet  (null when baseFleet === 0)
 *   avgCycleSec  = Σ(thru × cycle) / Σ thru             (null when no demand)
 */
export function groupSummary(
  vehicleId: string,
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
): GroupSummary {
  const inGroup = flows.filter(f => f.vehicleId === vehicleId)

  let baseThru = 0
  let demandSecPerHr = 0
  let groupRaw = 0

  for (const f of inGroup) {
    const d = derivedByFlowId.get(f.id)
    if (!d) continue
    baseThru += f.thruPerHr
    if (d.cycleSeconds != null) demandSecPerHr += f.thruPerHr * d.cycleSeconds
    if (d.rawVehicles != null) groupRaw += d.rawVehicles
  }

  const baseFleet = Math.ceil(groupRaw)
  const avgCycleSec = baseThru > 0 ? demandSecPerHr / baseThru : null
  const headroom = baseFleet > 0 ? (baseFleet - groupRaw) / baseFleet : null

  return {
    vehicleId,
    flowsCount: inGroup.length,
    baseThru,
    avgCycleSec,
    groupRaw,
    baseFleet,
    headroom,
  }
}

/**
 * Project-wide totals across all groups. Sums baseFleet (each ceiled per
 * group) so the displayed total reflects the actual integer fleet.
 */
export function projectFlowSummary(
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
): ProjectFlowSummary {
  const ids: string[] = []
  for (const f of flows) {
    if (f.vehicleId && !ids.includes(f.vehicleId)) ids.push(f.vehicleId)
  }
  let totalRawFleet = 0
  let totalBaseFleet = 0
  for (const vid of ids) {
    const g = groupSummary(vid, flows, derivedByFlowId)
    totalRawFleet += g.groupRaw
    totalBaseFleet += g.baseFleet
  }
  return {
    totalFlows: flows.length,
    totalThru: flows.reduce((s, f) => s + f.thruPerHr, 0),
    totalRawFleet,
    totalBaseFleet,
  }
}
