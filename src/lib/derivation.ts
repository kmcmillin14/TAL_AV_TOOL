// Worked, step-by-step derivations of the fleet-sizing math — one pure model
// rendered two ways: the web "Fleet math" panel (DerivationPanel) and the PPTX
// deck. Each tier (Raw cycle→demand, Charging, Buffer) explains HOW its number
// is reached: the symbolic formula, the value-substituted form, and the result.
// Pure: composes calc outputs + vehicle specs into display strings. Imperial.
import { DEFAULT_DOD } from '@/src/calc/types'
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

/** Charging tier: usable capacity → runtime & recharge → availability →
 *  ⌈demand ÷ availability⌉ → extra vehicles. Mirrors `chargingForGroup`. */
export function chargingDerivation(
  group: FleetGroup, vehicle: Vehicle, settings: Pick<FleetSettings, 'regime' | 'dailyOpHr'>,
): Derivation {
  const c = group.charging
  const cal = vehicle.calc
  const usableAh = cal.ratedAh * DEFAULT_DOD
  const tag = `${c.method === 'opportunity' ? 'Opportunity' : 'Plugged'} · ${settings.regime === 'overnight' ? 'Overnight' : 'Continuous'}`

  const steps: DerivStep[] = [
    sec('Battery'),
    { label: 'Usable capacity', expr: 'rated Ah × usable depth', sub: `${n1(cal.ratedAh)} × ${DEFAULT_DOD}`, result: `${n1(usableAh)} Ah` },
    { label: 'Runtime per charge', expr: 'usable Ah ÷ draw', sub: `${n1(usableAh)} ÷ ${n1(cal.dischargeA)}`, result: c.runHr == null ? '—' : `${n1(c.runHr)} h` },
    { label: 'Recharge time', expr: cal.chargeTimeMin ? 'rated charge time' : 'usable Ah ÷ charge rate', sub: cal.chargeTimeMin ? undefined : `${n1(usableAh)} ÷ ${n1(cal.chargeA)}`, result: c.chargeHr == null ? '—' : `${n1(c.chargeHr)} h` },
  ]

  // Overnight where one charge covers the day → no overlap, no extra vehicles.
  if (c.chargingDelta === 0 && c.availability === 1) {
    steps.push(
      sec('Availability'),
      { label: 'Recharges off-shift', expr: `runtime ≥ ${settings.dailyOpHr} h/day`, result: '100%', emphasis: true },
      { label: 'Extra vehicles', expr: 'charging fits the day', result: '+0', emphasis: true },
    )
    return { title: 'Charging — battery → availability', tag, steps, note: 'A single charge lasts the operating day, so charging happens overnight and steals no operating time.' }
  }

  steps.push(
    sec('Availability & extra vehicles'),
    c.method === 'plugged'
      ? { label: 'Availability', expr: 'runtime ÷ (runtime + recharge)', sub: c.runHr != null && c.chargeHr != null ? `${n1(c.runHr)} ÷ (${n1(c.runHr)} + ${n1(c.chargeHr)})` : undefined, result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%` }
      : { label: 'Availability', expr: 'charge ÷ (charge + draw)', sub: `${n1(cal.chargeA)} ÷ (${n1(cal.chargeA)} + ${n1(cal.dischargeA)})`, result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%` },
    { label: 'Fleet with charging', expr: 'demand ÷ availability, rounded up', sub: c.availability == null ? undefined : `⌈ ${n2(group.groupRaw)} ÷ ${n2(c.availability)} ⌉`, result: String(group.baseFleet + c.chargingDelta) },
    { label: 'Extra vehicles', expr: 'fleet with charging − base', sub: `${group.baseFleet + c.chargingDelta} − ${group.baseFleet}`, result: c.chargingDelta > 0 ? `+${c.chargingDelta}` : '+0', emphasis: true },
  )
  return { title: 'Charging — battery → availability → +N', tag, steps, note: 'Availability is the share of wall-clock time a vehicle can work while the rest is spent charging. Dividing demand by it covers the charging downtime.' }
}

// ── Tier 3: Buffer — spare capacity → fleet sold ─────────────────────────────

/** Buffer tier: (base + charging) × (1 + buffer), rounded up = fleet. */
export function bufferDerivation(group: FleetGroup, bufferPct: number): Derivation {
  const mult = (1 + bufferPct).toFixed(2)
  return {
    title: 'Buffer — spare capacity → fleet',
    tag: `Buffer ${Math.round(bufferPct * 100)}%`,
    steps: [
      sec('Waterfall'),
      { label: 'Base + charging', expr: 'raw base + charging extra', sub: `${group.baseFleet} + ${group.charging.chargingDelta}`, result: String(group.fleetWithCharging) },
      { label: 'Buffer multiplier', expr: '1 + buffer %', sub: `1 + ${(bufferPct).toFixed(2)}`, result: `×${mult}` },
      { label: 'Fleet (sold)', expr: '(base + charging) × buffer, rounded up', sub: `⌈ ${group.fleetWithCharging} × ${mult} ⌉`, result: String(group.fleetSold), emphasis: true },
    ],
    note: 'Buffer is the only multiplier in the pipeline — it covers maintenance, training, and demand spikes. Rounding up guarantees whole vehicles.',
  }
}
