'use client'

import type { FleetSummary, Flow, FleetSettings } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { RomSummary, RomCostInputs } from '@/src/calc/rom'
import { resilience } from '@/src/calc/romSensitivity'
import { chargingSeries } from '@/src/calc/romCharts'
import { kpiDetails, type KpiId } from '@/src/lib/kpiDetails'
import type { PricingGate } from '@/src/lib/romComplexityFromProject'
import KpiTile from './KpiTile'
import RomGauge from './RomGauge'

// Canonical compact-USD formatter lives in vehicleDisplay; re-exported here so
// ROM components keep their existing import path.
import { money } from '@/src/lib/vehicleDisplay'
import { simulatedNote } from '@/src/calc/fleet'
export const usd = money

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
  /** Which half of the former Dashboard band (2026-11-18): the money (05 Pricing) or the fleet and its
   *  gauges (04 Simulation). */
  view: 'finance' | 'operations'
  /** Withholds CAPEX and everything built on it while complexity inputs are
   *  missing — same rule Step 4 applies, so the surfaces can't disagree. */
  gate: PricingGate
}

/** What a CAPEX-derived tile shows instead of a figure it cannot stand behind. */
const NOT_PRICED = 'Not priced'

/** Every tile whose number is derived from CAPEX, and so cannot be shown while
 *  CAPEX is withheld. Annual OPEX and Net benefit are on this list because
 *  `annualMaintenance = capexMid x pct` (src/calc/rom.ts) — printing them as
 *  hard dollars lets a reader divide back out the CAPEX the gate is refusing
 *  to state. The hover detail is withheld with the value for the same reason:
 *  kpiDetails prints the full range and the TCO formula. */
const CAPEX_DERIVED: ReadonlySet<KpiId> = new Set<KpiId>([
  'capex', 'payback', 'tco', 'costPerMove', 'opex', 'net',
])

/** Top KPI band — interactive tiles (hover/pin reveals each metric's breakdown).
 *  Fleet sold + ROM CAPEX are the accent headline; the rest are secondary. */
