'use client'

import { vehicleColor } from './vehicleColor'
import type { GroupSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface Props {
  summary: GroupSummary
  vehicle?: Vehicle
}

function formatCycle(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function headroomTone(h: number | null): 'green' | 'yellow' | 'red' | '' {
  if (h == null) return ''
  if (h < 0.05) return 'red'
  if (h < 0.15) return 'yellow'
  return 'green'
}

export default function GroupSummaryCard({ summary, vehicle }: Props) {
  const color = vehicleColor(summary.vehicleId)
  const name = vehicle?.name ?? summary.vehicleId
  const manufacturer = vehicle?.display.manufacturer
  const headPct = summary.headroom == null ? null : Math.round(summary.headroom * 100)
  const tone = headroomTone(summary.headroom)

  return (
    <div className="flow-group-card">
      <div className="flow-group-head">
        <span className="veh-pill" style={{ borderColor: color, color }}>
          <span className="veh-dot" style={{ background: color }} />
          {name}
        </span>
        <span className="flow-group-count">
          {summary.flowsCount} {summary.flowsCount === 1 ? 'flow' : 'flows'}
        </span>
      </div>

      {manufacturer && <div className="flow-group-mfr">{manufacturer}</div>}

      <div className="flow-group-stats">
        <div className="flow-group-stat">
          <div className="lbl">Base Fleet</div>
          <div className="val">
            {summary.baseFleet}<span className="unit">veh</span>
          </div>
          <div className="derivation">
            raw {summary.groupRaw.toFixed(2)} → ⌈ceil⌉
          </div>
        </div>
        <div className="flow-group-stat">
          <div className="lbl">Headroom</div>
          <div className={`val ${tone}`}>
            {headPct == null ? '—' : `${headPct}%`}
          </div>
          <div className="derivation">
            (base − raw) / base
          </div>
        </div>
        <div className="flow-group-stat">
          <div className="lbl">Avg Cycle</div>
          <div className="val mono">{formatCycle(summary.avgCycleSec)}</div>
          <div className="derivation">thru-weighted</div>
        </div>
        <div className="flow-group-stat">
          <div className="lbl">Total Thru</div>
          <div className="val">
            {summary.baseThru}<span className="unit">/hr</span>
          </div>
          <div className="derivation">Σ flow throughput</div>
        </div>
      </div>
    </div>
  )
}
