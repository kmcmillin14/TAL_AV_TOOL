'use client'

import type { FleetSummary } from '@/src/calc/types'
import type { RomSummary } from '@/src/calc/rom'

export const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
  : `$${Math.round(n)}`

export const usdRange = (min: number, max: number) =>
  min === max ? usd(min) : `${usd(min)} – ${usd(max)}`

interface Props {
  fleet: FleetSummary
  rom: RomSummary
  flowCount: number
  totalThruPerHr: number
}

/** Top KPI band: fleet sold, vehicle types, throughput, CAPEX range, payback. */
export default function RomKpis({ fleet, rom, flowCount, totalThruPerHr }: Props) {
  const payback = rom.payback.paybackYears
  const kpis: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Total fleet', value: String(fleet.totalFleetSold), accent: true },
    { label: 'Vehicle types', value: String(fleet.groups.length) },
    { label: 'Flows', value: String(flowCount) },
    { label: 'Throughput', value: `${totalThruPerHr} / hr` },
    { label: 'ROM CAPEX', value: usdRange(rom.pricing.totalMin, rom.pricing.totalMax), accent: true },
    { label: 'Payback', value: payback == null ? '—' : `${payback.toFixed(1)} yr` },
  ]
  return (
    <section className="rom-kpis" aria-label="Fleet summary">
      {kpis.map(k => (
        <div key={k.label} className={`rom-kpi${k.accent ? ' rom-kpi-accent' : ''}`}>
          <span className="rom-kpi-val mono">{k.value}</span>
          <span className="rom-kpi-lbl">{k.label}</span>
        </div>
      ))}
    </section>
  )
}
