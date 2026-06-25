'use client'

import { useEffect, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { HELP } from '@/src/content/help'
import HelpMock from './HelpMock'

interface Props {
  open: boolean
  onClose: () => void
  /** 0–4; the guide opens to this step's section. */
  currentStep: number
}

/**
 * App help. One entry point (the header "?") opens this full-screen guide. It's
 * context-aware — it opens to the current step's section — and browsable via the
 * left rail (Overview + every step). Content lives in `src/content/help.ts`.
 */
export default function HelpDrawer({ open, onClose, currentStep }: Props) {
  const [activeId, setActiveId] = useState<string>('app')

  // Open to the current step each time the guide is opened.
  useEffect(() => {
    if (open) setActiveId(`step${currentStep}`)
  }, [open, currentStep])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const active = HELP.find(s => s.id === activeId) ?? HELP[0]

  return (
    <div className="help-overlay" onMouseDown={onClose}>
      <section
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Help — how to use this tool"
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="help-panel-head">
          <span className="help-panel-title">Help · how to use this tool</span>
          <button type="button" className="help-close" onClick={onClose} aria-label="Close help">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="help-panel-body">
          <nav className="help-rail" aria-label="Help sections">
            {HELP.map(s => (
              <button
                key={s.id}
                type="button"
                className={`help-rail-item${s.id === active.id ? ' active' : ''}`}
                onClick={() => setActiveId(s.id)}
              >
                {s.eyebrow && <span className="help-rail-num">{s.eyebrow}</span>}
                <span className="help-rail-name">{s.title}</span>
              </button>
            ))}
          </nav>

          <article className="help-content">
            {active.eyebrow && <span className="help-eyebrow">{active.eyebrow}</span>}
            <h2 className="help-h2">{active.title}</h2>
            <p className="help-summary">{active.summary}</p>

            <div className="help-grid">
              <div className="help-grid-main">
                {active.howTo.length > 0 && (
                  <>
                    <h3 className="help-h3">How to use it</h3>
                    <ol className="help-howto">
                      {active.howTo.map((h, i) => <li key={i}>{h}</li>)}
                    </ol>
                  </>
                )}

                {active.example && (
                  <div className="help-example">
                    <span className="help-example-cap">{active.example.title}</span>
                    <ul className="help-example-lines">
                      {active.example.lines.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </div>
                )}

                {active.tips && active.tips.length > 0 && (
                  <>
                    <h3 className="help-h3">Tips</h3>
                    <ul className="help-tips">
                      {active.tips.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </>
                )}
              </div>

              {active.figure && (
                <aside className="help-grid-aside">
                  <HelpMock figure={active.figure} />
                </aside>
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
