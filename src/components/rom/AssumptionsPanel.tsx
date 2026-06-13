'use client'

import type { StoredProject } from '@/src/lib/storage'
import { defaultOperatingDaysPerYear } from '@/src/calc/romAnalytics'
import { defaultChargeRegime } from '@/src/calc/fleet'

interface Props { project: StoredProject }

/** Auditable methodology list — the assumptions behind the numbers. */
export default function AssumptionsPanel({ project: p }: Props) {
  const daysDerived = p.operatingDaysPerYear == null
  const days = p.operatingDaysPerYear
    ?? defaultOperatingDaysPerYear(p.operatingDaysPattern, p.operatingDaysCustom)
  const rows: Array<[string, string]> = [
    ['Usable depth of discharge', '80%'],
    ['Route speed factors', 'Low 30% · Medium 50% · High 70% of rated'],
    ['Safety buffer', `${Math.round((p.bufferPct ?? 0.10) * 100)}%`],
    ['Charge regime', (p.chargeRegime
      ?? defaultChargeRegime(Math.min(24, (p.shiftsPerDay ?? 1) * (p.hoursPerShift ?? 8))))
      === 'continuous' ? 'Continuous 24/7' : 'Overnight window'],
    ['Operating days / year', daysDerived && p.operatingDaysPattern
      ? `${days} (from ${p.operatingDaysPattern})`
      : String(days)],
    ['Operators displaced', String(p.numberOfOperators || ((p.operatorsPerShift ?? 0) * (p.shiftsPerDay ?? 1)))],
    ['Fully-burdened operator', `$${(p.fullyBurdenedRateUsdPerYear ?? 65000).toLocaleString()}/yr`],
    ['Energy cost', `$${p.energyCostUsdPerKwh ?? 0.12}/kWh`],
    ['Maintenance', `${Math.round((p.annualMaintenancePctOfCapex ?? 0.08) * 100)}%/yr of CAPEX`],
    ['Service life', `${p.serviceLifeYears ?? 7} yr`],
  ]
  return (
    <dl className="rv-assume">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>
      ))}
    </dl>
  )
}
