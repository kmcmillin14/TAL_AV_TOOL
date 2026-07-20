'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import Icon from '@/src/design-system/components/Icon'
import { deleteProject, findOrCreateEntryProject } from '@/src/lib/storage'

// ─── Event API ────────────────────────────────────────────────────────────────

const SEEN_KEY = 'tal:tourSeen'
const GUIDE_STATE_KEY = 'tal:guideState'

/** Fire `window.dispatchEvent(new Event(TOUR_EVENT))` to (re)open the intro tour. */
export const TOUR_EVENT = 'tal:start-tour'

/**
 * Fire `window.dispatchEvent(new CustomEvent(GUIDE_EVENT, { detail: { guideId } }))` to
 * start any registered guide by id.
 */
export const GUIDE_EVENT = 'tal:start-guide'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuideStep {
  /**
   * Pathname SUFFIX the step lives on, e.g. '/step1' — relative to the current project
   * (e.g. /projects/[id]/step1). When present and the current URL doesn't end with this
   * suffix, the engine persists guide state to sessionStorage and navigates there.
   * Omit for steps that live on every page (e.g. the header nav).
   */
  route?: string
  /**
   * CSS selector for the element to highlight with `.tour-highlight`.
   * null = no highlight (card positioned bottom-right, no target element).
   */
  target: string | null
  title: string
  body: string
}

export interface Guide {
  id: string
  steps: GuideStep[]
  /** Label for the primary button on the last step. Defaults to 'Get started'. */
  finishLabel?: string
  /**
   * Action fired when the user clicks the primary button on the last step.
   * 'discardSampleAndStart' — deletes the current project (the sample), creates/finds
   * a fresh entry project, and navigates to its /step0.
   */
  finishAction?: 'discardSampleAndStart'
}

interface GuideState {
  guideId: string
  step: number
  /** Project id at the time the guide started — used by discardSampleAndStart. */
  projectId?: string
}

// ─── Guide registry ───────────────────────────────────────────────────────────

