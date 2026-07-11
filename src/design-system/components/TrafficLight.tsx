'use client'

import type { TrafficLightStatus } from '@/src/calc/types'
import Icon from './Icon'

interface TrafficLightProps {
  status: TrafficLightStatus
  showLabel?: boolean
}

const config = {
  GREEN:      { cls: 'green',      label: 'Compatible',     icon: 'check' as const },
  YELLOW:     { cls: 'yellow',     label: 'Review Required', icon: 'warn'  as const },
  RED:        { cls: 'red',        label: 'Not Compatible',  icon: 'x'     as const },
  INCOMPLETE: { cls: 'incomplete', label: 'In Progress',     icon: 'clock' as const },
}

export default function TrafficLight({ status, showLabel = true }: TrafficLightProps) {
  const { cls, label, icon } = config[status]
  return (
    <div className={`traffic-light ${cls}`}>
      <Icon name={icon} size={15} className="tl-icon" />
      {showLabel && <span className="tl-label">{label}</span>}
    </div>
  )
}