export default function RomKpis({ fleet, rom, flows, settings, costs, serviceLifeYears, vehicleById, names, view, gate }: Props) {
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
  const blocked = gate.blocked
  const pctChip = (n: number) => `${Math.round(n * 100)}%`

  // Fleet-wide gauge aggregates, weighted by units sold. The three gauges must
  // PARTITION the day, not double-report it: availability + charging = 100%, and
  // utilization is of AVAILABLE time. Before v4 the utilization gauge was
  // raw ÷ sold, which collapses to U × availability — so it silently carried
  // charging downtime that the Charging gauge then showed again, and it
  // contradicted the "Target utilization" driver sitting beside it.
  let wAvail = 0, wCapacity = 0
  for (const g of fleet.groups) {
    const a = g.charging.availability ?? 1
    wAvail += a * g.fleetSold
    wCapacity += g.fleetSold * a
  }
  const avgAvailability = totalSold > 0 ? wAvail / totalSold : 0
  const avgCharging = 1 - avgAvailability
  const avgUtilOfAvailable = wCapacity > 0 ? totalRaw / wCapacity : null

  // Tiles rendered inside the two hero boxes (Fleet & flow · Financials). Utilization,
  // availability, charging and redundancy are shown as gauges below, not tiles here.
  const tiles: Array<{ id: KpiId; label: string; value: string; accent?: boolean }> = [
    // ── Fleet & flow ──
    { id: 'fleet', label: simulatedNote(fleet) ? `Total fleet — ${simulatedNote(fleet)}` : 'Total fleet', value: String(fleet.totalFleetSold), accent: true },
    { id: 'types', label: 'Vehicle types', value: String(fleet.groups.length) },
    { id: 'flows', label: 'Flows', value: String(flows.length) },
    { id: 'throughput', label: 'Throughput', value: `${throughput} / hr` },
    // ── Financials ──
    // CAPEX and everything built on it read "Not priced" while the complexity
    // inputs behind professional services / software are missing — the same
    // rule Step 4 applies, so the two surfaces agree.
    { id: 'capex', label: 'ROM CAPEX', value: blocked ? NOT_PRICED : usdRange(rom.pricing.totalMin, rom.pricing.totalMax), accent: true },
    { id: 'payback', label: 'Payback', value: blocked ? NOT_PRICED : (payback == null ? '—' : `${payback.toFixed(1)} yr`) },
    { id: 'net', label: 'Net benefit / yr', value: blocked ? NOT_PRICED : usd(offset - opex), accent: true },
    { id: 'offset', label: 'Labor offset / yr', value: usd(offset) },
    { id: 'opex', label: 'Annual OPEX', value: blocked ? NOT_PRICED : usd(opex) },
    { id: 'tco', label: `TCO @ ${serviceLifeYears}yr`, value: blocked ? NOT_PRICED : usd(tcoAtLife) },
    { id: 'costPerMove', label: 'Cost / move', value: blocked ? NOT_PRICED : (costPerMove == null ? '—' : `$${costPerMove.toFixed(2)}`) },
  ]

  const byId = new Map(tiles.map((t, i) => [t.id, { ...t, colorIndex: i }]))
  const tile = (id: KpiId) => {
    const t = byId.get(id)
    if (!t) return null
    // Withhold the popover too — it prints the very range the tile is hiding.
    const d = blocked && CAPEX_DERIVED.has(id) ? undefined : detail[id]
    return <KpiTile key={id} label={t.label} value={t.value} detail={d} accent={t.accent} colorIndex={t.colorIndex} />
  }

  // Financials leads with CAPEX and shows only the two figures a decision turns
  // on — payback and net benefit. Labor offset, OPEX, TCO and cost/move are
  // diligence material and fold away: seven money figures at equal weight is a
  // report, not an answer. Same split the customer deck already makes between
  // fillFinancials (3 tiles) and fillCostDetail (the rest).
  if (view === 'finance') {
    return (
      <div className="rom2-summary is-single">
        <section className="rom2-hero">
          <div className="rom2-hero-head">Financials</div>
          <div className="rom2-hero-lead">{tile('capex')}</div>
          <div className="rom2-hero-grid">
            {tile('payback')}{tile('net')}
          </div>
          <details className="rom2-hero-more">
            <summary>Cost detail</summary>
            <div className="rom2-hero-grid">
              {tile('offset')}{tile('opex')}{tile('tco')}{tile('costPerMove')}
            </div>
          </details>
        </section>
      </div>
    )
  }

  return (
    <>
      <div className="rom2-summary is-single">
        <section className="rom2-hero">
          <div className="rom2-hero-head">Fleet &amp; flow</div>
          <div className="rom2-hero-lead">{tile('fleet')}</div>
          <div className="rom2-hero-grid">
            {tile('types')}{tile('flows')}{tile('throughput')}
          </div>
        </section>
      </div>

      <div className="rom2-gauges">
        {/* Each gauge links to the chart that proves it — the conclusion and its
            evidence were a screen and a half apart with nothing joining them. */}
        <RomGauge value={avgUtilOfAvailable ?? 0} label="Utilization" display={avgUtilOfAvailable == null ? '—' : pctChip(avgUtilOfAvailable)}
          evidenceId="rom-utilization" evidenceLabel="the utilization chart"
          def="Share of the time a vehicle COULD work that it does — charging downtime is excluded and shown separately. This is the figure Sizing’s target utilization sets." />
        <RomGauge value={avgAvailability} label="Availability" status
          evidenceId="rom-battery" evidenceLabel="the battery state-of-charge chart"
          def="Share of the staffed window a vehicle can be working rather than on a charger. Availability + Charging = 100%." />
        <RomGauge value={avgCharging} label="Charging" status
          evidenceId="rom-battery" evidenceLabel="the battery state-of-charge chart"
          def="Share of the staffed window a vehicle spends recharging instead of moving loads — the complement of Availability." />
        {/* 'Held' / a % rather than a bare tick: colour alone shouldn't carry it. */}
        <RomGauge value={res.throughputHeldWithOneDown ? 1 : res.retainedPct} label="Redundancy" status
          display={res.throughputHeldWithOneDown ? 'Held' : pctChip(res.retainedPct)}
          evidenceId="rom-redundancy" evidenceLabel="the redundancy breakdown"
          def="Backup capacity if one vehicle goes down: “Held” means full throughput is still met; a % is the share of demand the remaining fleet can cover." />
      </div>
    </>
  )
}
