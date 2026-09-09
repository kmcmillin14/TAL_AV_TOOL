// src/lib/romPricingValidation.ts — Zod-gates a vehicle's ROM sell-price inputs.
// Lives in src/lib/ (not src/calc/) because it imports the Zod schema at
// runtime — ARCHITECTURE.md §4 keeps src/calc/* free of Zod imports.
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { romInputsSchema, type RomInputs } from '@/src/lib/validations/pricingSchemas'

/** Validates `vehicle.romInputs` (+ the required `calc.priceRange`) against the
 *  5-field schema. Returns null — never throws — when absent/malformed; callers
 *  use this to exclude the vehicle from the ROM sell-price UI with a
 *  "pricing not configured" state rather than crashing the whole page. */
export function getValidRomInputs(vehicle: Vehicle): RomInputs | null {
  if (!vehicle.calc.priceRange) return null
  const parsed = romInputsSchema.safeParse(vehicle.romInputs)
  return parsed.success ? parsed.data : null
}
