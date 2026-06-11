// Canonical enums shared between Step 1 form, calc engine, and vehicle JSONs.
// Single source of truth — never re-declare these arrays inline.

export const TRANSFER_METHODS = [
  'Lift',
  'Pin',
  'Conveyor',
  'Custom',
  'Powered Conveyor Cart',
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
