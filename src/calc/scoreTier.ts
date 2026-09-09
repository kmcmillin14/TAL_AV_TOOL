// src/calc/scoreTier.ts — generic tier scorer shared by Integration and Software
// complexity scoring. One mechanism (sum points → threshold → tier, then apply a
// vehicle floor), two instances (integrationScoring / softwareScoring point tables).
// PURE. No React, no fetch, no localStorage, no fs.

export interface TierPointTable {
  points: Record<string, number>
  thresholds: { tier2: number; tier3: number }
}

export interface TierResult {
  score: number
  tier: 1 | 2 | 3
  reasons: Array<{ label: string; points: number }>
  notTriggered: string[]
  flooredBy: string | null
}

/**
 * Sums points for every triggered key against `table.points`, derives a tier from
 * `table.thresholds`, then raises the tier to `floor` if the vehicle's inherent
 * minimum is higher than what was scored. Callers pre-resolve banded/counted
 * inputs into single boolean keys (see src/calc/complexityInputs.ts) — a key
 * present and `true` counts once; `false`/absent doesn't count.
 */
export function scoreTier(
  triggered: Record<string, boolean>,
  table: TierPointTable,
  floor: 1 | 2 | 3,
  floorLabel: string
): TierResult {
  const reasons: Array<{ label: string; points: number }> = []
  const notTriggered: string[] = []
  let score = 0

  for (const key of Object.keys(table.points)) {
    if (triggered[key]) {
      const points = table.points[key]
      score += points
      reasons.push({ label: key, points })
    } else {
      notTriggered.push(key)
    }
  }

  const scoredTier: 1 | 2 | 3 =
    score >= table.thresholds.tier3 ? 3 : score >= table.thresholds.tier2 ? 2 : 1

  const tier = floor > scoredTier ? floor : scoredTier
  const flooredBy = floor > scoredTier ? floorLabel : null

  return { score, tier, reasons, notTriggered, flooredBy }
}

/** Raises `tier` to at least `floor` — a floor is a minimum, never a
 *  suggestion, so this applies even to an engineer's manual override.
 *  `flooredBy` is set/cleared to reflect whether the floor bound the result. */
export function clampToFloor(tier: 1 | 2 | 3, floor: 1 | 2 | 3, floorLabel: string): { tier: 1 | 2 | 3; flooredBy: string | null } {
  return floor > tier ? { tier: floor, flooredBy: floorLabel } : { tier, flooredBy: null }
}
