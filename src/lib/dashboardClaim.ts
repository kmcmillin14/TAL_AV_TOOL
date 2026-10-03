import type { FleetModel } from './fleetModel'

/** The dashboard's opening claim, in three short clauses.
 *
 *  The page used to open with twelve numbers and no statement. A customer's
 *  question is "should we do this?", and twelve figures do not answer it — the
 *  deck has known this for a while (see `takeaways.ts`, which titles every data
 *  slide with its own claim). This is the dashboard's equivalent.
 *
 *  Deliberately NOT importing the deck's builders: those live in
 *  `src/lib/pptx/` and pull `./layout` with them, which would drag slide-
 *  rendering code into the dashboard bundle for two strings.
 *
 *  Money clauses are omitted when the project can't be priced — the gate's rule
 *  is that no number beats a bad number, and a headline is the worst place to
 *  break it. */
export interface DashboardClaim {
  /** Always present once a fleet exists, e.g. "15 vehicles across 3 types". */
  fleet: string | null
  /** ROM range, omitted while pricing is withheld. */
  cost: string | null
  /** Simple payback, omitted while pricing is withheld. */
  payback: string | null
}

/** Compact USD for a headline: $2.40M / $985K / $12,500. */
function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n).toLocaleString()}`
}

export function dashboardClaim(model: FleetModel): DashboardClaim {
  const { fleet, rom, gate } = model
  const total = fleet.totalFleetSold
  const types = fleet.groups.filter(g => g.fleetSold > 0).length

  const fleetClause = total > 0
    ? `${total} vehicle${total === 1 ? '' : 's'}${types > 1 ? ` across ${types} types` : ''}`
    : null

  if (gate.blocked) return { fleet: fleetClause, cost: null, payback: null }

  const cost = rom.pricing.totalMid > 0
    ? `${compactUsd(rom.pricing.totalMin)} – ${compactUsd(rom.pricing.totalMax)}`
    : null

  const yrs = rom.payback.paybackYears
  const payback = yrs != null && yrs > 0 ? `Pays back in ${yrs.toFixed(1)} years` : null

  return { fleet: fleetClause, cost, payback }
}
