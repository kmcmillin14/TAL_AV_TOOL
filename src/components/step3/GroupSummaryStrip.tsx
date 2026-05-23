'use client'

import type { GroupSummary } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { VehicleDot } from './VehicleSelect'

interface Props {
  groups: GroupSummary[]
  vehicleById: Map<string, Vehicle>
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

export default function GroupSummaryStrip({ groups, vehicleById }: Props) {
  if (groups.length === 0) {
    return (
      <div className="flow-group-strip">
        <div className="flow-group-row flow-group-row-empty">
          <span className="flow-group-empty-msg">
            Assign a vehicle to a flow to see fleet sizing here.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flow-group-strip">
      {groups.map(g => {
        const vehicle = vehicleById.get(g.vehicleId)
        const name = vehicle?.name ?? g.vehicleId
        const mfr = vehicle?.display.manufacturer
        const headPct = g.headroom == null ? null : Math.round(g.headroom * 100)
        const tone = headroomTone(g.headroom)
        return (
          <div className="flow-group-row" key={g.vehicleId}>
            <div className="flow-group-id">
              <VehicleDot vehicle={vehicle} size="lg" />
              <div className="flow-group-name">
                <span className="flow-group-name-primary">{name}</span>
                {mfr && <span className="flow-group-name-mfr">{mfr}</span>}
              </div>
            </div>

            <div className="flow-group-seg">
              <span className="lbl">Base Fleet</span>
              <span className="val mono">{g.baseFleet}</span>
              <span className="derivation mono">
                raw {g.groupRaw.toFixed(2)} → ⌈ceil⌉
              </span>
            </div>

            <div className="flow-group-seg">
              <span className="lbl">Headroom</span>
              <span className={`val mono ${tone}`}>
                {headPct == null ? '—' : `${headPct}%`}
              </span>
            </div>

            <div className="flow-group-seg flow-group-seg-trail">
              <span className="mono">
                {g.flowsCount} {g.flowsCount === 1 ? 'flow' : 'flows'} ·
                {' '}{g.baseThru}/hr · cycle {formatCycle(g.avgCycleSec)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
