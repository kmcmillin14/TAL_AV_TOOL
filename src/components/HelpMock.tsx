'use client'

import type { HelpFigure, MockId } from '@/src/content/help'

/** Illustrative, on-brand mockups for the Help guide. Each is a lightweight CSS
 *  diagram — not a pixel-perfect screenshot — so it never goes stale. When a real
 *  screenshot path is supplied (`figure.shot`), we show that instead. */
export default function HelpMock({ figure }: { figure: HelpFigure }) {
  return (
    <figure className="help-fig">
      <div className="help-fig-frame">
        {figure.shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={figure.shot} alt={figure.caption} className="help-fig-img" />
        ) : (
          <Mock id={figure.mock} />
        )}
      </div>
      <figcaption className="help-fig-cap">{figure.caption}</figcaption>
    </figure>
  )
}

function Mock({ id }: { id: MockId }) {
  switch (id) {
    case 'app-flow':
      return (
        <div className="hm-flowrow">
          {['Start', 'Intake', 'Compatibility', 'Sizing', 'Simulation', 'Pricing', 'Export'].map((s, i, all) => (
            <div className="hm-flowstep" key={s}>
              <span className="hm-chip">{`0${i}`}</span>
              <span className="hm-flowlbl">{s}</span>
              {i < all.length - 1 && <span className="hm-arrow" aria-hidden>→</span>}
            </div>
          ))}
        </div>
      )

    case 'entry':
      return (
        <div className="hm-stack">
          <div className="hm-detailbar">
            {['REV', 'OPP', 'Customer', 'Project'].map(f => (
              <span className="hm-field" key={f}><i>{f}</i></span>
            ))}
          </div>
          <div className="hm-cards3">
            {['Start New', 'Import Questionnaire', 'Import Revision'].map(c => (
              <div className="hm-card" key={c}>
                <span className="hm-card-ic" aria-hidden />
                <span className="hm-card-t">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )

    case 'form':
      return (
        <div className="hm-stack">
          <div className="hm-formrow"><span className="hm-lbl">Max Load Weight <em>*</em></span><span className="hm-input">2,500 lb</span></div>
          <div className="hm-formrow"><span className="hm-lbl">Transfer Method <em>*</em></span><span className="hm-input">Lift</span></div>
          <div className="hm-flowtable">
            <div className="hm-ft-head">
              <span>Origin</span><span>Destination</span><span>Distance</span><span>Moves/hr</span>
            </div>
            <div className="hm-ft-row">
              <span>Receiving</span><span>Rack A</span><span>300 ft</span><span>30</span>
            </div>
          </div>
        </div>
      )

    case 'matrix':
      return (
        <div className="hm-cards3">
          {([['CB18 AGF', 'good'], ['Mini Load', 'warn'], ['Tugger', 'bad']] as const).map(([n, tone]) => (
            <div className="hm-vcard" key={n}>
              <span className="hm-vimg" aria-hidden />
              <span className="hm-vrow"><span className={`hm-light ${tone}`} /> {n}</span>
            </div>
          ))}
        </div>
      )

    case 'engine':
      return (
        <div className="hm-waterfall">
          {([['Base', '5', 'base'], ['+ Charging', '6', 'add'], ['× Buffer', '7', 'buf'], ['Total', '7', 'tot']] as const).map(([l, v, k]) => (
            <div className={`hm-wf-col ${k}`} key={l}>
              <span className="hm-wf-val">{v}</span>
              <span className="hm-wf-lbl">{l}</span>
            </div>
          ))}
        </div>
      )

    default:
      return null
  }
}
