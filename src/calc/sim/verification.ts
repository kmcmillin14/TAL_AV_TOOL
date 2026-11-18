// Fleet size verification (owner, 2026-11-18): Sizing's fleet is one figure with one state — estimated
// by the static calc, then verified, suggested or not verified by the last simulation run. Pure: reads
// the stored run and the applied fleet, never runs the simulation.

import { engineFleetByType } from '../fleet'
import type { FleetSummary } from '../types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { appliedFleetStatus, simInputsKey, type SimInputsLike } from './runInputs'
import type { Verdict } from './types'

export type FleetCheckState = 'estimated' | 'verified' | 'suggested' | 'notVerified'

export interface FleetCheck {
  vehicleId: string
  /** The static (engine) count for the type. */
  staticN: number
  state: FleetCheckState
  /** The count the state refers to: the verified or suggested count, or the count that failed. */
  n: number
  /** A raised count is applied to pricing (and is current). */
  applied: boolean
  /** A run or an applied count exists but its inputs changed since. */
  stale: boolean
  /** The last run's verdict, when it explains the state (Not verified; a failed or too-short run below). */
  verdict?: Verdict
  /** The fleet the last run used, when it was not the count the state refers to. */
  ranAt?: number
  /** Suggested: one fewer was run and does not meet, so `n` is the smallest — Use N may apply it. */
  confirmed?: boolean
  /** An applied count the static calc has caught up with: raise-only pricing ignores it; it can be cleared. */
  dormant?: number
}

interface Stored {
  lastRun?: { key: string; types: Record<string, { fleet: number; verdict: Verdict; smallest?: boolean }> }
  appliedFleet?: Record<string, { fleet: number; key: string }>
}

/** One type's state. `key` is the current `simInputsKey`. A run at another count than the static one says
 *  only what it can: meeting with fewer verifies the static count; failing with fewer says nothing of it. */
export function fleetCheck(vehicleId: string, staticN: number, stored: Stored | undefined, key: string): FleetCheck {
  const applied = stored?.appliedFleet?.[vehicleId]
  // A raised count in pricing was verified when applied; it stays so while its inputs hold.
  const status = applied && appliedFleetStatus(applied, staticN, key)
  const base = { vehicleId, staticN, n: staticN, applied: false, stale: false, ...(status === 'unused' ? { dormant: applied!.fleet } : {}) }
  if (applied && status !== 'unused') {
    return status === 'current' ? { ...base, state: 'verified', n: applied.fleet, applied: true } : { ...base, state: 'estimated', n: applied.fleet, applied: true, stale: true }
  }
  const run = stored?.lastRun?.types[vehicleId]
  if (!run) return { ...base, state: 'estimated' }
  if (stored!.lastRun!.key !== key) return { ...base, state: 'estimated', stale: true }
  const failed = run.verdict === 'short' || run.verdict === 'gridlock'
  if (run.verdict === 'meets') {
    return run.fleet > staticN
      ? { ...base, state: 'suggested', n: run.fleet, confirmed: run.smallest === true }
      : { ...base, state: 'verified', ...(run.fleet < staticN ? { ranAt: run.fleet } : {}) }
  }
  if (failed && run.fleet >= staticN) return { ...base, state: 'notVerified', n: run.fleet, verdict: run.verdict }
  return { ...base, state: 'estimated', ranAt: run.fleet, verdict: run.verdict }
}

const WORST: FleetCheckState[] = ['notVerified', 'suggested', 'estimated', 'verified']

/** The headline state across types: the worst one (an empty fleet is Estimated). */
export function fleetCheckSummary(checks: FleetCheck[]): FleetCheckState {
  return WORST.find(s => checks.some(c => c.state === s)) ?? 'estimated'
}

export const FLEET_CHECK_LABEL: Record<FleetCheckState, string> = {
  estimated: 'Estimated',
  verified: 'Verified',
  suggested: 'Suggested',
  notVerified: 'Not verified',
}

/** Every type's check and the headline state for a project. The inputs hash is computed only when there
 *  is a stored run or applied count to compare against. Shared by Sizing, Simulation and the deck. */
export function projectFleetChecks(project: (SimInputsLike & { simSettings?: Stored }) | null, vehicleById: Map<string, Vehicle>, fleet: FleetSummary) {
  const ss = project?.simSettings
  const any = !!(ss?.lastRun || (ss?.appliedFleet && Object.keys(ss.appliedFleet).length))
  const key = project && any ? simInputsKey(project, vehicleById) : ''
  const staticBy = engineFleetByType(fleet)
  const checks = fleet.groups.map(g => fleetCheck(g.vehicleId, staticBy[g.vehicleId] ?? 0, ss, key))
  return { checks, state: fleetCheckSummary(checks), key }
}

/** Chargers to place (stage strip, 2026-11-18): the vehicles the static charging model has on a charger at
 *  once — Σ fleet × (1 − availability), rounded up — and at least one. */
export function suggestedChargers(fleet: Pick<FleetSummary, 'groups'>): number {
  const onCharge = fleet.groups.reduce((s, g) => s + g.fleetSold * (1 - (g.charging.availability ?? 1)), 0)
  return Math.max(1, Math.ceil(onCharge - 1e-9))
}
