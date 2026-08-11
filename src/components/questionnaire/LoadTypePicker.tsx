'use client'
import Image from 'next/image'
import { TYPICAL_UNIT_TYPES, LOAD_TYPE_IMAGE_SLUG } from '@/src/lib/constants/enums'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

export default function LoadTypePicker({ value, onChange }: Props) {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])

  return (
    <div className="load-type-grid">
      {TYPICAL_UNIT_TYPES.map(opt => {
        const slug = LOAD_TYPE_IMAGE_SLUG[opt]
        const on = value.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            className={`load-type-card${on ? ' on' : ''}`}
            onClick={() => toggle(opt)}
            aria-pressed={on}
          >
            {slug ? (
              <div className="load-type-img-wrap">
                <Image
                  src={`/images/load-types/${slug}.png`}
                  alt={opt}
                  fill
                  sizes="64px"
                  className="load-type-img"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            ) : (
              <div className="load-type-placeholder" aria-hidden />
            )}
            <span className="load-type-label">{opt}</span>
          </button>
        )
      })}
    </div>
  )
}
