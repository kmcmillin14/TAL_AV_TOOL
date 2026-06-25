// Canonical enums shared between Step 1 form, calc engine, and vehicle JSONs.
// Single source of truth — never re-declare these arrays inline.
import type { LiftTypeNeeded } from '@/src/calc/types'

export const TRANSFER_METHODS = [
  'Lift',
  'Pin',
  'Conveyor',
  'Custom',
  'Powered Conveyor Cart',
] as const

/** Step 1 "Lift type" options — the vertical-handling need, which drives the lift
 *  gate (forklift / lift table / floor-to-floor). Value ↔ calc `LiftTypeNeeded`. */
export const LIFT_TYPE_OPTIONS: ReadonlyArray<{ value: LiftTypeNeeded; label: string }> = [
  { value: 'to_height', label: 'Lift to height (forklift)' },
  { value: 'matched_height', label: 'Same-height transfer (lift table)' },
  { value: 'floor', label: 'Floor-to-floor (pallet truck)' },
]

export const TYPICAL_UNIT_TYPES = [
  'Standard Pallet',
  'Tote',
  'Cart',
  'Roll',
  'IBC',
  'Coil',
  'Rack',
  'Other',
] as const

export const CERTIFICATIONS = [
  'ISO 3691-4',
  'ANSI B56.5',
  'RIA R15.08',
  'Cleanroom',
  'Food Grade',
  'ATEX',
  'IECEx',
  'VDA 5050',
] as const

export type TransferMethod = typeof TRANSFER_METHODS[number]
export type TypicalUnitType = typeof TYPICAL_UNIT_TYPES[number]
