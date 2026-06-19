'use client'

import type { CSSProperties } from 'react'
import { METHODOLOGY } from '@/src/content/methodology'

/**
 * The "how the math works" reference for Step 4 → 04 Methodology. For each calc
 * stage it shows the formula, defines every variable (symbol → meaning + unit),
 * and explains WHY the formula is shaped that way. Content lives in
 * src/content/methodology.ts; this is pure presentation (TAL design system).
 */
export default function MethodologyPanel() {
  return (
    <div className="method">
      {METHODOLOGY.map((t, i) => (
        <section key={t.id} className="method-topic" style={{ '--i': i } as CSSProperties}>
          <header className="method-topic-head">
            <span className="method-num mono">{t.num}</span>
            <h4 className="method-title">{t.title}</h4>
          </header>

          <div className="method-formula mono">{t.formula}</div>

          <dl className="method-vars">
            {t.variables.map(v => (
              <div key={v.sym} className="method-var">
                <dt><span className="method-sym mono">{v.sym}</span></dt>
                <dd>
                  <span className="method-var-name">{v.name}</span>
                  {v.unit && <span className="method-var-unit mono">{v.unit}</span>}
                  <span className="method-var-def">{v.def}</span>
                </dd>
              </div>
            ))}
          </dl>

          <p className="method-why"><span className="method-why-tag">Why</span>{t.why}</p>
        </section>
      ))}
    </div>
  )
}
