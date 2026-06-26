'use client'

import type { StoredProject } from '@/src/lib/storage'
import { defaultOperatingDaysPerYear } from '@/src/calc/romAnalytics'

interface Props { project: StoredProject }

interface Row { label: string; value: string; why: string; isDefault: boolean }

/** Auditable assumptions behind the numbers — grouped, with a why per row and a
 *  flag on the ones still using an app default (so it's clear what to verify). */
export default function AssumptionsPanel({ project: p }: Props) {
  const days = p.operatingDaysPerYear
    ?? defaultOperatingDaysPerYear(p.operatingDaysPattern, p.operatingDaysCustom)

  const groups: Array<{ title: string; rows: Row[] }> = [
    {
      title: 'Operations',
      rows: [
        { label: 'Usable depth of discharge', value: '80%', why: 'Battery sized to 80% DoD for cycle life.', isDefault: true },
        { label: 'Route speed factors', value: 'Low 30% · Med 50% · High 70%', why: 'Route-average speed as a fraction of rated cruise.', isDefault: true },
        { label: 'Charging', value: 'Availability = min(energy, capacity)', why: 'Per vehicle type: energy availability credits the nightly off-shift and the day-off reset (a day off recharges to 100%); capacity availability is whether the battery covers a production window. Fleet = demand ÷ availability. 80% usable depth; buffer applied after.', isDefault: true },
        { label: 'Operating days / year', value: p.operatingDaysPattern && p.operatingDaysPerYear == null ? `${days} (from ${p.operatingDaysPattern})` : String(days), why: 'Annualizes energy and labor.', isDefault: p.operatingDaysPerYear == null },
      ],
    },
    {
      title: 'Energy',
      rows: [
        { label: 'Energy cost', value: `$${p.energyCostUsdPerKwh ?? 0.12}/kWh`, why: 'Blended electricity rate; full-draw estimate.', isDefault: p.energyCostUsdPerKwh == null },
      ],
    },
    {
      title: 'Economics',
      rows: [
        { label: 'Operators displaced', value: String(p.numberOfOperators || ((p.operatorsPerShift ?? 0) * (p.shiftsPerDay ?? 1))), why: 'Operators × shifts the fleet replaces.', isDefault: !p.numberOfOperators && !p.operatorsPerShift },
        { label: 'Fully-burdened operator', value: `$${(p.fullyBurdenedRateUsdPerYear ?? 65000).toLocaleString()}/yr`, why: 'All-in annual cost (wage + benefits + overhead).', isDefault: p.fullyBurdenedRateUsdPerYear == null },
        { label: 'Maintenance', value: `${Math.round((p.annualMaintenancePctOfCapex ?? 0.08) * 100)}%/yr of CAPEX`, why: 'Annual upkeep as a share of CAPEX.', isDefault: p.annualMaintenancePctOfCapex == null },
        { label: 'Safety buffer', value: `${Math.round((p.bufferPct ?? 0.10) * 100)}%`, why: 'Margin on base + charging fleet.', isDefault: p.bufferPct == null },
        { label: 'Service life', value: `${p.serviceLifeYears ?? 10} yr`, why: 'Equipment lifetime for TCO / payback.', isDefault: p.serviceLifeYears == null },
      ],
    },
  ]

  return (
    <div className="rv-assume2">
      {groups.map(g => (
        <div key={g.title} className="rv-assume2-group">
          <div className="rv-assume2-head">{g.title}</div>
          <dl className="rv-assume2-list">
            {g.rows.map(r => (
              <div key={r.label} className="rv-assume2-row" title={r.why}>
                <dt>
                  {r.label}
                  {r.isDefault && <span className="rv-assume2-tag">default</span>}
                </dt>
                <dd className="mono">{r.value}</dd>
                <p className="rv-assume2-why">{r.why}</p>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
