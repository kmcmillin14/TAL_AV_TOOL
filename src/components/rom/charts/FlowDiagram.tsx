'use client'

import type { FlowDiagramSeries } from '@/src/calc/romCharts'

interface Props { series: FlowDiagramSeries }

/** Node-link operation map: each origin fans out to its destinations with thru/hr labels. */
export default function FlowDiagram({ series }: Props) {
  if (series.origins.length === 0) return <div className="rv-empty">Add flows with origins and vehicles to map the operation.</div>
  return (
    <div className="rv-flowmap">
      {series.origins.map(o => (
        <div key={o.id} className="rv-flow-origin">
          <div className="rv-flow-node rv-flow-src">{o.label}</div>
          <div className="rv-flow-edges">
            {o.edges.map((e, i) => (
              <div key={i} className="rv-flow-edge">
                <span className="rv-flow-thru mono">{e.thruPerHr}/hr</span>
                <span className="rv-flow-arrow" aria-hidden="true">→</span>
                <span className="rv-flow-node rv-flow-dst">
                  {e.destLabel}
                  <span className="rv-flow-qty mono">Qty {e.qty} · {e.vehicleName}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
