'use client'

import type { FleetSummary, Flow, FleetSettings } from '@/src/calc/types'
import type { RomSummary } from '@/src/calc/rom'
import { kpiDetails, type KpiId } from '@/src/lib/kpiDetails'
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
  names: Record<string, string>
}

/** Top KPI band — interactive tiles (hover/pin reveals each metric's breakdown).
 *  Fleet sold + ROM CAPEX are the accent headline; the rest are secondary. */
export default function RomKpis({ fleet, rom, flows, settings, names }: Props) {
  const payback = rom.payback.paybackYears
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const detail = kpiDetails({ fleet, rom, flows, settings }, names)

  const tiles: Array<{ id: KpiId; label: string; value: string; accent?: boolean }> = [
    { id: 'fleet', label: 'Total fleet', value: String(fleet.totalFleetSold), accent: true },
    { id: 'types', label: 'Vehicle types', value: String(fleet.groups.length) },
    { id: 'flows', label: 'Flows', value: String(flows.length) },
    { id: 'throughput', label: 'Throughput', value: `${throughput} / hr` },
    { id: 'capex', label: 'ROM CAPEX', value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), accent: true },
    { id: 'payback', label: 'Payback', value: payback == null ? '—' : `${payback.toFixed(1)} yr` },
  ]

  return (
    <section className="rom-kpis" aria-label="Fleet summary — hover or click a tile for the breakdown">
      {tiles.map((t, i) => (
        <KpiTile key={t.id} label={t.label} value={t.value} detail={detail[t.id]} accent={t.accent} colorIndex={i} />
      ))}
    </section>
  )
}
