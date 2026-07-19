// Worked, step-by-step derivations of the fleet-sizing math — one pure model
// rendered two ways: the web "Fleet math" panel (DerivationPanel) and the PPTX
// deck. Each tier (Raw cycle→demand, Charging, Utilization) explains HOW its
// number is reached: the symbolic formula, the value-substituted form, and the
// result. Pure: composes calc outputs + vehicle specs into display strings. Imperial.
import { utilizationFromBuffer } from '@/src/calc/types'
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

/** Charging tier: cutsheet runtime & recharge hours → rotation + weekly-energy
 *  availability → ⌈demand ÷ availability⌉ → extra vehicles. Mirrors `chargingForGroup`. */
export function chargingDerivation(
  group: FleetGroup, vehicle: Vehicle,
  settings: Pick<FleetSettings, 'dailyOpHr' | 'breakHrs' | 'consecutiveOpDays'>,
): Derivation {
  const c = group.charging
  const H = Math.max(0, settings.dailyOpHr - settings.breakHrs)
  const cDays = settings.consecutiveOpDays
  const tag = `${c.method === 'opportunity' ? 'Opportunity' : 'Plugged'} · ${Number.isFinite(cDays) ? `${cDays} days on` : '24/7'}`

  const steps: DerivStep[] = [
    sec('Battery (cutsheet hours — no derates)'),
    { label: 'Runtime per charge', expr: 'hours of work per full charge', result: c.runHr == null ? '—' : `${n1(c.runHr)} h` },
    { label: 'Recharge time', expr: 'time to a full charge', sub: vehicle.calc.chargeTimeMin ? `${vehicle.calc.chargeTimeMin} min` : undefined, result: c.chargeHr == null ? '—' : `${n1(c.chargeHr)} h` },
    sec('Availability'),
    { label: 'Rotation (run : charge)', expr: 'runtime ÷ (runtime + recharge), or 100% if the battery covers the window', result: c.aCap == null ? '—' : `${Math.round(c.aCap * 100)}%` },
    { label: 'Weekly energy (off-shift + day-off reset)', expr: `charges 24 h/day vs works ${n1(H)} h/day; a day off is a free full battery`, result: c.aEnergy == null ? '—' : `${Math.round(c.aEnergy * 100)}%` },
    { label: 'Availability', expr: 'min of the two', result: c.availability == null ? '—' : `${Math.round(c.availability * 100)}%`, emphasis: true },
  ]

  if (c.chargingDelta === 0) {
    steps.push({ label: 'Extra vehicles', expr: 'charging fits the fleet', result: '+0', emphasis: true })
    return { title: 'Charging — battery hours → availability', tag, steps, note: 'Off-shift and days-off charging keep the battery up, so charging steals no operating time.' }
  }
  steps.push(
    { label: 'Fleet with charging', expr: 'demand ÷ availability, rounded up', sub: c.availability == null ? undefined : `⌈ ${n2(group.groupRaw)} ÷ ${n2(c.availability)} ⌉`, result: String(group.baseFleet + c.chargingDelta) },
    { label: 'Extra vehicles', expr: 'fleet with charging − base', sub: `${group.baseFleet + c.chargingDelta} − ${group.baseFleet}`, result: `+${c.chargingDelta}`, emphasis: true },
  )
  return { title: 'Charging — battery hours → availability → +N', tag, steps, note: 'Availability is the share of the day a vehicle can work; the rest is charging. Dividing demand by it covers the downtime.' }
}

// ── Tier 3: Utilization — headroom → fleet sold ──────────────────────────────

const BINDING_LABEL: Record<FleetGroup['binding'], string> = {
  energy: 'Weekly energy', rotation: 'Charging rotation', utilization: 'Target utilization',
}

/** Utilization tier: the fleet pays the LARGER of the rotation and energy
 *  constraints (v3 overlap-aware composition), rounded up ONCE = fleet. */
export function bufferDerivation(group: FleetGroup, bufferPct: number): Derivation {
  const mult = (1 + bufferPct).toFixed(2)
  const { aEnergy, aCap } = group.charging
  const demandRotation = (group.groupRaw * (1 + bufferPct)) / (aCap ?? 1)
  const demandEnergy = aEnergy != null ? group.groupRaw / aEnergy : null
  return {
    title: 'Utilization — headroom → fleet',
    tag: `Utilization ${Math.round(utilizationFromBuffer(bufferPct) * 100)}%`,
    steps: [
      sec('Constraints — the fleet pays the larger'),
      { label: 'Peak need with headroom', expr: aCap != null && aCap < 1 ? 'raw × (1 + buffer) ÷ rotation availability' : 'raw × (1 + buffer)', sub: `${n2(group.groupRaw)} × ${mult}${aCap != null && aCap < 1 ? ` ÷ ${n2(aCap)}` : ''}`, result: n2(demandRotation) },
      demandEnergy != null
        ? { label: 'Weekly energy sustain', expr: 'raw ÷ energy availability — no buffer here: idle robots charge', sub: `${n2(group.groupRaw)} ÷ ${n2(aEnergy!)}`, result: n2(demandEnergy) }
        : { label: 'Weekly energy sustain', expr: 'battery data unavailable', result: '—', muted: true },
      (() => {
        const larger = Math.max(demandRotation, demandEnergy ?? 0)
        const floored = group.baseFleet >= Math.ceil(larger)
        return { label: 'Fleet (sold)', expr: floored ? 'base fleet is the physical floor' : 'larger constraint, rounded up once', sub: floored ? `max(${group.baseFleet} base, ⌈ ${n2(larger)} ⌉)` : `⌈ ${n2(larger)} ⌉`, result: String(group.fleetSold), emphasis: true }
      })(),
      { label: 'Binding constraint', expr: 'which constraint set the fleet', result: BINDING_LABEL[group.binding] },
    ],
    note: 'Headroom covers demand spikes, maintenance, and queueing; energy is average-work-driven, so buffer vehicles never multiply it. Each chassis rounds up exactly once — at the end.',
  }
}
