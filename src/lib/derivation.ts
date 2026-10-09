// Worked, step-by-step derivations of the fleet-sizing math — one pure model
// rendered two ways: the web "Fleet math" panel (DerivationPanel) and the PPTX
// deck. Each tier (Raw cycle→demand, Charging, Utilization) explains HOW its
// number is reached: the symbolic formula, the value-substituted form, and the
// result. Pure: composes calc outputs + vehicle specs into display strings. Imperial.
import type { CycleBreakdown, FleetGroup, FleetSettings } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/** One line of a worked derivation. A `section` carries only a heading; an
 *  `input` names a raw variable + its value (no operation); a step carries the
 *  formula (`expr`), its substituted form (`sub`), and the result. */
export interface DerivStep {
  kind?: 'section' | 'input'
  label: string
  expr?: string          // symbolic — what it MEANS, e.g. "distance ÷ (speed × pace)"
  sub?: string           // value-substituted, e.g. "300 ÷ (4.5 × 0.5)"
  result?: string
  unit?: string
  emphasis?: boolean     // the tier's headline output (cycle, fleet, …)
  muted?: boolean
}

export interface Derivation {
  title: string
  tag?: string           // small mono badge (e.g. "Medium ×0.5", "Overnight")
  steps: DerivStep[]
  note?: string
}

const n1 = (v: number) => v.toFixed(1)
const n2 = (v: number) => v.toFixed(2)
const ROUTE_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const sec = (label: string): DerivStep => ({ kind: 'section', label })
/** A named input variable + its value (and where it comes from). */
const inp = (label: string, result: string, expr: string): DerivStep => ({ kind: 'input', label, expr, result })

// ── Tier 1: Raw — cycle time → vehicle demand ────────────────────────────────

export interface CycleDerivInputs {
  distanceFt: number
  thruPerHr: number
  speedLoadedFps: number
  speedUnloadedFps: number
  liftSpeedFps: number | null
  rawVehicles: number | null
}

/** Raw tier: travel + transfer + lift = cycle, then throughput × cycle ÷ 3600
 *  = vehicle demand. Mirrors `cycleBreakdown` / `rawVehicles` in flowMetrics. */
