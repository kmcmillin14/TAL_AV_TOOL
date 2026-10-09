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
        { label: 'Availability', value: 'min(1, [z·R + (H−z·R)·d] / H)', why: 'Per platform, from physical spec: usable kWh = V × Ah × usable%; R = usable ÷ average draw; d = charge input ÷ (charge input + draw) — the duty ratio, which capacity CANCELS out of; z = how much of a full charge the off-shift refills. A vehicle works off its overnight charge, then settles into its duty ratio. At 24 h there is no off-shift and availability equals the duty ratio exactly.', isDefault: true },
        { label: 'Charging', value: 'Staggered across the fleet', why: 'Vehicles are sent to charge before they run flat, so the fleet never queues for chargers at once. Availability is therefore the average over the staffed window. Left to run in lockstep the figure would be the bare duty ratio — 11–16% more vehicles.', isDefault: true },
        { label: 'Chargers', value: 'One per vehicle', why: 'Dock contention is not modelled at this stage: every vehicle is assumed to have a charger when it needs one. This is what makes staggered charging achievable.', isDefault: true },
        { label: 'Operator breaks', value: 'Fleet keeps working', why: 'Breaks are recorded for the proposal but do not shorten the staffed window or credit charging time — the fleet runs through them.', isDefault: true },
        { label: 'Operating days / year', value: p.operatingDaysPattern && p.operatingDaysPerYear == null ? `${days} (from ${p.operatingDaysPattern})` : String(days), why: 'Annualizes the labor offset.', isDefault: p.operatingDaysPerYear == null },
      ],
    },
    {
      title: 'Economics',
      rows: [
        { label: 'Target utilization', value: `${Math.round((p.targetUtilization ?? 0.90) * 100)}%`, why: 'Share of AVAILABLE working time the fleet runs at — not of the clock. Charging downtime is counted separately and is not usable slack: a vehicle on a charger cannot answer a demand spike. Default 90% because the throughput entered is PEAK, so the fleet already carries a spike allowance.', isDefault: p.targetUtilization == null },
        { label: 'Operators displaced', value: String(p.numberOfOperators || ((p.operatorsPerShift ?? 0) * (p.shiftsPerDay ?? 1))), why: 'Operators × shifts the fleet replaces.', isDefault: !p.numberOfOperators && !p.operatorsPerShift },
        { label: 'Fully-burdened operator', value: `$${(p.fullyBurdenedRateUsdPerYear ?? 65000).toLocaleString()}/yr`, why: 'All-in annual cost (wage + benefits + overhead).', isDefault: p.fullyBurdenedRateUsdPerYear == null },
        { label: 'Maintenance', value: `${Math.round((p.annualMaintenancePctOfCapex ?? 0.08) * 100)}%/yr of CAPEX`, why: 'Annual upkeep as a share of CAPEX.', isDefault: p.annualMaintenancePctOfCapex == null },
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
