// src/lib/validations/pricingSchemas.ts — Zod schemas for the ROM sell-price
// engine's content files and vehicle delta. Loaded/validated at read time so a
// malformed JSON edit fails loudly (named field) instead of silently mis-pricing.
import { z } from 'zod'

const tierPointTableSchema = z.object({
  _note: z.string().optional(),
  points: z.record(z.string(), z.number()),
  thresholds: z
    .object({ tier2: z.number(), tier3: z.number() })
    .refine(t => t.tier2 < t.tier3, { message: 'thresholds.tier2 must be < thresholds.tier3' }),
})

function strictlyIncreasingTierMap(label: string) {
  return z
    .object({ '1': z.number(), '2': z.number(), '3': z.number() })
    .refine(m => m['1'] < m['2'] && m['2'] < m['3'], {
      message: `${label} must be strictly increasing across tiers 1 < 2 < 3`,
    })
}

export const pricingAssumptionsSchema = z.object({
  schemaVersion: z.number().int().positive(),
  currency: z.string(),
  _placeholderWarning: z.string().optional(),
  integrationMultipliers: strictlyIncreasingTierMap('integrationMultipliers'),
  softwareMultipliers: strictlyIncreasingTierMap('softwareMultipliers'),
  integrationScoring: tierPointTableSchema,
  softwareScoring: tierPointTableSchema,
  romBand: z
    .object({ low: z.number(), high: z.number() })
    .refine(b => b.low < 0 && b.high > 0, {
      message: 'romBand.low must be < 0 and romBand.high must be > 0',
    }),
  _unknownInputPenaltyNote: z.string().optional(),
  /** How much each unanswered pricing input widens the HIGH side of the ROM
   *  band. Asymmetric by design — an unknown can only mean MORE complexity
   *  than the zero-points default already assumed, so the low side never
   *  moves. `maxHighPct` caps the widening so a blank project doesn't quote
   *  an absurd ceiling; it's an absolute high-side value, not an addition. */
  unknownInputPenalty: z
    .object({ highPctPerUnknown: z.number().min(0), maxHighPct: z.number().positive() })
    .refine(p => p.maxHighPct > 0, { message: 'unknownInputPenalty.maxHighPct must be > 0' }),
  rounding: z.number().positive(),
  cutsheetRepresentativeQty: z.array(z.number().int().positive()).min(1),
})
export type PricingAssumptions = z.infer<typeof pricingAssumptionsSchema>

export const addersConfigSchema = z.object({
  schemaVersion: z.number().int().positive(),
  _placeholderWarning: z.string().optional(),
  adders: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        amount: z.number().min(0),
      })
    )
    .refine(adders => new Set(adders.map(a => a.id)).size === adders.length, {
      message: 'adder ids must be unique — a duplicate id would be summed twice by aggregateFleetSellPrice\'s selection filter',
    }),
})
export type AddersConfig = z.infer<typeof addersConfigSchema>

/** Vehicle JSON delta for the sell-price ROM engine — all four fields required.
 *  A vehicle missing this block (or `calc.priceRange`) is excluded from the ROM
 *  UI with a "pricing not configured" state rather than crashing or silently
 *  pricing at 0 — see vehicleLibrary.loadVehicleLibrary.
 *  Commissioning and Integration are the same cost bucket (owner, 2026-09-09) —
 *  there is no separate `baseCommissioningPerUnit`; bring-up/install cost lives
 *  entirely in `baseIntegrationSellPrice`, scored by complexity tier like
 *  everything else Integration covers. Hardware is vehicle price × qty only. */
export const romInputsSchema = z.object({
  integrationFloor: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  softwareFloor: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  baseIntegrationSellPrice: z.number().min(0),
  baseSoftwareSellPrice: z.number().min(0),
})
export type RomInputs = z.infer<typeof romInputsSchema>