export function cycleDerivation(b: CycleBreakdown, p: CycleDerivInputs): Derivation {
  const f = b.routeLayoutFactor
  const d = n1(p.distanceFt)
  const route = ROUTE_LABEL[b.routeLayout] ?? 'Medium'
  const lifts = b.liftTimeSec > 0 && p.liftSpeedFps != null && p.liftSpeedFps > 0
  return {
    title: 'Raw fleet — cycle time → demand',
    tag: `${route} ×${f}`,
    steps: [
      // Every variable that feeds the cycle, with its value and where it comes from.
      sec('Inputs'),
      inp('Distance (one-way leg)', `${d} ft`, 'route length'),
      inp('Loaded speed', `${n1(p.speedLoadedFps)} ft/s`, 'vehicle rated'),
      inp('Empty speed', `${n1(p.speedUnloadedFps)} ft/s`, 'vehicle rated'),
      inp('Route pace', `×${f}`, `${route} traffic — fraction of rated`),
      inp(`Load (${b.methodName})`, `${n1(b.loadSec)} s`, 'transfer method'),
      inp(`Unload (${b.methodName})`, `${n1(b.unloadSec)} s`, 'transfer method'),
      ...(lifts ? [
        inp('Lift height', `${n1(b.liftHeightFt)} ft`, 'flow input'),
        inp('Lift speed', `${n1(p.liftSpeedFps!)} ft/s`, 'vehicle rated'),
      ] : []),
      inp('Throughput', `${p.thruPerHr} /hr`, 'demand'),
      sec('Time per cycle  (distance = one-way leg; times in seconds)'),
      { label: 'Travel out (loaded)', expr: 'distance ÷ (speed × pace)', sub: `${d} ÷ (${n1(p.speedLoadedFps)} × ${f})`, result: `${n1(b.travelLoadedSec)}s` },
      { label: 'Travel back (empty)', expr: 'distance ÷ (speed × pace)', sub: `${d} ÷ (${n1(p.speedUnloadedFps)} × ${f})`, result: `${n1(b.travelEmptySec)}s` },
      { label: `${b.methodName} · load`, expr: 'from transfer method', result: `${n1(b.loadSec)}s` },
      { label: `${b.methodName} · unload`, expr: 'from transfer method', result: `${n1(b.unloadSec)}s` },
      lifts
        ? { label: 'Lift', expr: 'lift height ÷ lift speed', sub: `${n1(b.liftHeightFt)} ÷ ${n1(p.liftSpeedFps!)}`, result: `${n1(b.liftTimeSec)}s` }
        : { label: 'Lift', expr: 'no vertical lift', result: '0.0s', muted: true },
      { label: 'Cycle time', expr: 'sum of the steps above', sub: `${n1(b.travelLoadedSec)} + ${n1(b.travelEmptySec)} + ${n1(b.loadSec)} + ${n1(b.unloadSec)} + ${n1(b.liftTimeSec)}`, result: `${n1(b.totalSec)}s`, emphasis: true },
      sec('Vehicle demand'),
      { label: 'Vehicle count', expr: 'throughput × cycle ÷ 3600', sub: `${p.thruPerHr} × ${n1(b.totalSec)} ÷ 3600`, result: p.rawVehicles == null ? '—' : n2(p.rawVehicles), unit: p.rawVehicles == null ? undefined : 'veh', emphasis: true },
    ],
    note: 'Why ÷3600: throughput is per hour, cycle is in seconds — dividing converts to vehicle-hours of demand. Base fleet = ⌈Σ vehicle count⌉, pooled across all this vehicle’s flows.',
  }
}

// ── Tier 2: Charging — battery runtime → availability → extra vehicles ────────

/** Charging tier: physical battery spec → availability → extra vehicles.
 *  Mirrors `chargingAvailability` / `chargingForGroup`. */
