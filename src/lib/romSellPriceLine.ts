// src/lib/romSellPriceLine.ts — resolves ONE engineer-assigned chassis into a
// priced ROM sell-price line (scoring + overrides + computeSellPriceRom), the
// project-wide list of them, and the fleet-wide total (adders + ROM band,
// computed once — see src/calc/fleetSellPrice.ts). Single source of truth for
// this pipeline — both the ROM Configuration step UI
// (RomFleetSellPrice.tsx) and the PPTX appendix (src/lib/pptx/romSellPrice.ts)
// call this instead of each re-deriving it, so a missing-romInputs vehicle
// behaves identically in both places (dropped, not scored with a floor
// fallback — "pricing not configured" is a per-line exclusion, not a partial
// result).
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetGroup, FleetSummary } from '@/src/calc/types'
import { getValidRomInputs } from './romPricingValidation'
import { complexityAnswersFromProject } from './romComplexityFromProject'
import { buildIntegrationTriggers, buildSoftwareTriggers, type ComplexityAnswers } from '@/src/calc/complexityInputs'
import { scoreTier, clampToFloor, type TierResult } from '@/src/calc/scoreTier'
import { computeSellPriceRom, type RomPricingResult } from '@/src/calc/sellPriceRom'
import { aggregateFleetSellPrice, type FleetSellPriceTotal } from '@/src/calc/fleetSellPrice'
import { PRICING_ASSUMPTIONS, ADDERS_CONFIG } from './pricingContent'

export type RomSellPriceOverride = NonNullable<StoredProject['romSellPriceOverrides']>[string]

export interface RomSellPriceLine {
  vehicle: Vehicle
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
  override: RomSellPriceOverride | undefined
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
    assumptions: PRICING_ASSUMPTIONS,
  })

  return {
    vehicle,
    vehicleId: group.vehicleId,
    vehicleName: vehicle.name,
    qty: group.fleetSold,
    integrationResult,
    softwareResult,
    pricing,
  }
}

export interface FleetComplexityBaseline {
  integration: TierResult
  software: TierResult
}

/** The fleet-wide complexity scores, BEFORE any vehicle's own floor or an
 *  engineer's per-vehicle override.
 *
 *  Both axes score purely from project-level answers plus the program's total
 *  fleet size (`buildIntegrationTriggers`/`buildSoftwareTriggers` — nothing
 *  vehicle-specific goes in), so this one result is the baseline every
 *  assigned vehicle starts from. A vehicle only diverges from it when its own
 *  `romInputs` floor raises it, or an engineer overrides that vehicle's tier.
 *  That's what makes a single fleet-level complexity summary honest for a
 *  mixed-chassis fleet instead of repeating the identical breakdown once per
 *  vehicle type. Floor is passed as 1 (no floor) so `flooredBy` is always
 *  null here — flooring is a per-vehicle concern, reported per line. */
export function resolveFleetComplexityBaseline(
  project: StoredProject,
  totalFleetSize: number
): FleetComplexityBaseline {
  const answers = complexityAnswersFromProject(project)
  return {
    integration: scoreTier(
      buildIntegrationTriggers(answers, totalFleetSize),
      PRICING_ASSUMPTIONS.integrationScoring,
      1,
      'vehicle integration floor'
    ),
    software: scoreTier(
      buildSoftwareTriggers(answers),
      PRICING_ASSUMPTIONS.softwareScoring,
      1,
      'vehicle software floor'
    ),
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

  const lines: RomSellPriceLine[] = []
  for (const g of fleet.groups) {
    if (g.fleetSold <= 0) continue
    const vehicle = vehicleById.get(g.vehicleId)
    if (!vehicle) continue
    const line = resolveRomSellPriceLine(vehicle, g, fleet.totalFleetSold, answers, overrides[g.vehicleId])
    if (line) lines.push(line)
  }
  return lines
}

/** The fleet-wide total across every resolved line: Hardware/Integration/
 *  Software summed, the project's selected adders added ONCE, and the ROM
 *  band applied on that fleet aggregate. Both the ROM Configuration UI and
 *  the PPTX appendix call this — never sum `line.pricing` fields directly. */
export function resolveFleetSellPriceTotal(project: StoredProject, lines: RomSellPriceLine[]): FleetSellPriceTotal {
  const selectedAdderIds = project.romSellPriceSelectedAdderIds ?? []
  const aggregatorLines = lines.map(l => ({
    vehicleId: l.vehicleId,
    pricing: l.pricing,
    qty: l.qty,
    // Fleet-manager platform key for the shared-integration rule (see
    // fleetSellPrice.ts) — vehicle.display.fleetSoftware, or a per-vehicle
    // fallback key when unset so an unconfigured vehicle never silently
    // groups with (and rides free on) a configured one.
    fleetManagerPlatform: l.vehicle.display.fleetSoftware ?? `unknown:${l.vehicleId}`,
    integrationTier: l.integrationResult.tier,
  }))
  return aggregateFleetSellPrice(aggregatorLines, selectedAdderIds, ADDERS_CONFIG, PRICING_ASSUMPTIONS)
}