// Anchored to the always-present header step bar. The intro spotlights the whole
// nav; each following step highlights one tab. Framed by the Cut → Connect → Add
// engineering discipline the tool is built around.
const INTRO_GUIDE: Guide = {
  id: 'intro',
  steps: [
    {
      target: '.hero-nav .step-dots',
      title: 'Four steps, one flow',
      body: 'This tool sizes an AGV/AMR fleet in four steps. The engineering discipline behind it: Cut waste → Connect the moves → Add the economics. Here is where each step lives.',
    },
    {
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
  ],
}

/** Sample DC walkthrough — cross-page, Steps 1→4. Starts automatically when the
 *  Company A sample project is loaded from Step 0. Explains WHY each decision was made. */
const SAMPLE_RFQ_GUIDE: Guide = {
  id: 'sample-rfq',
  finishLabel: 'Start your application',
  finishAction: 'discardSampleAndStart',
  steps: [
    {
      route: '/step1',
      target: null,
      title: 'A worked DC example',
      body: 'This sample is Company A\'s distribution center, already filled in. Walk with me — each stop explains WHY it was answered this way.',
    },
    {
      route: '/step1',
      target: '#section-01 .form-section-header',
      title: '1,800 lb GMA pallets',
      body: '48×40 GMA pallets at 1,800 lbs. Weight + dimensions drive vehicle qualification — get these right first.',
    },
    {
      route: '/step1',
      target: '#section-02 .form-section-header',
      title: 'Forklift to 12 ft',
      body: 'Pallets go into racking at 12 ft, so the transfer type is forklift with a 12 ft height — inside the CB18\'s 14.7 ft reach; this is what disqualifies non-lifting vehicles.',
    },
    {
      route: '/step1',
      target: '#section-05 .form-section-header',
      title: '2 shifts, Mon–Fri',
      body: '16 staffed hours leaves 8 overnight — batteries recharge for free, so charging adds zero robots here.',
    },
    {
      route: '/step2',
      target: '.page-header',
      title: 'Who qualifies, and why',
      body: 'Green passes every hard gate: CB18 lifts 1,800 lbs to 12 ft. Click any card\'s details to see the exact gate math.',
    },
    {
      route: '/step3',
      target: '#engine-raw .form-section-header',
      title: 'The DC moves, as flows',
      body: 'Six flows in three zones: CB18 does the rack work, the M10 pin-tugger runs the long replenishment milk-runs, the 8HBC40A shuttles finished pallets outbound.',
    },
    {
      route: '/step3',
      target: '#engine-charging .form-section-header',
      title: 'Charging: +0 — here\'s why',
      body: 'Runtime covers a shift and nights are free charge time. On a 24/7 site this line is where robots get added.',
    },
    {
      route: '/step4',
      // The Financials hero card — a single bounded surface; ringing the whole
      // multi-card kpiband drew broken fragments across the card gaps.
      target: '.rom2-hero',
      title: 'The ROM you\'d send back',
      body: 'Fleet, CAPEX range, payback. Adjust drivers for what-ifs, then Export builds the customer deck.',
    },
    {
      route: '/step4',
      // Desktop drivers render as aside.rom2-rail; the <summary> only exists in
      // the collapsed (narrow) layout and is hidden on desktop — no ring showed.
      target: '.rom2-rail-head',
      title: 'Drivers & scenario panel',
      body: 'Run what-ifs here — throughput boost, labor rate, shifts. Every KPI recomputes live; toggle Baseline / Scenario to compare.',
    },
    {
      route: '/step4',
      target: '#rom-fleet-math .rom2-cell-head',
      title: 'Fleet & flow math',
      body: 'The full sizing math — every stage from cycle time to the binding constraint, with this project\'s numbers substituted in.',
    },
    {
      route: '/step4',
      target: '#rom-assumptions .rom2-cell-head',
      title: 'Assumptions',
      body: 'Every assumption is listed and defensible — DoD, availability, headroom. This is what you stand behind in the customer meeting.',
    },
    {
      route: '/step4',
      target: '.rom-card-export',
      title: 'Export',
      body: 'Done? Export builds the customer deck (PPTX), the editable Excel model, and the PDF.',
    },
    {
      route: '/step4',
      target: null,
      title: 'Your turn',
      body: 'That\'s the whole flow — RFQ in, defensible ROM out. Ready? This wipes the sample and starts your own application.',
    },
  ],
}

/**
 * Guide registry. Add new guides here to make them startable via GUIDE_EVENT.
 */
export const GUIDES: Record<string, Guide> = {
  intro: INTRO_GUIDE,
  'sample-rfq': SAMPLE_RFQ_GUIDE,
}

// ─── Highlight helpers ────────────────────────────────────────────────────────

const HIGHLIGHT_CLASS = 'tour-highlight'

/** Remove the highlight ring from any currently-highlighted elements. */
function clearHighlight(): void {
  document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`).forEach(el => {
    el.classList.remove(HIGHLIGHT_CLASS)
  })
}

/** Apply the highlight ring to the target selector; returns whether it found a target. */
function applyHighlight(selector: string | null): boolean {
  clearHighlight()
  if (!selector) return false
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return false
  el.classList.add(HIGHLIGHT_CLASS)
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return true
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuidedTour() {
  const router = useRouter()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState<Guide>(INTRO_GUIDE)
  const [i, setI] = useState(0)
  // The project id at the time the sample guide was triggered — used for discardSampleAndStart.
  const [sampleProjectId, setSampleProjectId] = useState<string | null>(null)

  const steps = guide.steps
  const step = steps[i]
  const last = i === steps.length - 1

  // ── Highlight management: apply class on step change, clean up on close/unmount ──

  useEffect(() => {
    if (!open) {
      clearHighlight()
      return
    }
    applyHighlight(step?.target ?? null)
    return () => clearHighlight()
  }, [open, step?.target])

  // ── First-run auto-open + TOUR_EVENT + GUIDE_EVENT ────────────────────────

  useEffect(() => {
    const startGuide = (g: Guide, stepIndex = 0, projectId?: string) => {
      setGuide(g)
      setI(stepIndex)
      setSampleProjectId(projectId ?? null)
      setOpen(true)
    }

    const handleTourEvent = () => startGuide(INTRO_GUIDE, 0)

    const handleGuideEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ guideId: string; projectId?: string }>).detail
      const guideId = detail?.guideId
      const g = guideId ? GUIDES[guideId] : undefined
      if (g) startGuide(g, 0, detail?.projectId)
    }

    // Resume a cross-page guide if sessionStorage has a pending state.
    try {
      const raw = sessionStorage.getItem(GUIDE_STATE_KEY)
      if (raw) {
        const state: GuideState = JSON.parse(raw)
        const g = GUIDES[state.guideId]
        if (g && state.step < g.steps.length) {
          sessionStorage.removeItem(GUIDE_STATE_KEY)
          // Small delay lets the new page paint before we highlight.
          setTimeout(() => startGuide(g, state.step, state.projectId), 300)
        } else {
          sessionStorage.removeItem(GUIDE_STATE_KEY)
        }
      }
    } catch { /* ignore */ }

    // Auto-open intro on first visit (no sessionStorage resume already started it).
    let seen = true
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch { /* private mode */ }
    if (!seen) {
      const t = setTimeout(() => startGuide(INTRO_GUIDE, 0), 500)
      window.addEventListener(TOUR_EVENT, handleTourEvent)
      window.addEventListener(GUIDE_EVENT, handleGuideEvent)
      return () => {
        clearTimeout(t)
        window.removeEventListener(TOUR_EVENT, handleTourEvent)
        window.removeEventListener(GUIDE_EVENT, handleGuideEvent)
      }
    }

    window.addEventListener(TOUR_EVENT, handleTourEvent)
    window.addEventListener(GUIDE_EVENT, handleGuideEvent)
    return () => {
      window.removeEventListener(TOUR_EVENT, handleTourEvent)
      window.removeEventListener(GUIDE_EVENT, handleGuideEvent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Navigation helpers ─────────────────────────────────────────────────────

  // ANY exit from a discardSampleAndStart guide — finish, Skip, or Escape —
  // wipes the sample project and returns to a fresh entry project. The sample
  // is ephemeral by design: it must never linger in storage (owner direction
  // 2026-07-19).
  const finish = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    clearHighlight()
    setOpen(false)

    if (guide.finishAction === 'discardSampleAndStart' && sampleProjectId) {
      deleteProject(sampleProjectId)
      const entry = findOrCreateEntryProject()
      router.push(`/projects/${entry.id}/step0`)
    }
  }, [guide.finishAction, sampleProjectId, router])

  // ── Escape key (no scroll lock — walkthrough must let the user scroll) ────
  // Lives BELOW finish() — its deps reference the callback (TDZ otherwise).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, finish])

  const back = useCallback(() => {
    setI(n => Math.max(0, n - 1))
  }, [])

  const next = useCallback(() => {
    if (last) {
      finish()
      return
    }
    const nextIndex = i + 1
    const nextStep = steps[nextIndex]

    // Cross-page navigation: if the next step lives on a different route, persist
    // guide state and navigate. The engine resumes on mount of the target page.
    if (nextStep.route && !pathname?.endsWith(nextStep.route)) {
      // Derive the /projects/[id] prefix from the current pathname.
      // Current pathname example: /projects/abc123/step1
      // We need: /projects/abc123 + nextStep.route
      const projectBase = pathname?.replace(/\/step\d+$/, '').replace(/\/step0$/, '') ?? ''
      try {
        const state: GuideState = { guideId: guide.id, step: nextIndex, projectId: sampleProjectId ?? undefined }
        sessionStorage.setItem(GUIDE_STATE_KEY, JSON.stringify(state))
      } catch { /* ignore */ }
      clearHighlight()
      setOpen(false)
      router.push(projectBase + nextStep.route)
      return
    }

    setI(nextIndex)
  }, [last, i, steps, pathname, guide.id, guide.finishAction, sampleProjectId, router, finish])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!open || typeof document === 'undefined') return null

  const primaryLabel = last
    ? (guide.finishLabel ?? 'Get started')
    : 'Next'

  return createPortal(
    <div className="tour-root">
      {/* No scrim — page remains fully visible and interactive. The .tour-highlight
          class on the target element provides the active-section treatment. */}

      <div className="tour-card" role="dialog" aria-label="Guided tour">
        <div className="tour-card-head">
          <span className="tour-step-count mono">{i + 1} / {steps.length}</span>
          <button type="button" className="tour-skip" onClick={finish}>Skip<Icon name="x" size={13} /></button>
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden>
          {steps.map((_, n) => <span key={n} className={`tour-dot${n === i ? ' is-on' : ''}`} />)}
        </div>
        <div className="tour-actions">
          {i > 0
            ? <button type="button" className="btn ghost" onClick={back}>Back</button>
            : <span />}
          <button type="button" className="btn primary" onClick={next}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
