'use client'

import { useEffect, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { HELP } from '@/src/content/help'

interface Props {
  open: boolean
  onClose: () => void
  /** 0–6; the drawer opens to this step's guide. */
  currentStep: number
}

/**
 * App help. One entry point (the header "?") opens this right-side drawer. It's
 * context-aware — it opens to the current step's guide — and browsable via the
 * left rail (App Overview + every step). Content lives in `src/content/help.ts`.
 */
export default function HelpDrawer({ open, onClose, currentStep }: Props) {
  const [activeId, setActiveId] = useState<string>('app')

  // Open to the current step each time the drawer is opened.
  useEffect(() => {
    if (open) setActiveId(`step${currentStep}`)
  }, [open, currentStep])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const active = HELP.find(s => s.id === activeId) ?? HELP[0]

  return (
    <div className="help-overlay" onMouseDown={onClose}>
      <aside
        className="help-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Help — how to use this tool"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="help-drawer-head">
          <span className="help-drawer-title">Help · how to use this tool</span>
          <button type="button" className="help-close" onClick={onClose} aria-label="Close help">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="help-drawer-body">
          <nav className="help-rail" aria-label="Help sections">
            {HELP.map(s => (
              <button
                key={s.id}
                type="button"
                className={`help-rail-item${s.id === active.id ? ' active' : ''}`}
                onClick={() => setActiveId(s.id)}
              >
                <span>{s.title}</span>
                {s.status === 'coming' && <span className="help-soon">soon</span>}
              </button>
            ))}
          </nav>

          <section className="help-content">
            <h2>{active.title}</h2>
            <p className="help-summary">{active.summary}</p>
            {active.status === 'coming' && (
              <p className="help-coming">This step isn’t built yet — here’s what it will do.</p>
            )}
            {active.howTo.length > 0 && (
              <>
                <h3>How to use it</h3>
                <ol className="help-howto">
                  {active.howTo.map((h, i) => <li key={i}>{h}</li>)}
                </ol>
              </>
            )}
            {active.tips && active.tips.length > 0 && (
              <>
                <h3>Tips</h3>
                <ul className="help-tips">
                  {active.tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
