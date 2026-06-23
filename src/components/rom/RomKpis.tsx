'use client'

import type { FleetSummary, Flow, FleetSettings } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { RomSummary, RomCostInputs } from '@/src/calc/rom'
import { resilience } from '@/src/calc/romSensitivity'
import { chargingSeries } from '@/src/calc/romCharts'
import { kpiDetails, type KpiId } from '@/src/lib/kpiDetails'
import type { ScenarioDiff } from '@/src/lib/scenario'
import KpiTile from './KpiTile'
import RomGauge from './RomGauge'

export const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`

export const usdRange = (min: number, max: number) =>
  min === max ? usd(min) : `${usd(min)} – ${usd(max)}`

interface Props {
  fleet: FleetSummary
  rom: RomSummary
  flows: Flow[]
  settings: FleetSettings
  costs: RomCostInputs
  serviceLifeYears: number
  vehicleById: Map<string, Vehicle>
  names: Record<string, string>
  /** Scenario-vs-baseline deltas; when present, tiles show a delta chip. */
  deltas?: ScenarioDiff | null
}

type Delta = { text: string; tone: 'good' | 'bad' | 'neutral' }

/** Signed delta chip with semantic tone. `good` says which direction is desirable
 *  ('up' = higher is better, 'down' = lower is better, undefined = neutral); the
 *  arrow shows the actual direction, the color shows whether it helped. */
function chip(d: number | null | undefined, fmt: (n: number) => string, good?: 'up' | 'down'): Delta | undefined {
  if (d == null || Math.abs(d) < 1e-9) return undefined
  const up = d > 0
  const text = `${up ? '▲' : '▼'} ${up ? '+' : '−'}${fmt(Math.abs(d))}`
  const tone: Delta['tone'] = good == null ? 'neutral' : (good === 'up') === up ? 'good' : 'bad'
  return { text, tone }
}

/** Top KPI band — interactive tiles (hover/pin reveals each metric's breakdown).
 *  Fleet sold + ROM CAPEX are the accent headline; the rest are secondary. */
export default function RomKpis({ fleet, rom, flows, settings, costs, serviceLifeYears, vehicleById, names, deltas }: Props) {
  const payback = rom.payback.paybackYears
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const detail = kpiDetails({ fleet, rom, flows, settings, costs }, names, { serviceLifeYears })

  const offset = rom.payback.annualLaborOffset
  const opex = rom.opex.annualOpex
  const totalRaw = fleet.groups.reduce((s, g) => s + g.groupRaw, 0)
  const totalSold = fleet.groups.reduce((s, g) => s + g.fleetSold, 0)
  const avgUtil = totalSold > 0 ? totalRaw / totalSold : null
  const tcoAtLife = rom.pricing.totalMid + opex * serviceLifeYears
  const annualMoves = throughput * settings.dailyOpHr * costs.operatingDaysPerYear
  const lifetimeMoves = annualMoves * serviceLifeYears
  const costPerMove = lifetimeMoves > 0 ? tcoAtLife / lifetimeMoves : null
  const res = resilience({ fleet })
  const pctChip = (n: number) => `${Math.round(n * 100)}%`
  const opDays = Math.max(1, costs.operatingDaysPerYear)
  const energyPerDay = rom.opex.annualEnergyKwh / opDays
  const energyPerWeek = rom.opex.annualEnergyKwh / 52

  // Fleet-wide gauge aggregates (weighted by units sold).
  const charge = chargingSeries(fleet, vehicleById)
  let wAvail = 0, wCharge = 0
  charge.rows.forEach((r, i) => {
    const sold = fleet.groups[i]?.fleetSold ?? 0
    const avail = r.availability ?? 0
    const runHr = r.runHr ?? 0
    const chargeHr = r.chargeHr ?? 0
    wAvail += avail * sold
    const frac = runHr + chargeHr > 0 ? chargeHr / (runHr + chargeHr) : 0
    wCharge += frac * sold
  })
  const avgAvailability = totalSold > 0 ? wAvail / totalSold : 0
  const avgCharging = totalSold > 0 ? wCharge / totalSold : 0

  // Tiles rendered inside the two hero boxes (Fleet & flow · Financials). Utilization,
  // availability, charging and redundancy are shown as gauges below, not tiles here.
  const tiles: Array<{ id: KpiId; label: string; value: string; accent?: boolean; delta?: Delta }> = [
    // ── Fleet & flow ──
    { id: 'fleet', label: 'Total fleet', value: String(fleet.totalFleetSold), accent: true,
      delta: chip(deltas?.totalFleetSold, n => String(Math.round(n)), 'down') },
    { id: 'types', label: 'Vehicle types', value: String(fleet.groups.length),
      delta: chip(deltas?.vehicleTypes, n => String(Math.round(n))) },
    { id: 'flows', label: 'Flows', value: String(flows.length) },
    { id: 'throughput', label: 'Throughput', value: `${throughput} / hr` },
    { id: 'energy', label: 'Energy kWh /d · /wk', value: `${Math.round(energyPerDay)} · ${Math.round(energyPerWeek)}`,
      delta: chip(deltas?.annualEnergyKwh == null ? undefined : deltas.annualEnergyKwh / opDays, n => `${Math.round(n)}/d`, 'down') },
    // ── Financials ──
    { id: 'capex', label: 'ROM CAPEX', value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), accent: true,
      delta: chip(deltas?.capexMid, usd, 'down') },
    { id: 'payback', label: 'Payback', value: payback == null ? '—' : `${payback.toFixed(1)} yr`,
      delta: chip(deltas?.paybackYears, n => `${n.toFixed(1)} yr`, 'down') },
    { id: 'net', label: 'Net benefit / yr', value: usd(offset - opex), accent: true,
      delta: chip(deltas?.netAnnualBenefit, usd, 'up') },
    { id: 'offset', label: 'Labor offset / yr', value: usd(offset),
      delta: chip(deltas?.annualLaborOffset, usd, 'up') },
    { id: 'opex', label: 'Annual OPEX', value: usd(opex),
      delta: chip(deltas?.annualOpex, usd, 'down') },
    { id: 'tco', label: `TCO @ ${serviceLifeYears}yr`, value: usd(tcoAtLife) },
    { id: 'costPerMove', label: 'Cost / move', value: costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}` },
  ]

  const byId = new Map(tiles.map((t, i) => [t.id, { ...t, colorIndex: i }]))
  const tile = (id: KpiId) => {
    const t = byId.get(id)
    if (!t) return null
    return <KpiTile key={id} label={t.label} value={t.value} detail={detail[id]} accent={t.accent} colorIndex={t.colorIndex} delta={t.delta} />
  }

  // Two hero boxes (Financials · Fleet & flow): each leads with its headline figure,
  // supporting metrics below — like items combined into one cohesive box. Then a
  // gauges strip makes utilization / availability / charging legible at a glance.
  return (
    <>
      <div className="rom2-summary">
        <section className="rom2-hero">
          <div className="rom2-hero-head">Financials</div>
          <div className="rom2-hero-lead">{tile('capex')}</div>
          <div className="rom2-hero-grid">
            {tile('net')}{tile('payback')}{tile('offset')}
            {tile('opex')}{tile('tco')}{tile('costPerMove')}
          </div>
        </section>

        <section className="rom2-hero">
          <div className="rom2-hero-head">Fleet &amp; flow</div>
          <div className="rom2-hero-lead">{tile('fleet')}</div>
          <div className="rom2-hero-grid">
            {tile('types')}{tile('flows')}{tile('throughput')}{tile('energy')}
          </div>
        </section>
      </div>

      <div className="rom2-gauges">
        <RomGauge value={avgUtil ?? 0} label="Utilization" display={avgUtil == null ? '—' : pctChip(avgUtil)}
          def="Raw demand ÷ provisioned fleet — how hard the fleet works. Lower means more spare headroom." />
        <RomGauge value={avgAvailability} label="Availability" status
          def="Share of the operating day a vehicle is available to work (not tied up recharging) — fleet uptime." />
        <RomGauge value={avgCharging} label="Charging" status
          def="Share of each duty cycle a vehicle spends recharging instead of moving loads." />
        <RomGauge value={res.throughputHeldWithOneDown ? 1 : res.retainedPct} label="Redundancy" status
          display={res.throughputHeldWithOneDown ? '✓' : pctChip(res.retainedPct)}
          def="Backup capacity if one vehicle goes down: ✓ means full throughput is still met; a % is the share of demand the remaining fleet can cover." />
      </div>
    </>
  )
}
