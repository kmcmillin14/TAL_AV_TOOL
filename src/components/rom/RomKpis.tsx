'use client'

import type { FleetSummary, Flow, FleetSettings } from '@/src/calc/types'
import type { RomSummary, RomCostInputs } from '@/src/calc/rom'
import { resilience } from '@/src/calc/romSensitivity'
import { kpiDetails, type KpiId } from '@/src/lib/kpiDetails'
import type { ScenarioDiff } from '@/src/lib/scenario'
import KpiTile from './KpiTile'

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
  names: Record<string, string>
  /** Scenario-vs-baseline deltas; when present, tiles show a delta chip. */
  deltas?: ScenarioDiff | null
}

/** Signed chip text, e.g. "▲ +2" / "▼ −0.3 yr". Omitted when the change is ~0. */
function chip(d: number | null | undefined, fmt: (n: number) => string): string | undefined {
  if (d == null || Math.abs(d) < 1e-9) return undefined
  const arrow = d > 0 ? '▲' : '▼'
  return `${arrow} ${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`
}

/** Top KPI band — interactive tiles (hover/pin reveals each metric's breakdown).
 *  Fleet sold + ROM CAPEX are the accent headline; the rest are secondary. */
export default function RomKpis({ fleet, rom, flows, settings, costs, serviceLifeYears, names, deltas }: Props) {
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

  // Grouped so related metrics read together: a "fleet & operations" row, then a
  // "the money" row (matches the 7-col KPI grid — 7 + 7).
  const tiles: Array<{ id: KpiId; label: string; value: string; accent?: boolean; delta?: string }> = [
    // ── Fleet & operations ──
    { id: 'fleet', label: 'Total fleet', value: String(fleet.totalFleetSold), accent: true,
      delta: chip(deltas?.totalFleetSold, n => String(Math.round(n))) },
    { id: 'types', label: 'Vehicle types', value: String(fleet.groups.length),
      delta: chip(deltas?.vehicleTypes, n => String(Math.round(n))) },
    { id: 'flows', label: 'Flows', value: String(flows.length) },
    { id: 'throughput', label: 'Throughput', value: `${throughput} / hr` },
    { id: 'utilization', label: 'Avg utilization', value: avgUtil == null ? '—' : pctChip(avgUtil),
      delta: chip(deltas?.avgUtilization, pctChip) },
    { id: 'resilience', label: 'Resilience', value: res.throughputHeldWithOneDown ? '✓ holds' : `${Math.round(res.retainedPct * 100)}%` },
    { id: 'energy', label: 'Energy kWh /d · /wk', value: `${Math.round(energyPerDay)} · ${Math.round(energyPerWeek)}`,
      delta: chip(deltas?.annualEnergyKwh == null ? undefined : deltas.annualEnergyKwh / opDays, n => `${Math.round(n)}/d`) },
    // ── The money ──
    { id: 'capex', label: 'ROM CAPEX', value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), accent: true,
      delta: chip(deltas?.capexMid, usd) },
    { id: 'payback', label: 'Payback', value: payback == null ? '—' : `${payback.toFixed(1)} yr`,
      delta: chip(deltas?.paybackYears, n => `${n.toFixed(1)} yr`) },
    { id: 'net', label: 'Net benefit / yr', value: usd(offset - opex), accent: true,
      delta: chip(deltas?.netAnnualBenefit, usd) },
    { id: 'offset', label: 'Labor offset / yr', value: usd(offset),
      delta: chip(deltas?.annualLaborOffset, usd) },
    { id: 'opex', label: 'Annual OPEX', value: usd(opex),
      delta: chip(deltas?.annualOpex, usd) },
    { id: 'tco', label: `TCO @ ${serviceLifeYears}yr`, value: usd(tcoAtLife) },
    { id: 'costPerMove', label: 'Cost / move', value: costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}` },
  ]

  return (
    <section className="rom-kpis" aria-label="Fleet summary — hover or click a tile for the breakdown">
      {tiles.map((t, i) => (
        <KpiTile key={t.id} label={t.label} value={t.value} detail={detail[t.id]} accent={t.accent} colorIndex={i} delta={t.delta} />
      ))}
    </section>
  )
}