export function chargingDerivation(
  group: FleetGroup, vehicle: Vehicle,
  settings: Pick<FleetSettings, 'dailyOpHr'>,
): Derivation {
  const c = group.charging
  const H = Math.max(0, settings.dailyOpHr)
  const cal = vehicle.calc
  const tag = `${c.method === 'opportunity' ? 'Opportunity' : 'Plugged'} · ${n1(H)} h staffed`

  const steps: DerivStep[] = [
    sec('Battery (physical spec — no derates)'),
    { label: 'Usable energy', expr: 'V × Ah ÷ 1000 × usable%', sub: `${cal.voltageV} × ${cal.ratedAh} ÷ 1000 × ${cal.usableCapacityPct ?? '—'}%`, result: c.usableKwh == null ? '—' : `${n2(c.usableKwh)} kWh` },
    { label: 'Average draw', expr: c.provisional ? 'back-derived from estimated runtime — PROVISIONAL' : 'power while working', result: cal.avgPowerDrawKw == null ? '—' : `${n2(cal.avgPowerDrawKw)} kW`, muted: c.provisional },
    { label: 'Charge input', expr: c.provisional ? 'back-derived from estimated charge time — PROVISIONAL' : 'charger output', result: cal.chargerPowerKw == null ? '—' : `${n2(cal.chargerPowerKw)} kW`, muted: c.provisional },
    { label: 'Runtime per charge', expr: 'usable ÷ draw', result: c.runHr == null ? '—' : `${n1(c.runHr)} h` },
    { label: 'Recharge time', expr: 'usable ÷ charge input', result: c.chargeHr == null ? '—' : `${n1(c.chargeHr)} h` },
    sec('Availability'),
    { label: 'Duty ratio', expr: 'charge ÷ (charge + draw) — capacity cancels; this is the 24/7 floor', result: c.dutyRatio == null ? '—' : `${Math.round(c.dutyRatio * 100)}%` },
    { label: 'Off-shift charge', expr: `${n1(Math.max(0, 24 - H))} h idle ÷ recharge time, capped at one full battery`, result: c.offShiftCharge == null ? '—' : `${Math.round(c.offShiftCharge * 100)}% of a charge` },
    { label: 'Availability', expr: 'free hours on that charge, then the duty ratio, averaged over the staffed window', result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%`, emphasis: true },
  ]

  const note = (c.provisional
    ? 'PROVISIONAL — average draw and charge input were blank on the battery sheet, so they are back-derived from this platform\'s estimated runtime and charge time. The fleet still sizes, but treat these figures as placeholders. '
    : '')
    + 'Availability assumes charging is STAGGERED across the fleet. If vehicles charged in lockstep the honest figure would be the duty ratio above. One charger per vehicle is assumed.'
  if (group.chargingDelta === 0) {
    steps.push({ label: 'Extra vehicles', expr: 'charging fits the fleet', result: '+0', emphasis: true })
    return { title: 'Charging — battery spec → availability', tag, steps, note }
  }
  steps.push(
    { label: 'Fleet with charging', expr: 'demand ÷ availability, rounded up', sub: c.availability == null ? undefined : `⌈ ${n2(group.groupRaw)} ÷ ${n2(c.availability)} ⌉`, result: String(group.fleetWithCharging) },
    { label: 'Extra vehicles', expr: 'fleet with charging − base', sub: `${group.fleetWithCharging} − ${group.baseFleet}`, result: `+${group.chargingDelta}`, emphasis: true },
  )
  return { title: 'Charging — battery spec → availability → +N', tag, steps, note }
}

// ── Tier 3: Utilization — headroom → fleet sold ──────────────────────────────

const BINDING_LABEL: Record<FleetGroup['binding'], string> = {
  charging: 'Charging', utilization: 'Target utilization',
}

/** Utilization tier: the fleet build-up, whose stages are TRUE ADDENDS.
 *  Charging is costed first so it stays a platform property that does not move
 *  when the utilization dial moves; headroom carries the interaction term. */
export function bufferDerivation(group: FleetGroup, targetUtilization: number): Derivation {
  const A = group.charging.availability
  return {
    title: 'Fleet build-up — these add',
    tag: `Utilization ${Math.round(targetUtilization * 100)}%`,
    steps: [
      sec('Every stage below sums exactly to the fleet'),
      { label: 'Peak demand', expr: 'Σ (moves/hr × cycle) ÷ 3600, rounded up', sub: n2(group.groupRaw), result: String(group.baseFleet) },
      { label: '+ charging', expr: 'vehicles covering charging downtime', sub: A == null ? 'no battery data — charging costs nothing' : `⌈ ${n2(group.groupRaw)} ÷ ${n2(A)} ⌉ − ${group.baseFleet}`, result: `+${group.chargingDelta}` },
      { label: '+ headroom', expr: `target ${Math.round(targetUtilization * 100)}% of AVAILABLE time — spikes, maintenance, queueing`, sub: `⌈ ${n2(group.demand)} ⌉ − ${group.fleetWithCharging}`, result: `+${group.utilizationDelta}` },
      { label: 'Fleet (sold)', expr: 'the three above', sub: `${group.baseFleet} + ${group.chargingDelta} + ${group.utilizationDelta}`, result: String(group.fleetSold), emphasis: true },
      { label: 'Binding constraint', expr: 'what set the fleet', result: BINDING_LABEL[group.binding] },
    ],
    note: 'Headroom sits on AVAILABLE time, not clock time — a vehicle on a charger cannot answer a demand spike, so charging downtime is not usable slack. Each chassis rounds up exactly once, at the end.',
  }
}
