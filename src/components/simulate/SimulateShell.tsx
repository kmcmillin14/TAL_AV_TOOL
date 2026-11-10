'use client'

// Simulate page frame (spec v2 §3, §5.1): an optional page opened from Sizing, not a numbered step.
// The layout editor (Milestone 4) and the run view (Milestone 5) fill the canvas; until the
// project has routes, a scale and a linked flow, Run stays disabled and no numbers are shown
// (acceptance 1).

import { useMemo } from 'react'
import Link from 'next/link'
import Icon from '@/src/design-system/components/Icon'
import { runBlocker, type RunBlocker } from '@/src/calc/sim/readiness'
import type { StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { useIsNarrow } from '@/src/lib/useIsNarrow'

/** What to do next, per blocker — the headline is also the disabled Run button's reason. */
const NEXT_STEP: Record<RunBlocker, { title: string; detail: string }> = {
  noRoutes: { title: 'Draw the routes to simulate', detail: 'Place the pick and drop points, then connect them with routes.' },
  unscaled: { title: "Set the drawing's scale", detail: 'Click two points of a known dimension and type the length between them.' },
  noFlows: { title: 'Create a flow', detail: 'Click a Pick point, then a Drop point, and give the flow a vehicle and moves per hour.' },
}

export default function SimulateShell({ project, vehicles }: { project: StoredProject; vehicles: Vehicle[] }) {
  const narrow = useIsNarrow()
  const { simLayout, flows } = project
  const blocker = useMemo(() => runBlocker({ layout: simLayout, flows, vehicles }), [simLayout, flows, vehicles])
  // The run view arrives with Milestone 5; until then Run never looks clickable without doing anything.
  const next = blocker ? NEXT_STEP[blocker] : { title: 'Ready to run', detail: 'The run view is in development.' }

  return (
    <>
      <div className="engine-head with-actions">
        <div className="eh-text">
          <span className="eh-eyebrow mono">Step 03 / 05</span>
          <h1 className="eh-title">Simulate</h1>
        </div>
        <div className="eh-actions">
          <Link href={`/projects/${project.id}/step3`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Sizing
          </Link>
          <button type="button" className="btn primary" disabled title={next.title} aria-describedby="sim-next">
            Run <Icon name="arrowR" size={13} />
          </button>
        </div>
      </div>

      <section className="sim-canvas" aria-label="Simulation layout">
        {narrow ? (
          <div className="empty-state" id="sim-next">
            <h3>Open on a desktop to edit the layout</h3>
          </div>
        ) : (
          <div className="empty-state" id="sim-next">
            <h3>{next.title}</h3>
            <p>{next.detail}</p>
          </div>
        )}
      </section>
    </>
  )
}
