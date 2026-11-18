'use client'

// Setup's payloads (stage strip, 2026-11-18): the loads Step 1 describes, confirmed in one click before the
// layout is drawn — racks size from them and only vehicles that carry them run. Editing stays in Step 1.

import Link from 'next/link'
import type { UnitSystem } from '@/src/lib/utils/units'
import { loadLabel } from '../vehicles/VehicleBar'

interface Load { id: string; unitType?: string; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null; weightLbs?: number | null }

export default function SetupCard({ projectId, loads, confirmed, unitSystem, onConfirm }: {
  projectId: string
  loads: Load[]
  confirmed: boolean
  unitSystem: UnitSystem
  onConfirm: (confirmed: boolean) => void
}) {
  return (
    <section className="sim-card" aria-label="Payloads">
      {loads.length === 0 ? (
        <p className="sim-card-note">No payloads in Step 1 yet. <Link href={`/projects/${projectId}/step1`}>Add them in Intake</Link> — racks size from them.</p>
      ) : (
        <>
          <ul className="sim-setup-loads">
            {loads.map(l => <li key={l.id}><span className="sim-dot is-placed" />{loadLabel(l, unitSystem)}</li>)}
          </ul>
          <div className="sim-setup-act">
            {confirmed
              ? <><span className="sim-tag">✓ Payloads confirmed</span><button type="button" className="link-btn" onClick={() => onConfirm(false)}>Undo</button></>
              : <button type="button" className="btn btn-sm primary" onClick={() => onConfirm(true)}>Confirm payloads</button>}
            <Link href={`/projects/${projectId}/step1`} className="link-btn">Edit in Step 1</Link>
          </div>
        </>
      )}
    </section>
  )
}
