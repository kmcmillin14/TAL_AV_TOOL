// Canonical enums shared between Step 1 form, calc engine, and vehicle JSONs.
// Single source of truth — never re-declare these arrays inline.
import type { TransferType } from '@/src/calc/types'

export const TRANSFER_METHODS = [
  'Lift',
  'Pin',
  'Conveyor',
  'Custom',
  'Powered Conveyor Cart',
] as const

/** Step 1 "Transfer type" options — one field named by what the vehicle is. Drives
 *  the transfer + lift gates (see `TRANSFER_TYPE_SPEC` in calc/gates.ts). Forklift and
 *  Lift table also take a transfer height. */
export const TRANSFER_TYPE_OPTIONS: ReadonlyArray<{ value: TransferType; label: string; needsHeight?: boolean }> = [
  { value: 'forklift', label: 'Forklift — lifts to height', needsHeight: true },
  { value: 'lift_table', label: 'Lift table — same-height transfer', needsHeight: true },
  { value: 'pallet_truck', label: 'Pallet truck — floor-to-floor' },
  { value: 'conveyor', label: 'Conveyor' },
  { value: 'tow_cart', label: 'Tow cart (tugger)' },
  { value: 'custom', label: 'Custom' },
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

/** Customer-questionnaire specialty applications of interest. */
export const SPECIALTY_APPLICATIONS = [
  'Trailer loading',
  'Trailer unloading',
  'High reach / racking',
  'Floor-to-floor',
  'Long-haul transport',
  'Conveyor interface',
  'Outdoor / yard',
  'Other',
] as const

/** Why the customer is automating — drives the questionnaire's driver chips. */
export const PROJECT_DRIVERS = [
  'Labor availability',
  'Labor cost',
  'Safety',
  'Throughput / capacity',
  'Quality / consistency',
  'Ergonomics',
  '24/7 operation',
  'Other',
] as const

export type TransferMethod = typeof TRANSFER_METHODS[number]
export type TypicalUnitType = typeof TYPICAL_UNIT_TYPES[number]
