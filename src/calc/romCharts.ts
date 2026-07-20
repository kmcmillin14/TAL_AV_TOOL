// src/calc/romCharts.ts — pure chart-series shape functions for the ROM dashboard.
// No React, no fetch, no localStorage, no fs. (Type-only Flow/FleetSummary/Vehicle imports.)
import { DEFAULT_DOD } from './types'
import type { ChargeMethod, CycleBreakdown, FleetSummary, Flow, FlowDerived } from './types'
import type { RomSummary } from './rom'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

// ─────────── §1 Flow diagram ───────────

export interface FlowDiagramEdge { destLabel: string; thruPerHr: number; vehicleName: string; vehicleId: string; qty: number }
export interface FlowDiagramOrigin { id: string; label: string; edges: FlowDiagramEdge[] }
export interface FlowDiagramSeries { origins: FlowDiagramOrigin[] }

/** Node-link series: group flows by origin; each edge carries throughput, destination,
 *  the assigned vehicle, and that vehicle's fleet quantity. */
export function flowDiagramSeries(
  flows: Flow[],
  vehiclesById: Map<string, Vehicle>,
  fleet: FleetSummary,
): FlowDiagramSeries {
  const qtyByVehicle = new Map(fleet.groups.map(g => [g.vehicleId, g.fleetSold]))
  const byOrigin = new Map<string, FlowDiagramOrigin>()
  for (const f of flows) {
    if (!f.vehicleId || !f.origin) continue
    const veh = vehiclesById.get(f.vehicleId)
    const o = byOrigin.get(f.origin) ?? { id: f.origin, label: f.origin, edges: [] }
    o.edges.push({
      destLabel: f.destination || '—',
      thruPerHr: f.thruPerHr || 0,
      vehicleName: veh?.name ?? f.vehicleId,
      vehicleId: f.vehicleId,
      qty: qtyByVehicle.get(f.vehicleId) ?? 0,
    })
    byOrigin.set(f.origin, o)
  }
  return { origins: [...byOrigin.values()] }
}

// ─────────── §2 Duty cycle ───────────

export type DutyKey = 'driveLoaded' | 'driveEmpty' | 'transfer' | 'lift' | 'charging' | 'idle'
export interface DutySegment { key: DutyKey; label: string; fraction: number }
export interface DutyCycleSeries { segments: DutySegment[] }

const DUTY_LABELS: Record<DutyKey, string> = {
  driveLoaded: 'Drive loaded', driveEmpty: 'Drive empty', transfer: 'Load / unload',
  lift: 'Lift', charging: 'Charging', idle: 'Idle',
}

/** Fleet-aggregate activity split. Operating-time fractions come from throughput-weighted
 *  cycle breakdowns; they are scaled by availability, and (1−availability) becomes charging. */
export function dutyCycleSeries(
  flows: Flow[],
  derivedByFlowId: Map<string, FlowDerived>,
  fleet: FleetSummary,
): DutyCycleSeries {
  let wLoaded = 0, wEmpty = 0, wTransfer = 0, wLift = 0, wTotal = 0
  for (const f of flows) {
    const b: CycleBreakdown | null | undefined = derivedByFlowId.get(f.id)?.breakdown
    const w = f.thruPerHr || 0
    if (!b || w <= 0 || b.totalSec <= 0) continue
    wLoaded += w * b.travelLoadedSec
    wEmpty += w * b.travelEmptySec
    wTransfer += w * (b.loadSec + b.unloadSec)
    wLift += w * b.liftTimeSec
    wTotal += w * b.totalSec
  }
  // Weight each type's availability by its fleet count — a 10-vehicle type at
  // 70% must outweigh a 1-vehicle type at 90% in the aggregate duty picture.
  let availWeighted = 0
  let availCount = 0
  for (const g of fleet.groups) {
    const a = g.charging.availability
    if (a == null) continue
    availWeighted += a * g.fleetSold
    availCount += g.fleetSold
  }
  const availability = availCount > 0 ? availWeighted / availCount : 1
  const chargingFrac = Math.max(0, 1 - availability)

  if (wTotal <= 0) {
    return { segments: (['driveLoaded', 'driveEmpty', 'transfer', 'lift', 'charging', 'idle'] as DutyKey[])
      .map(key => ({ key, label: DUTY_LABELS[key], fraction: key === 'idle' ? 1 : 0 })) }
  }
  const op = availability // operating share of wall time
  const seg = (sec: number): number => (sec / wTotal) * op
  const driveLoaded = seg(wLoaded), driveEmpty = seg(wEmpty), transfer = seg(wTransfer), lift = seg(wLift)
  const idle = Math.max(0, 1 - (driveLoaded + driveEmpty + transfer + lift + chargingFrac))
  const fracByKey: Record<DutyKey, number> = { driveLoaded, driveEmpty, transfer, lift, charging: chargingFrac, idle }
  return { segments: (Object.keys(fracByKey) as DutyKey[]).map(key => ({ key, label: DUTY_LABELS[key], fraction: fracByKey[key] })) }
}

// ─────────── §2 Utilization ───────────

export interface UtilizationRow { vehicleName: string; rawDemand: number; baseFleet: number; fleetSold: number }
export interface UtilizationSeries { rows: UtilizationRow[] }

