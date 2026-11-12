'use client'

// + Vehicle (owner, 2026-11-12): a window of vehicle cards — photo, name, Step 2 compatibility, Sizing's
// tagged. Red ones are shown greyed with the requirement they fail. Tick one or several and add them.

import { useEffect, useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import type { VehicleChoice } from '@/src/calc/sim/simVehicles'

/** Step 2's compatibility in the spec's words (spec: Simulation vehicles). */
const STATUS_WORD = { GREEN: 'Compatible', YELLOW: 'Review required', INCOMPLETE: 'Not checked', RED: 'Not compatible' } as const

interface Props {
  choices: VehicleChoice[]
  /** Vehicle ids already in the simulation (shown ticked, not addable again). */
  added: Set<string>
  onAdd: (vehicleIds: string[]) => void
  onClose: () => void
}

export default function VehiclePicker({ choices, added, onAdd, onClose }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  // Focus the first card once, on open (not on every re-render of the page behind it).
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('.sim-vcard:not(:disabled)')?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const n = picked.size

  return (
    <div className="sim-vpick-overlay" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sim-vpick" role="dialog" aria-modal="true" aria-labelledby="sim-vpick-title" ref={dialog}>
        <header className="sim-vpick-head">
          <h2 id="sim-vpick-title">Add vehicles</h2>
          <span className="sim-vpick-sub">Simulation only — Sizing keeps its vehicles</span>
          <button type="button" className="sim-vpick-close" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </header>
        <ul className="sim-vpick-grid">
          {choices.map(({ vehicle: v, status, sizing, why }) => {
            const isAdded = added.has(v.id), red = status === 'RED', on = isAdded || picked.has(v.id)
            return (
              <li key={v.id}>
                <button type="button" className={`sim-vcard${on ? ' is-on' : ''}${red ? ' is-red' : ''}`} aria-pressed={on}
                  disabled={isAdded || red} title={why} onClick={() => toggle(v.id)}>
                  <span className="sim-vcard-check" aria-hidden>{on && <Icon name="check" size={12} />}</span>
                  <span className="sim-vcard-img">
                    {/* eslint-disable-next-line @next/next/no-img-element -- card photo; CSS sizes it */}
                    {v.display.heroImage ? <img src={v.display.heroImage} alt="" loading="lazy" /> : <span>{v.display.category}</span>}
                  </span>
                  <span className="sim-vcard-name">{v.name}</span>
                  <span className="sim-vcard-mfr">{v.display.manufacturer}</span>
                  <span className="sim-vcard-tags">
                    <span className={`sim-vcard-status is-${status.toLowerCase()}`}><TrafficLight status={status} showLabel={false} />{STATUS_WORD[status]}</span>
                    {sizing && <span className="sim-chip sm">Sizing</span>}
                    {isAdded && <span className="sim-chip sm">Added</span>}
                  </span>
                  {why && <span className="sim-vcard-why">{why}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        <footer className="sim-vpick-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!n} onClick={() => onAdd([...picked])}>
            {n ? `Add ${n} vehicle${n === 1 ? '' : 's'}` : 'Add vehicles'}
          </button>
        </footer>
      </div>
    </div>
  )
}
