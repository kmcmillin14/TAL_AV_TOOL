// Qualification-aware ordering for the Step 3 vehicle select. Pure. Uses the
// SHARED calc verdicts — never Step 2 internals (ARCHITECTURE §4). Ordering and
// labeling only: nothing here selects a vehicle (hard rule — engineer assigns).
import type { TrafficLightStatus } from '@/src/calc/types'
import type { Vehicle } from './vehicleLibrary'

const RANK: Record<TrafficLightStatus, number> = { GREEN: 0, YELLOW: 1, INCOMPLETE: 2, RED: 3 }

export function statusRank(s: TrafficLightStatus | undefined): number {
  return s === undefined ? 4 : RANK[s]
}

/** Stable sort by verdict band (GREEN → … → RED → unknown). */
export function sortByQualification(
  vehicles: Vehicle[],
  statusById: Map<string, TrafficLightStatus>,
): Vehicle[] {
  return [...vehicles].sort((a, b) => statusRank(statusById.get(a.id)) - statusRank(statusById.get(b.id)))
}
