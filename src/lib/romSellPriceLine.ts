// src/lib/romSellPriceLine.ts — resolves ONE engineer-assigned chassis into a
// priced ROM sell-price line (scoring + overrides + computeSellPriceRom), and
// the project-wide list of them. Single source of truth for this pipeline —
// both the Step 4 UI (RomSellPriceCell.tsx) and the PPTX appendix
// (src/lib/pptx/romSellPrice.ts) call this instead of each re-deriving it,
// so a missing-romInputs vehicle behaves identically in both places (dropped,
// not scored with a floor fallback — "pricing not configured" is a per-line
// exclusion, not a partial result).
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetGroup, FleetSummary } from '@/src/calc/types'
import { getValidRomInputs } from './romPricingValidation'
import { complexityAnswersFromProject } from './romComplexityFromProject'
import { buildIntegrationTriggers, buildSoftwareTriggers, type ComplexityAnswers } from '@/src/calc/complexityInputs'
import { scoreTier, clampToFloor, type TierResult } from '@/src/calc/scoreTier'
import { computeSellPriceRom, type RomPricingResult } from '@/src/calc/sellPriceRom'
import { PRICING_ASSUMPTIONS, ADDERS_CONFIG } from './pricingContent'

export type RomSellPriceOverride = NonNullable<StoredProject['romSellPriceOverrides']>[string]

export interface RomSellPriceLine {
  vehicleId: string
  vehicleName: string
  qty: number
  integrationResult: TierResult
  softwareResult: TierResult
  pricing: RomPricingResult
}

/** Applies an engineer's tier override on top of the scored result, still
 *  clamped to the vehicle's floor — a floor is a minimum the engineer's
 *  judgment can raise above but never override below. */
function withOverride(scored: TierResult, overrideTier: 1 | 2 | 3 | undefined, floor: 1 | 2 | 3, floorLabel: string): TierResult {
  if (overrideTier === undefined) return scored
  const { tier, flooredBy } = clampToFloor(overrideTier, floor, floorLabel)
  return { ...scored, tier, flooredBy }
}

/** Resolves one vehicle group into a priced line, or null when the vehicle has
 *  no valid `romInputs`/`calc.priceRange` ("pricing not configured").
 *  `totalFleetSize` is the whole program's fleet size (FleetSummary.totalFleetSold)
 *  — the fleet-size integration-complexity band reflects total deployment
 *  scale, not this one chassis's own qty. */
export function resolveRomSellPriceLine(
  vehicle: Vehicle,
  group: FleetGroup,
  totalFleetSize: number,
  answers: ComplexityAnswers,
  override: RomSellPriceOverride | undefined,
  selectedAdderIds: string[]
): RomSellPriceLine | null {
  const romInputs = getValidRomInputs(vehicle)
  if (!romInputs) return null

  const integrationScored = scoreTier(
    buildIntegrationTriggers(answers, totalFleetSize),
    PRICING_ASSUMPTIONS.integrationScoring,
    romInputs.integrationFloor,
    'vehicle integration floor'
  )
  const softwareScored = scoreTier(
    buildSoftwareTriggers(answers),
    PRICING_ASSUMPTIONS.softwareScoring,
    romInputs.softwareFloor,
    'vehicle software floor'
  )
  const integrationResult = withOverride(integrationScored, override?.integrationTierOverride, romInputs.integrationFloor, 'vehicle integration floor')
  const softwareResult = withOverride(softwareScored, override?.softwareTierOverride, romInputs.softwareFloor, 'vehicle software floor')

  const pricing = computeSellPriceRom({
    vehicle,
    romInputs,
    qty: group.fleetSold,
    integrationResult,
    softwareResult,
    selectedAdderIds,
    assumptions: PRICING_ASSUMPTIONS,
    adders: ADDERS_CONFIG,
  })

  return {
    vehicleId: group.vehicleId,
    vehicleName: vehicle.name,
    qty: group.fleetSold,
    integrationResult,
    softwareResult,
    pricing,
  }
}

/** Resolves every engineer-assigned chassis with fleetSold > 0 into a priced
 *  line, silently omitting any with no configured pricing. */
export function resolveAllRomSellPriceLines(
  project: StoredProject,
  fleet: FleetSummary,
  vehicleById: Map<string, Vehicle>
): RomSellPriceLine[] {
  const answers = complexityAnswersFromProject(project)
  const overrides = project.romSellPriceOverrides ?? {}
  const selectedAdderIds = project.romSellPriceSelectedAdderIds ?? []

  const lines: RomSellPriceLine[] = []
  for (const g of fleet.groups) {
    if (g.fleetSold <= 0) continue
    const vehicle = vehicleById.get(g.vehicleId)
    if (!vehicle) continue
    const line = resolveRomSellPriceLine(vehicle, g, fleet.totalFleetSold, answers, overrides[g.vehicleId], selectedAdderIds)
    if (line) lines.push(line)
  }
  return lines
}
