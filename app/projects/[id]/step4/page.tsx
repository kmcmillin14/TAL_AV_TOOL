'use client'

import StepPlaceholder from '@/src/components/StepPlaceholder'

export default function RomDashboardPage() {
  return (
    <StepPlaceholder
      stepId={4}
      title="ROM Dashboard"
      desc="Total fleet, KPIs, and rough-order pricing — the customer-facing proposal."
      comingSoon="Fleet KPIs (utilization, CAPEX/OPEX, payback), ROM pricing, and proposal export will live here, fed by the Fleet Engine total."
    />
  )
}
