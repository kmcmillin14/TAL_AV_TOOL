'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/src/design-system/components/Icon'

const SEEN_KEY = 'tal:tourSeen'
/** Fire `window.dispatchEvent(new Event(TOUR_EVENT))` to (re)open the tour. */
export const TOUR_EVENT = 'tal:start-tour'

interface Step {
  /** CSS selector for the element to spotlight; null = centered card, no spotlight. */
  target: string | null
  title: string
  body: string
}

// Anchored to the always-present header step bar. The intro spotlights the whole
// nav; each following step highlights one tab. Framed by the Cut → Connect → Add
// engineering discipline the tool is built around.
const STEPS: Step[] = [
  {
    target: '.hero-nav .step-dots',
    title: 'Four steps, one flow',
    body: 'This tool sizes an AGV/AMR fleet in four steps. The engineering discipline behind it: Cut waste → Connect the moves → Add the economics. Here is where each step lives.',
  },
  {
    // Tabs are 0-indexed steps (Start · Application · Vehicles · Fleet Engine ·
    // ROM), so Requirements is the 2nd tab, and so on.
    target: '.hero-nav .step-dot:nth-child(2)',
    title: '① Requirements',
    body: 'Capture what you move, how it transfers, and the environment. These answers qualify vehicles — nothing here is required to move on.',
  },
  {
    target: '.hero-nav .step-dot:nth-child(3)',
    title: '② Vehicles',
    body: 'See which vehicles pass your requirements (green / yellow / red). Informational — you never pick a vehicle here; you just learn the candidates.',
  },
  {
    target: '.hero-nav .step-dot:nth-child(4)',
    title: '③ Fleet Engine',
    body: 'Define your material flows and assign a vehicle to each. This is the heart of the tool — cycle times and raw demand compute live as you go.',
  },
  {
    target: '.hero-nav .step-dot:nth-child(5)',
    title: '④ ROM Dashboard',
    body: 'Fleet size, CAPEX, payback, and cost-per-move — then export the customer deck. Adjust the drivers to run what-if scenarios.',
  },
]

interface Rect { top: number; left: number; width: number; height: number }

export default function GuidedTour() {
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const step = STEPS[i]

  // First-run auto-open + listen for a manual (re)open request from the help drawer.
  useEffect(() => {
    const start = () => { setI(0); setOpen(true) }
    let seen = true
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch { /* private mode */ }
    if (!seen) {
      // Let the header paint before spotlighting it.
      const t = setTimeout(start, 500)
      window.addEventListener(TOUR_EVENT, start)
      return () => { clearTimeout(t); window.removeEventListener(TOUR_EVENT, start) }
    }
    window.addEventListener(TOUR_EVENT, start)
    return () => window.removeEventListener(TOUR_EVENT, start)
  }, [])

  // Track the target with a continuous rAF loop while the tour is open. Polling
  // each frame (and only committing a changed rect) keeps the spotlight glued to
  // the element through late layout shifts — the async Toyota Type font swap
  // reflows the header AFTER first paint, a one-shot measure would land stale/high.
  useEffect(() => {
    if (!open) return
    const target = step?.target ? document.querySelector<HTMLElement>(step.target) : null
    // Bring an off-screen tab into view (the phone ribbon scrolls horizontally).
    target?.scrollIntoView({ inline: 'center', block: 'nearest' })
    let raf = 0
    let prev = ''
    const tick = () => {
      if (target) {
        const r = target.getBoundingClientRect()
        const key = `${r.top}|${r.left}|${r.width}|${r.height}`
        if (key !== prev) { prev = key; setRect({ top: r.top, left: r.left, width: r.width, height: r.height }) }
      } else if (prev !== 'null') {
        prev = 'null'; setRect(null)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, step?.target])

  // Escape closes; body scroll locked while the tour is up.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  function finish() {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }
  const next = () => { if (i < STEPS.length - 1) setI(i + 1); else finish() }
  const back = () => setI(n => Math.max(0, n - 1))

  if (!open || typeof document === 'undefined') return null

  const PAD = 3
  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  // Card sits under the spotlight when there's room, else centered.
  const cardTop = spot ? spot.top + spot.height + 14 : undefined
  const last = i === STEPS.length - 1

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Scrim: a spotlight hole via a giant box-shadow, or a plain dim when unanchored. */}
      {spot
        ? <div className="tour-spot" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />
        : <div className="tour-scrim" />}

      <div
        className={`tour-card${spot ? '' : ' is-centered'}`}
        style={spot ? { top: cardTop } : undefined}
      >
        <div className="tour-card-head">
          <span className="tour-step-count mono">{i + 1} / {STEPS.length}</span>
          <button type="button" className="tour-skip" onClick={finish}>Skip<Icon name="x" size={13} /></button>
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden>
          {STEPS.map((_, n) => <span key={n} className={`tour-dot${n === i ? ' is-on' : ''}`} />)}
        </div>
        <div className="tour-actions">
          {i > 0
            ? <button type="button" className="btn ghost" onClick={back}>Back</button>
            : <span />}
          <button type="button" className="btn primary" onClick={next}>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
