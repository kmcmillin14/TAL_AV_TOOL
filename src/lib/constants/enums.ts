// Canonical enums shared between Step 1 form, calc engine, and vehicle JSONs.
// Single source of truth — never re-declare these arrays inline.

export const TRANSFER_METHODS = [
  'Fork',
  'Tow / Tugger',
  'Conveyor Interface',
  'Lift Platform',
] as const

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

export type TransferMethod = typeof TRANSFER_METHODS[number]
export type TypicalUnitType = typeof TYPICAL_UNIT_TYPES[number]
