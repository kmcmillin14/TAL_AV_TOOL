'use client'

// The fleet's verification state (owner, 2026-11-18) — Estimated, Verified, Suggested N or Not verified —
// shared by Sizing's total and Simulation's head. Reads the stored run only (`fleetCheck`).

import { useMemo } from 'react'
import { FLEET_CHECK_LABEL, fleetCheckSummary, projectFleetChecks, type FleetCheck } from '@/src/calc/sim/verification'
import type { FleetSummary } from '@/src/calc/types'
import Icon from '@/src/design-system/components/Icon'
import type { StoredProject } from '@/src/lib/storage'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

/** Each type's check and the headline state (`projectFleetChecks`), memoised. */
export function useFleetChecks(project: StoredProject | null, vehicleById: Map<string, Vehicle>, fleet: FleetSummary) {
  return useMemo(() => projectFleetChecks(project, vehicleById, fleet), [project, vehicleById, fleet])
}

const fleetCheckWord = (c: Pick<FleetCheck, 'state' | 'n'>) => (c.state === 'suggested' ? `Suggested ${c.n}` : FLEET_CHECK_LABEL[c.state])

/** The state of a fleet (the worst of its types); with `href`, a link to where it is explained. */
export function FleetCheckBadge({ checks, href }: { checks: FleetCheck[]; href?: string }) {
  const state = fleetCheckSummary(checks)
  const one = checks.length === 1 ? checks[0] : null
  const fail = checks.find(c => c.state === 'notVerified')
  const tone = state === 'notVerified' && fail?.verdict === 'gridlock' ? 'bad' : state
  const body = <>{state === 'verified' && <Icon name="check" size={12} />}{one ? fleetCheckWord(one) : FLEET_CHECK_LABEL[state]}</>
  return href
    ? <a href={href} className={`fv-badge ${tone}`} title="Fleet size verification">{body}</a>
    : <span className={`fv-badge ${tone}`}>{body}</span>
}
