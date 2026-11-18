'use client'

// Fleet size verification on Sizing (owner, 2026-11-18): the fleet is one figure with one state —
// Estimated, Verified, Suggested N or Not verified (`fleetCheck`). The badge rides on the total; the
// Verification section lists each type with its action. Reads the stored run only — Sizing never runs
// the simulation.

import Link from 'next/link'
import type { FleetCheck, FleetCheckState } from '@/src/calc/sim/verification'
import { fleetCheckWord } from '@/src/components/FleetCheckBadge'
import Icon from '@/src/design-system/components/Icon'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import { patchSimSettings, type StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const DETAIL: Record<FleetCheckState, (c: FleetCheck) => string> = {
  estimated: c => (c.stale ? 'Layout changed since the last run — verify again' : 'Static calculation — not yet checked on a layout'),
  verified: c => (c.applied ? `Simulation met all three checks at ${c.n}; in pricing` : 'Simulation met all three checks at this count'),
  suggested: c => `Simulation met all three checks only at ${c.n}`,
  notVerified: c => (c.verdict === 'gridlock' ? `Gridlock at ${c.n} — fix the layout, then verify again` : `Fell short at ${c.n} — try more vehicles`),
}

interface SectionProps {
  project: StoredProject
  vehicleById: Map<string, Vehicle>
  checks: FleetCheck[]
  inputsKey: string
}

/** Sizing's 04 Verification: one row per type, and the way to the verification page. */
export function VerificationSection({ project, vehicleById, checks, inputsKey }: SectionProps) {
  const applied = project.simSettings?.appliedFleet ?? {}
  const use = (c: FleetCheck) => patchSimSettings(project.id, { appliedFleet: { ...applied, [c.vehicleId]: { fleet: c.n, key: inputsKey } } })
  const back = (c: FleetCheck) => patchSimSettings(project.id, { appliedFleet: Object.fromEntries(Object.entries(applied).filter(([v]) => v !== c.vehicleId)) })
  const allEstimated = checks.every(c => c.state === 'estimated' && !c.stale)

  return (
    <div className="fv">
      {checks.length > 0 && (
        <ul className="fv-rows">
          {checks.map(c => {
            const tone = c.state === 'notVerified' && c.verdict === 'gridlock' ? 'bad' : c.state
            return (
              <li key={c.vehicleId} className="fv-row">
                <span className="fv-veh">
                  <VehicleDot vehicle={vehicleById.get(c.vehicleId)} size="sm" />
                  <span>{vehicleById.get(c.vehicleId)?.name ?? c.vehicleId}</span>
                </span>
                <span className="fv-count">
                  <span className="mono">{c.staticN}</span>
                  {c.n !== c.staticN && <><span aria-hidden="true">→</span><span className="mono">{c.n}</span></>}
                </span>
                <span className={`fv-badge ${tone}`}>{c.state === 'verified' && <Icon name="check" size={12} />}{fleetCheckWord(c)}</span>
                <span className="fv-detail">{DETAIL[c.state](c)}</span>
                <span className="fv-act">
                  {c.state === 'suggested' && <button type="button" className="btn btn-sm primary" onClick={() => use(c)}>Use {c.n}</button>}
                  {c.applied && <button type="button" className="link-btn" onClick={() => back(c)}>Back to static ({c.staticN})</button>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="fv-foot">
        <p className="fv-lead">
          {allEstimated
            ? 'Check this fleet on the site layout: the simulation runs the stations’ calls through time and confirms the count, or suggests a new one.'
            : 'Suggestions only raise the fleet. Pricing changes only when you press Use.'}
        </p>
        <Link href={`/projects/${project.id}/step4`} className="btn ghost">
          Verify fleet size <Icon name="arrowR" size={13} />
        </Link>
      </div>
    </div>
  )
}
