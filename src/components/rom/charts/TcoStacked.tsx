'use client'

import type { TcoSeries } from '@/src/calc/romCharts'

const usd = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`

interface Props { series: TcoSeries }

/** Per-year bars: cost stack (CAPEX once + cumulative OPEX) vs cumulative labor offset. */
export default function TcoStacked({ series }: Props) {
  const pts = series.points
  if (pts.length < 2) return <div className="rv-empty">Size the fleet to see TCO.</div>
  const max = Math.max(1, ...pts.map(p => Math.max(p.capex + p.cumOpex, p.cumLaborOffset)))
  return (
    <div className="rv-tco">
      {pts.filter(p => p.year > 0).map(p => {
        const costH = ((p.capex + p.cumOpex) / max) * 100
        const offsetH = (p.cumLaborOffset / max) * 100
        return (
          <div key={p.year} className="rv-tco-col">
            <div className="rv-tco-bars">
              <span className="rv-tco-cost" style={{ height: `${costH}%` }} title={`Cost ${usd(p.capex + p.cumOpex)}`} />
              <span className="rv-tco-offset" style={{ height: `${offsetH}%` }} title={`Labor offset ${usd(p.cumLaborOffset)}`} />
            </div>
            <span className="rv-tco-yr mono">{p.year}</span>
          </div>
        )
      })}
    </div>
  )
}
