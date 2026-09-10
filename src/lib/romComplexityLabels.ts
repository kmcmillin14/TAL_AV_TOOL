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
