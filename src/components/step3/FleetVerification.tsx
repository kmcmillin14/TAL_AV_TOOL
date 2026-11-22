'use client'

// Fleet size verification on Sizing (owner, 2026-11-18): the fleet is one figure with one state —
// Estimated, Verified, Suggested N or Not verified (`fleetCheck`). The badge rides on the total; the
// Verification section lists each type with its action. Reads the stored run only — Sizing never runs
// the simulation.

import Link from 'next/link'
import { withApplied, withoutApplied } from '@/src/calc/sim/runInputs'
import type { FleetCheck, FleetCheckState } from '@/src/calc/sim/verification'
import { FleetCheckBadge } from '@/src/components/FleetCheckBadge'
import Icon from '@/src/design-system/components/Icon'
import { VehicleDot } from '@/src/components/step3/VehicleSelect'
import { patchSimSettings, type StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

const DETAIL: Record<FleetCheckState, (c: FleetCheck) => string> = {
  estimated: c => c.stale ? 'Layout changed since the last run — verify again'
    : c.verdict === 'warming' ? 'The last run was too short to judge — run a full shift'
    : c.ranAt != null ? `The last run used ${c.ranAt} and fell short — ${c.staticN} has not been run`
    : 'Static calculation — not yet checked on a layout',
  verified: c => c.tight ? `Simulation passed all three checks at ${c.n}, tight — one is near its limit`
    : c.applied ? `Simulation met all three checks at ${c.n}; in pricing`
    : c.ranAt != null ? `Simulation met all three checks with ${c.ranAt}, fewer than this count`
    : 'Simulation met all three checks at this count',
  suggested: c => c.confirmed ? `Simulation met all three checks only at ${c.n}`
    : `Simulation met all three checks at ${c.n} — open Simulation to confirm one fewer does not`,
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
  const use = (c: FleetCheck) => patchSimSettings(project.id, { appliedFleet: withApplied(applied, c.vehicleId, c.n, inputsKey) })
  const back = (c: FleetCheck) => patchSimSettings(project.id, { appliedFleet: withoutApplied(applied, c.vehicleId) })
  const allEstimated = checks.every(c => c.state === 'estimated' && !c.stale)

  return (
    <div className="fv">
      {checks.length > 0 && (
        <ul className="fv-rows">
          {checks.map(c => (
              <li key={c.vehicleId} className="fv-row">
                <span className="fv-veh">
                  <VehicleDot vehicle={vehicleById.get(c.vehicleId)} size="sm" />
                  <span>{vehicleById.get(c.vehicleId)?.name ?? c.vehicleId}</span>
                </span>
                <span className="fv-count">
                  <span className="mono">{c.staticN}</span>
                  {c.n !== c.staticN && <><span aria-hidden="true">→</span><span className="mono">{c.n}</span></>}
                </span>
                <FleetCheckBadge checks={[c]} />
                <span className="fv-detail">{DETAIL[c.state](c)}</span>
                <span className="fv-act">
                  {c.state === 'suggested' && c.confirmed && <button type="button" className="btn btn-sm primary" onClick={() => use(c)}>Use {c.n}</button>}
                  {c.applied && <button type="button" className="link-btn" onClick={() => back(c)}>Back to static ({c.staticN})</button>}
                  {c.dormant != null && (
                    <button type="button" className="link-btn" title={`Sizing now sizes ${c.staticN}, so the applied ${c.dormant} is not used`} onClick={() => back(c)}>Clear applied {c.dormant}</button>
                  )}
                </span>
              </li>
          ))}
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
