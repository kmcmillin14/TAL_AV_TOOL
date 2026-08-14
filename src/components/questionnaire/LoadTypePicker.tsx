'use client'
import Icon from '@/src/design-system/components/Icon'
import { TYPICAL_UNIT_TYPES } from '@/src/lib/constants/enums'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

export default function LoadTypePicker({ value, onChange }: Props) {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])

  return (
    <div className="cert-grid">
      {TYPICAL_UNIT_TYPES.map(opt => {
        const on = value.includes(opt)
        return (
          <label key={opt} className={`chk${on ? ' on' : ''}`}>
            <input type="checkbox" checked={on} onChange={() => toggle(opt)} />
            <span className="box">{on && <Icon name="check" size={10} />}</span>
            <span>{opt}</span>
          </label>
        )
      })}
    </div>
  )
}
