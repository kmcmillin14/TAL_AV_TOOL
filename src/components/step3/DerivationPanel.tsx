'use client'

import type { RefObject } from 'react'
import type { Derivation } from '@/src/lib/derivation'
import FloatingPanel from './FloatingPanel'

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  derivation: Derivation
  /** Optional context line under the title (e.g. "Dock → Storage 1"). */
  route?: string
}

/**
 * Click-to-open worked derivation, rendered from a pure {@link Derivation}
 * (src/lib/derivation.ts). Reads like an engineering sheet: each step shows its
 * label, the symbolic formula (what it MEANS), the value-substituted form, and
 * the result flush-right. Used for all three Fleet Engine tiers (Raw cycle →
 * demand, Charging, Buffer); the PPTX renders the same model.
 */
export default function DerivationPanel({ anchorRef, open, onClose, derivation, route }: Props) {
  return (
    <FloatingPanel anchorRef={anchorRef} open={open} onClose={onClose} align="right" className="deriv-panel">
      <div className="deriv-head">
        <span className="deriv-title">{derivation.title}</span>
        {derivation.tag && <span className="deriv-tag mono">{derivation.tag}</span>}
      </div>
      {route && <div className="deriv-route">{route}</div>}

      {derivation.steps.map((s, i) =>
        s.kind === 'section' ? (
          <div key={i} className="deriv-section">{s.label}</div>
        ) : (
          <div key={i} className={`deriv-row${s.emphasis ? ' emphasis' : ''}${s.muted ? ' muted' : ''}`}>
            <div className="deriv-formula">
              <span className="deriv-label">{s.label}</span>
              {s.expr && <span className="deriv-symbol">{s.expr}</span>}
              {s.sub != null && <span className="deriv-sub">{s.sub}</span>}
            </div>
            <span className="deriv-result mono">
              {s.result}
              {s.unit && <span className="deriv-unit">{s.unit}</span>}
            </span>
          </div>
        ),
      )}

      {derivation.note && <div className="deriv-note">{derivation.note}</div>}
    </FloatingPanel>
  )
}
