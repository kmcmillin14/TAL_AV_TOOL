'use client'
import { TYPICAL_UNIT_TYPES } from '@/src/lib/constants/enums'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

export default function LoadTypePicker({ value, onChange }: Props) {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])

  return (
    <div className="chk">
      {TYPICAL_UNIT_TYPES.map(opt => {
        const on = value.includes(opt)
        return (
          <label key={opt} className={`chk-item${on ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(opt)}
            />
            {opt}
          </label>
        )
      })}
    </div>
  )
}
