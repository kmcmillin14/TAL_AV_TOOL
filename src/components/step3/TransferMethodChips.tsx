'use client'

import type { TransferMethod } from '@/src/lib/vehicleLibrary'

interface Props {
  methods: TransferMethod[]
  activeIdx: number
  onChange: (idx: number) => void
}

export default function TransferMethodChips({ methods, activeIdx, onChange }: Props) {
  if (!methods || methods.length === 0) return null

  if (methods.length === 1) {
    return (
      <span className="transfer-chip-static">{methods[0].method}</span>
    )
  }

  return (
    <div className="transfer-chips" role="radiogroup" aria-label="Transfer method">
      {methods.map((m, i) => {
        const active = i === activeIdx
        return (
          <button
            key={`${m.method}-${i}`}
            type="button"
            role="radio"
            aria-checked={active}
            className={`transfer-chip ${active ? 'active' : ''}`}
            onClick={() => onChange(i)}
            title={`${m.method} — load ${m.loadTimeSec}s / unload ${m.unloadTimeSec}s${m.lifts ? ' (lifts)' : ''}`}
          >
            {m.method}
          </button>
        )
      })}
    </div>
  )
}
