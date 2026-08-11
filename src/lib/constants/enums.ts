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

/** Pallet subtype options — mirrors Step 1 ApplicationForm's PALLET_SUBTYPES. */
export const PALLET_SUBTYPES = ['GMA (48×40)', 'Euro (47.2×31.5)', 'CHEP (45.9×45.9)', 'Custom'] as const

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
  'High reach',
  'VNA',
  'Outdoor',
  'Freezer',
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

/** Customer-questionnaire: who is submitting (§01). */
export const SUBMISSION_TYPES = [
  { value: 'customer', label: 'Customer (Direct)' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'internal', label: 'Internal TAL' },
  { value: 'partner', label: '3rd Party Partner' },
] as const

/** §04 charging strategy preference (customer view — informational). */
export const CHARGING_STRATEGIES = [
  { value: 'plug_in', label: 'Plug in' },
  { value: 'opportunity', label: 'Opportunity charging' },
  { value: 'hydrogen', label: 'Hydrogen refueling' },
] as const

/** §05 shared traffic in the operating area (multi-select). */
export const SHARED_TRAFFIC_TYPES = [
  'Pedestrians', 'Manual forklifts', 'Other AGVs', 'None',
] as const

/** §05 VNA guidance type. */
export const GUIDANCE_TYPES = [
  { value: 'wire', label: 'Wire' },
  { value: 'rail', label: 'Rail' },
] as const

/** §09 REST API availability tri-state. */
export const REST_API_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
] as const

/** §09 WMS interface type. */
export const WMS_INTERFACE_TYPES = [
  { value: 'rest_api', label: 'REST API' },
  { value: 'file', label: 'File exchange (CSV/flat file)' },
  { value: 'middleware', label: 'Middleware' },
  { value: 'other', label: 'Other' },
] as const

/** §09 tagging / scan method. */
export const TAGGING_SCAN_METHODS = [
  { value: 'barcode', label: 'Barcode' },
  { value: 'qr', label: 'QR' },
  { value: 'rfid', label: 'RFID' },
  { value: 'none', label: 'None' },
] as const

/** §03 unit/load type multi-select (same options as the singular list). */
export const UNIT_LOAD_TYPE_OPTIONS = TYPICAL_UNIT_TYPES

/** Maps load type label → image filename stem (no extension).
 *  Drop PNG/WebP at public/images/load-types/<slug>.png to activate the image. */
export const LOAD_TYPE_IMAGE_SLUG: Partial<Record<string, string>> = {
  'Standard Pallet': 'pallet',
  'Tote': 'tote',
  'Cart': 'cart',
  'Roll': 'roll',
  'IBC': 'ibc',
  'Coil': 'coil',
  'Rack': 'rack',
}

export type TransferMethod = typeof TRANSFER_METHODS[number]
export type TypicalUnitType = typeof TYPICAL_UNIT_TYPES[number]
