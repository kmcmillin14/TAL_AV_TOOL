import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { ROUTE_LAYOUT_FACTORS } from './types'
import type {
  Flow,
  FlowDerived,
  CycleBreakdown,
  GroupSummary,
  ProjectFlowSummary,
  RouteLayout,
  ZoneSummary,
  ZoneVehicleDemand,
} from './types'

export function routeLayoutFactor(layout: RouteLayout): number {
  return ROUTE_LAYOUT_FACTORS[layout]
}

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
  routeLayout: RouteLayout,
  liftHeightFt: number,
  transferMethodIdx: number = 0,
): CycleBreakdown | null {
  if (distanceFt < 0) return null
  if (liftHeightFt < 0) return null
  if (!vehicle.transferMethods || vehicle.transferMethods.length === 0) return null
  const transfer = vehicle.transferMethods[transferMethodIdx]
  if (!transfer) return null

  const sLoaded = vehicle.calc.speedLoadedFps
  const sEmpty = vehicle.calc.speedUnloadedFps
  if (!sLoaded || sLoaded <= 0) return null
  if (!sEmpty || sEmpty <= 0) return null

  const factor = routeLayoutFactor(routeLayout)
  const effectiveLoaded = sLoaded * factor
  const effectiveEmpty = sEmpty * factor
  const travelLoadedSec = distanceFt / effectiveLoaded
  const travelEmptySec = distanceFt / effectiveEmpty
  const loadSec = transfer.loadTimeSec
  const unloadSec = transfer.unloadTimeSec
  const liftSpeed = vehicle.calc.liftSpeedFps
  const liftTimeSec = transfer.lifts && liftSpeed && liftSpeed > 0
    ? liftHeightFt / liftSpeed
    : 0
  const totalSec =
    travelLoadedSec + travelEmptySec +
    loadSec + unloadSec +
    liftTimeSec

  return {
    travelLoadedSec,
    travelEmptySec,
    loadSec,
    unloadSec,
    liftTimeSec,
    totalSec,
    methodName: transfer.method,
    liftHeightFt,
    routeLayout,
    routeLayoutFactor: factor,
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
  routeLayout: RouteLayout,
  liftHeightFt: number,
  transferMethodIdx: number = 0,
): number | null {
  return cycleBreakdown(distanceFt, vehicle, routeLayout, liftHeightFt, transferMethodIdx)?.totalSec ?? null
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
    flow.routeLayout ?? 'medium',
    flow.liftHeightFt ?? 0,
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
 * Ordered, de-duplicated effective group list: declared `flowGroups` first,
 * then any name used by a flow's `sectionName` but not declared (legacy
 * projects). Shared by the Step 3 table and the zone summary so they never
 * drift. Pure — no I/O.
 */
export function effectiveGroups(flowGroups: string[], flows: Flow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (n: string | undefined) => {
    if (n && !seen.has(n)) { seen.add(n); out.push(n) }
  }
  for (const g of flowGroups) push(g)
  for (const f of flows) push(f.sectionName)
  return out
}

/**
 * Per-zone demand breakdown for one visual group (`sectionName`). `null`
 * matches flows with no/empty section. Groups the zone's flows by vehicleId
 * and sums fractional `rawVehicles` per vehicle. vehicleId-less flows are
 * counted in `flowsCount` but excluded from the per-vehicle breakdown.
 */
export function zoneSummary(
  sectionName: string | null,
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
): ZoneSummary {
  const inZone = flows.filter(f =>
    sectionName === null ? !f.sectionName : f.sectionName === sectionName,
  )
  const order: string[] = []
  const byVehicle = new Map<string, ZoneVehicleDemand>()
  let zoneRaw = 0
  for (const f of inZone) {
    if (!f.vehicleId) continue
    const d = derivedByFlowId.get(f.id)
    const raw = d?.rawVehicles ?? 0
    let entry = byVehicle.get(f.vehicleId)
    if (!entry) {
      entry = { vehicleId: f.vehicleId, raw: 0, flowsCount: 0 }
      byVehicle.set(f.vehicleId, entry)
      order.push(f.vehicleId)
    }
    entry.raw += raw
    entry.flowsCount += 1
    zoneRaw += raw
  }
  return {
    sectionName,
    vehicles: order.map(id => byVehicle.get(id)!),
    zoneRaw,
    flowsCount: inZone.length,
  }
}

/**
 * All zones in effective order (declared groups, then legacy section names),
 * with the ungrouped bucket appended LAST (only when it holds flows).
 * Invariant: Σ zoneRaw === projectFlowSummary(...).totalRawFleet.
 */
export function zonesSummary(
  flowGroups: string[],
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
): ZoneSummary[] {
  const zones = effectiveGroups(flowGroups, flows).map(g =>
    zoneSummary(g, flows, derivedByFlowId),
  )
  const ungrouped = zoneSummary(null, flows, derivedByFlowId)
  if (ungrouped.flowsCount > 0) zones.push(ungrouped)
  return zones
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