/** Per-vehicle-type demand vs provisioned capacity. */
export function utilizationSeries(fleet: FleetSummary, vehiclesById: Map<string, Vehicle>): UtilizationSeries {
  return {
    rows: fleet.groups.map(g => ({
      vehicleName: vehiclesById.get(g.vehicleId)?.name ?? g.vehicleId,
      rawDemand: g.groupRaw, baseFleet: g.baseFleet, fleetSold: g.fleetSold,
    })),
  }
}

// ─────────── §2 Charging summary ───────────

export interface ChargingRow { vehicleName: string; runHr: number | null; chargeHr: number | null; method: ChargeMethod; availability: number | null }
export interface ChargingSeries { rows: ChargingRow[] }

/** Per-vehicle-type charging summary. */
export function chargingSeries(fleet: FleetSummary, vehiclesById: Map<string, Vehicle>): ChargingSeries {
  return {
    rows: fleet.groups.map(g => ({
      vehicleName: vehiclesById.get(g.vehicleId)?.name ?? g.vehicleId,
      runHr: g.charging.runHr, chargeHr: g.charging.chargeHr,
      method: g.charging.method, availability: g.charging.availability,
    })),
  }
}

// ─────────── §2 Battery state of charge ───────────

export interface SocPoint { hr: number; soc: number }
export interface BatterySocRow { vehicleName: string; dodFloor: number; points: SocPoint[] }
export interface BatterySocSeries { rows: BatterySocRow[] }

/** State-of-charge sawtooth over the operating day. SoC starts full, falls linearly over
 *  runHr to the DOD floor (1−DEFAULT_DOD), recharges linearly over chargeHr back to full,
 *  and repeats. Sampled every `stepHr` to `dayHr`. */
export function batterySocSeries(
  fleet: FleetSummary,
  vehiclesById: Map<string, Vehicle>,
  dayHr: number,
  stepHr: number,
): BatterySocSeries {
  const floor = 1 - DEFAULT_DOD
  const usable = DEFAULT_DOD
  const step = stepHr > 0 ? stepHr : 0.25
  const rows: BatterySocRow[] = []
  for (const g of fleet.groups) {
    const runHr = g.charging.runHr
    const chargeHr = g.charging.chargeHr
    const name = vehiclesById.get(g.vehicleId)?.name ?? g.vehicleId
    const points: SocPoint[] = []
    if (!runHr || runHr <= 0 || !chargeHr || chargeHr <= 0 || dayHr <= 0) {
      points.push({ hr: 0, soc: 1 }, { hr: Math.max(dayHr, 1), soc: 1 })
      rows.push({ vehicleName: name, dodFloor: floor, points })
      continue
    }
    const dischargeRate = usable / runHr   // SoC units per hour while operating
    const chargeRate = usable / chargeHr   // SoC units per hour while charging
    let soc = 1
    let charging = false
    const steps = Math.ceil(dayHr / step)
    for (let i = 0; i <= steps; i++) {
      const hr = Math.min(dayHr, i * step)
      points.push({ hr, soc: Math.max(floor, Math.min(1, soc)) })
      if (!charging) {
        soc -= dischargeRate * step
        if (soc <= floor) { soc = floor; charging = true }
      } else {
        soc += chargeRate * step
        if (soc >= 1) { soc = 1; charging = false }
      }
    }
    rows.push({ vehicleName: name, dodFloor: floor, points })
  }
  return { rows }
}

// ─────────── §3 CAPEX bars ───────────

export interface CapexBarRow { vehicleName: string; qty: number; lineMin: number; lineMax: number }
export interface CapexBarsSeries { rows: CapexBarRow[]; totalMin: number; totalMax: number }

export function capexBarsSeries(rom: RomSummary, vehiclesById: Map<string, Vehicle>): CapexBarsSeries {
  return {
    rows: rom.pricing.lines.map(l => ({
      vehicleName: vehiclesById.get(l.vehicleId)?.name ?? l.vehicleId,
      qty: l.fleetSold, lineMin: l.lineMin, lineMax: l.lineMax,
    })),
    totalMin: rom.pricing.totalMin, totalMax: rom.pricing.totalMax,
  }
}

// ─────────── §3 Payback ───────────

export interface PaybackPoint { year: number; cumulative: number }
export interface PaybackSeries { points: PaybackPoint[]; breakEvenYear: number | null }

/** Cumulative cash flow: −CAPEX at year 0, + annual labor offset each year
 *  through life (simple ROI model — OPEX not netted). */
export function paybackSeries(rom: RomSummary, serviceLifeYears: number): PaybackSeries {
  const capex = rom.pricing.totalMid
  const net = rom.payback.annualLaborOffset
  const points: PaybackPoint[] = []
  for (let y = 0; y <= serviceLifeYears; y++) points.push({ year: y, cumulative: -capex + net * y })
  return { points, breakEvenYear: net > 0 ? capex / net : null }
}

// ─────────── §3 TCO ───────────

export interface TcoPoint { year: number; capex: number; cumOpex: number; cumLaborOffset: number; net: number }
export interface TcoSeries { points: TcoPoint[] }

/** Cumulative cost stack vs cumulative labor offset across the life. */
export function tcoSeries(rom: RomSummary, serviceLifeYears: number): TcoSeries {
  const capex = rom.pricing.totalMid
  const opex = rom.opex.annualOpex
  const offset = rom.payback.annualLaborOffset
  const points: TcoPoint[] = []
  for (let y = 0; y <= serviceLifeYears; y++) {
    points.push({ year: y, capex, cumOpex: opex * y, cumLaborOffset: offset * y, net: capex + opex * y - offset * y })
  }
  return { points }
}
