import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { TURN_TIME_SEC } from './types'
import type {
  Flow,
  FlowDerived,
  CycleBreakdown,
  GroupSummary,
  ProjectFlowSummary,
} from './types'

/**
 * Per-component breakdown of a flow's round-trip cycle time. Pure.
 *
 *   travelLoaded + travelEmpty + load + unload + lift + turns = total
 *
 * `liftTimeSec` is 0 unless the chosen transfer method has `lifts: true`
 * AND the vehicle declares a positive `liftSpeedFps`. Returns `null` for
 * the same input conditions that make `cycleSeconds` undefined.
 */
export function cycleBreakdown(
  distanceFt: number,
  vehicle: Pick<Vehicle, 'calc' | 'transferMethods'>,
  turns: number,
  liftHeightFt: number,
  customDelaySec: number,
  transferMethodIdx: number = 0,
): CycleBreakdown | null {
  if (distanceFt < 0) return null
  if (turns < 0) return null
  if (liftHeightFt < 0) return null
  if (customDelaySec < 0) return null
  if (!vehicle.transferMethods || vehicle.transferMethods.length === 0) return null
  const transfer = vehicle.transferMethods[transferMethodIdx]
  if (!transfer) return null

  const sLoaded = vehicle.calc.speedLoadedFps
  const sEmpty = vehicle.calc.speedUnloadedFps
  if (!sLoaded || sLoaded <= 0) return null
  if (!sEmpty || sEmpty <= 0) return null

  const travelLoadedSec = distanceFt / sLoaded
  const travelEmptySec = distanceFt / sEmpty
  const loadSec = transfer.loadTimeSec
  const unloadSec = transfer.unloadTimeSec
  const liftSpeed = vehicle.calc.liftSpeedFps
  const liftTimeSec = transfer.lifts && liftSpeed && liftSpeed > 0
    ? liftHeightFt / liftSpeed
    : 0
  const turnPenaltySec = turns * TURN_TIME_SEC
  const totalSec =
    travelLoadedSec + travelEmptySec +
    loadSec + unloadSec +
    liftTimeSec + turnPenaltySec +
    customDelaySec

  return {
    travelLoadedSec,
    travelEmptySec,
    loadSec,
    unloadSec,
    liftTimeSec,
    turnPenaltySec,
    customDelaySec,
    totalSec,
    methodName: transfer.method,
    liftHeightFt,
  }
}

/**
 * Round-trip cycle time in seconds. Thin delegate over `cycleBreakdown`.
 *
 *   cycle = (distance / speedLoaded) + (distance / speedUnloaded)
 *         + load + unload
 *         + (lifts ? liftHeightFt / liftSpeedFps : 0)
 *         + turns × TURN_TIME_SEC
 *
 * Returns `null` when inputs make the calculation undefined. Callers display
 * "—" rather than render a number.
 */
export function cycleSeconds(
  distanceFt: number,
  vehicle: Pick<Vehicle, 'calc' | 'transferMethods'>,
  turns: number,
  liftHeightFt: number,
  customDelaySec: number = 0,
  transferMethodIdx: number = 0,
): number | null {
  return cycleBreakdown(distanceFt, vehicle, turns, liftHeightFt, customDelaySec, transferMethodIdx)?.totalSec ?? null
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
 * Compose `cycleBreakdown` and `rawVehicles` for one flow. Pure wrapper.
 * The breakdown is precomputed once per flow so the UI can render the
 * per-component popover without recomputing.
 */
export function flowDerived(
  flow: Flow,
  vehicle: Vehicle | undefined,
): FlowDerived {
  if (!vehicle) return { cycleSeconds: null, rawVehicles: null, breakdown: null }
  // Defensive `?? 0` on each numeric flow field: stored projects from prior
  // schema versions may have missing keys at runtime even though TS sees them
  // as required. Zod's .default(0) covers parses, but localStorage reads on
  // pre-existing data don't currently re-parse.
  const breakdown = cycleBreakdown(
    flow.distanceFt ?? 0,
    vehicle,
    flow.turns ?? 0,
    flow.liftHeightFt ?? 0,
    flow.customDelaySec ?? 0,
    flow.transferMethodIdx ?? 0,
  )
  const cycle = breakdown?.totalSec ?? null
  return {
    cycleSeconds: cycle,
    rawVehicles: rawVehicles(flow.thruPerHr, cycle),
    breakdown,
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
