'use client'

// Setup's payloads (stage strip, 2026-11-18): the loads Step 1 describes, confirmed in one click before the
// layout is drawn — racks size from them and only vehicles that carry them run. Editing stays in Step 1;
// confirming stores a fingerprint of the loads, so changing them there un-confirms them here.

import Link from 'next/link'
import type { StoredProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import { loadDims } from '@/src/lib/vehicleDisplay'

type Load = NonNullable<StoredProject['loads']>[number]

/** The loads as confirmed: what changes the simulation and the vehicles that qualify (type, size, weight). */
export const payloadsKey = (loads: Load[]) => JSON.stringify(loads.map(l => [l.id, l.unitType, l.lengthIn, l.widthIn, l.heightIn, l.weightLbs]))

export default function SetupCard({ projectId, loads, confirmed, unitSystem, onConfirm }: {
  projectId: string
  loads: Load[]
  confirmed: boolean
  unitSystem: UnitSystem
  onConfirm: () => void
}) {
  if (!loads.length) {
    return <p className="sim-card-note">No payloads in Step 1 yet. <Link href={`/projects/${projectId}/step1`}>Add them in Intake</Link> — racks size from them.</p>
  }
  return (
    <section className="sim-card" aria-label="Payloads">
      {loads.map(l => (
        <div key={l.id} className="sim-check-item">
          <span className="sim-dot is-placed" />
          <div className="sim-check-main"><div className="nm">{l.unitType || 'Load'}</div><div className="meta">{loadDims(l, unitSystem)}</div></div>
        </div>
      ))}
      {/* One action: confirm; once confirmed, changing them is done in Step 1. */}
      {confirmed
        ? <p className="sim-card-note">Confirmed · <Link href={`/projects/${projectId}/step1`}>Edit in Step 1</Link></p>
        : <button type="button" className="btn btn-sm primary" onClick={onConfirm}>Confirm payloads</button>}
    </section>
  )
}
