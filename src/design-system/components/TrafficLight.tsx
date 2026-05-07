'use client'

import type { TrafficLightStatus } from '@/src/calc/types'

interface TrafficLightProps {
  status: TrafficLightStatus
  showLabel?: boolean
}

const config = {
  GREEN:  { cls: 'green',  label: 'Compatible' },
  YELLOW: { cls: 'yellow', label: 'Review Required' },
  RED:    { cls: 'red',    label: 'Not Compatible' },
}

export default function TrafficLight({ status, showLabel = true }: TrafficLightProps) {
  const { cls, label } = config[status]
  return (
    <div className="traffic-light">
      <span className={`tl-dot ${cls}`} />
      {showLabel && <span className={`tl-label ${cls}`}>{label}</span>}
    </div>
  )
}
