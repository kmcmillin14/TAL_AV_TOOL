'use client'

import StepPlaceholder from '@/src/components/StepPlaceholder'

export default function Step3Page() {
  return (
    <StepPlaceholder
      stepId={3}
      title="Material Flows"
      desc="Define pickup / drop-off pairs, distances, and per-flow throughput."
      comingSoon="Flow modeling, distance graphs, and throughput-per-flow calculations will live here."
    />
  )
}
