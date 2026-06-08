'use client'

import type { FleetSummary } from '@/src/calc/types'
import { resilience } from '@/src/calc/romSensitivity'

interface Props { fleet: FleetSummary }

/** Resilience readout: does throughput hold with one vehicle down? */
export default function SensitivityPanel({ fleet }: Props) {
  const r = resilience({ fleet })
  return (
    <div className="rv-sens">
      <div className={`rv-sens-card ${r.throughputHeldWithOneDown ? 'rv-sens-ok' : 'rv-sens-warn'}`}>
        <span className="rv-sens-val mono">{r.throughputHeldWithOneDown ? 'Held' : `${Math.round(r.retainedPct * 100)}%`}</span>
        <span className="rv-sens-lbl">Throughput with one vehicle down</span>
      </div>
      <p className="rv-sens-note">
        {r.throughputHeldWithOneDown
          ? 'The buffer absorbs a single vehicle outage with no throughput loss.'
          : `A single outage retains ${Math.round(r.retainedPct * 100)}% of demanded throughput on the tightest vehicle type.`}
      </p>
    </div>
  )
}
