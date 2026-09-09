// src/lib/pricingContent.ts — loads + Zod-validates the ROM sell-price content
// files (global assumptions, adders menu) once at module load. A malformed
// edit to either JSON file fails loudly here, naming the offending field,
// instead of silently mis-pricing a ROM downstream.
import type { ZodType } from 'zod'
import rawAssumptions from '@/src/content/pricing/global-assumptions.json'
import rawAdders from '@/src/content/pricing/adders.json'
import { pricingAssumptionsSchema, addersConfigSchema } from '@/src/lib/validations/pricingSchemas'

function loadPricingContent<T>(raw: unknown, schema: ZodType<T>, filename: string): T {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `pricingContent: ${filename} failed validation: ${parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    )
  }
  return parsed.data
}

export const PRICING_ASSUMPTIONS = loadPricingContent(rawAssumptions, pricingAssumptionsSchema, 'global-assumptions.json')
export const ADDERS_CONFIG = loadPricingContent(rawAdders, addersConfigSchema, 'adders.json')
