// src/lib/romComplexityLabels.ts — human-readable labels for the Integration/
// Software complexity trigger keys (src/calc/complexityInputs.ts point-table
// keys). Display-only lookup; the keys themselves stay camelCase in
// content/pricing/global-assumptions.json and the calc layer.
const COMPLEXITY_LABELS: Record<string, string> = {
  trafficPedestrian: 'Pedestrian Traffic',
  trafficForklift: 'Forklift Traffic',
  ramps: 'Ramps',
  customLoad: 'Custom Load',
  fleetBand6to10: 'Fleet Size (6–10 units)',
  fleetBand11to20: 'Fleet Size (11–20 units)',
  fleetBand21plus: 'Fleet Size (21+ units)',
  sqftBand100kTo250k: 'Facility Size (100K–250K sq ft)',
  sqftBand250kTo500k: 'Facility Size (250K–500K sq ft)',
  sqftBand500kPlus: 'Facility Size (500K+ sq ft)',
  pickDropBand10to25: 'Pick/Drop Locations (10–25)',
  pickDropBand25to50: 'Pick/Drop Locations (25–50)',
  pickDropBand50plus: 'Pick/Drop Locations (50+)',
  noAgvExperience: 'No AGV Experience',
  wmsIntegration: 'WMS Integration',
  storageTracking: 'Storage Tracking',
  barcodeScanning: 'Barcode Scanning',
  otherAgvTraffic: 'Other AGV Traffic',
  automationInterface: 'Automation Interface (PLC)',
  // ComplexityAnswers/GAP_FIELDS keys (unanswered-gap banner, not trigger keys).
  storageTrackingRequired: 'Storage Tracking Required',
  hasAgvExperience: 'AGV/AMR Experience',
  pickDropLocationCount: 'Pick/Drop Location Count',
}

/** Human-readable label for a trigger key; falls back to the raw key so an
 *  unmapped future key (a content-file edit that adds a point) still renders
 *  something rather than silently disappearing. */
export function complexityLabel(key: string): string {
  return COMPLEXITY_LABELS[key] ?? key
}

/** Plain-English name for a complexity tier — what an engineer or a customer
 *  reads instead of "Tier 2". The numeral stays available alongside it
 *  ("Standard · 2 of 3") for anyone who thinks in tiers. */
const TIER_NAMES: Record<1 | 2 | 3, string> = {
  1: 'Straightforward',
  2: 'Standard',
  3: 'Complex',
}
export function tierName(tier: 1 | 2 | 3): string {
  return TIER_NAMES[tier]
}

/** Sentence-fragment phrasing for a trigger key, for the plain-English
 *  "what's driving this" summary — reads as a list inside a sentence
 *  ("Driven by an 11–20 unit fleet, a 500K+ sq ft facility, …"), where
 *  COMPLEXITY_LABELS above is Title Case for tables/chips. Falls back to the
 *  Title Case label (then the raw key) so nothing silently disappears. */
const DRIVER_PHRASES: Record<string, string> = {
  trafficPedestrian: 'pedestrian traffic in the work area',
  trafficForklift: 'manual forklifts sharing the aisles',
  ramps: 'ramps on the route',
  customLoad: 'a non-standard load',
  fleetBand6to10: 'a 6–10 unit fleet',
  fleetBand11to20: 'an 11–20 unit fleet',
  fleetBand21plus: 'a 21+ unit fleet',
  sqftBand100kTo250k: 'a 100K–250K sq ft facility',
  sqftBand250kTo500k: 'a 250K–500K sq ft facility',
  sqftBand500kPlus: 'a 500K+ sq ft facility',
  pickDropBand10to25: '10–25 pick/drop locations',
  pickDropBand25to50: '25–50 pick/drop locations',
  pickDropBand50plus: '50+ pick/drop locations',
  noAgvExperience: 'a customer new to AGVs',
  wmsIntegration: 'WMS integration',
  storageTracking: 'storage location tracking',
  barcodeScanning: 'barcode scanning',
  otherAgvTraffic: "other vendors' AGVs on site",
  automationInterface: 'a PLC / automation interface',
}
export function complexityDriverPhrase(key: string): string {
  return DRIVER_PHRASES[key] ?? complexityLabel(key)
}
