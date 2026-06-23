'use client'

import type { FleetSummary } from '@/src/calc/types'
import { resilience } from '@/src/calc/romSensitivity'

interface Props { fleet: FleetSummary }

/** Resilience: can the fleet still meet demand if one vehicle is down? Shown as a
 *  plain-English status + a demand-vs-(capacity−1) bar. */
export default function SensitivityPanel({ fleet }: Props) {
  const r = resilience({ fleet })
  const held = r.throughputHeldWithOneDown
  const pct = Math.round(r.retainedPct * 100)
  // The bar shows the worst vehicle type's capacity with one unit down, against
  // demand (100%). retainedPct is exactly (sold−1)/demand for that tightest type.
  const fill = Math.min(100, Math.max(0, pct))

  return (
    <div className="rv-sens2">
      <div className="rv-sens2-status">
        <span className={`rv-sens2-badge ${held ? 'ok' : 'warn'}`}>{held ? '✓ Robust' : `${pct}%`}</span>
        <span className="rv-sens2-headline">
          {held
            ? 'Holds full throughput with one vehicle down'
            : `Covers ${pct}% of demand with one vehicle down`}
        </span>
      </div>

      <div className="rv-sens2-bar">
        <div className="rv-sens2-track">
          <div className={`rv-sens2-fill ${held ? 'ok' : 'warn'}`} style={{ width: `${fill}%` }} />
          <div className="rv-sens2-demand" aria-hidden />
        </div>
        <div className="rv-sens2-scale">
          <span>capacity − 1 vehicle</span>
          <span>demand</span>
        </div>
      </div>

      <p className="rv-sens-note">
        {held
          ? 'The safety buffer absorbs a single vehicle outage with no throughput loss — the operation is robust to one breakdown.'
          : `With one vehicle down on the tightest type, the fleet can still move ${pct}% of demanded throughput; the rest would back up until it returns.`}
      </p>
    </div>
  )
}
