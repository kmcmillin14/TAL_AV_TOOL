import { z } from 'zod'
import { DEFAULT_BUFFER_PCT } from '@/src/calc/types'

/** Bumped when the persisted project shape changes incompatibly. Lives here (not
 *  storage.ts) so the standalone questionnaire can read it without importing storage. */
export const SCHEMA_VERSION = 1

export const projectHeaderSchema = z.object({
  projectName: z.string().optional(),
  customerName: z.string().optional(),
  facilityLocation: z.string().optional(),
  bastianRep: z.string().optional(),
})

export const flowSchema = z.object({
  id: z.string(),
  origin: z.string().default(''),
  destination: z.string().default(''),
  distanceFt: z.number().min(0).default(0),
  thruPerHr: z.number().min(0).default(0),
  routeLayout: z.enum(['low', 'medium', 'high']).default('medium'),
  liftHeightFt: z.number().min(0).default(0),
  vehicleId: z.string().optional(),
  transferMethodIdx: z.number().int().min(0).optional(),
  transferSecOverride: z.number().min(0).optional(),
  sectionName: z.string().optional(),
  /** Per-flow distance semantics (questionnaire §07). Display/intake only —
   *  Step 3 sizing continues to use the flow's distanceFt directly. */
  distanceType: z.enum(['one_way', 'round_trip']).optional(),
})

/** One load the application moves — its own unit type, dims, and optional
 *  weight. Loads exist ONLY to evaluate the Step 2 matrix (and print in the
 *  PDF): flows never reference a load and Step 3 is untouched. `loads[0]`
 *  mirrors into the legacy singular fields on save for back-compat. */
export const loadSchema = z.object({
  id: z.string(),
  unitType: z.string().default(''),
  lengthIn: z.number().positive().optional().nullable(),
  widthIn: z.number().positive().optional().nullable(),
  heightIn: z.number().positive().optional().nullable(),
  /** Per-load weight; the weight gate falls back to project maxLoadWeightLbs. */
  weightLbs: z.number().min(0).optional().nullable(),
  palletSubtype: z.string().optional(),
  customDescription: z.string().optional(),
  otherDescription: z.string().optional(),
})

export const projectSchema = z.object({
  projectName: z.string().optional(),
  customerName: z.string().optional(),
  facilityLocation: z.string().optional(),
  bastianRep: z.string().optional(),
  opportunityNumber: z.string().optional(),
  opportunityType: z.enum(['opp', 'lead']).optional(),

  // Section 1
  loads: z.array(loadSchema).max(100).default([]),
  // Legacy singular load fields — kept for back-compat (old exports/parsers);
  // mirrored from loads[0] on save, synthesized into a load on read when
  // `loads` is empty (see effectiveLoads in src/lib/appRequirements.ts).
  maxLoadWeightLbs: z.number().min(0).optional(),
  typicalUnitType: z.string().optional(),
  palletBottomBoard: z.string().optional(),
  customPalletDescription: z.string().optional(),
  otherUnitTypeDescription: z.string().optional(),
  loadLengthIn: z.number().positive().optional().nullable(),
  loadWidthIn: z.number().positive().optional().nullable(),
  loadHeightIn: z.number().positive().optional().nullable(),

  // Section 2
  // Step 1 "Transfer type" — one field driving the transfer + lift gates.
  transferType: z.enum(['forklift', 'lift_table', 'pallet_truck', 'conveyor', 'tow_cart', 'custom']).optional().nullable(),
  transferHeightFt: z.number().min(0).optional().nullable(),
  // Legacy transfer fields — kept for back-compat; superseded by transferType.
  transferMethod: z.string().optional(),
  deliveryPattern: z.string().optional(),
  liftTypeNeeded: z.enum(['to_height', 'matched_height', 'floor']).optional().nullable(),
  maxLiftHeightFt: z.number().positive().optional().nullable(),
  // Transfer heights above floor (ft). Drive the lift / transfer gate.
  pickHeightFt: z.number().min(0).optional().nullable(),
  dropHeightFt: z.number().min(0).optional().nullable(),

  // Section 3
  minAisleWidthFt: z.number().min(0).optional(),
  pickingFromRacking: z.boolean().optional(),
  floorCondition: z.string().optional(),

  // Section 4
  shiftsPerDay: z.number().int().min(1).max(3).optional(),
  hoursPerShift: z.number().min(4).max(12).optional(),
  operatingDaysPattern: z.string().optional(),
  operatingDaysCustom: z.array(z.string()).optional().nullable(),
  breaksPerShift: z.number().int().min(0).default(0),
  breakDurationMin: z.number().int().min(0).default(0),

  // Section 5
  requiredThroughputPerHour: z.number().int().min(0).optional(),
  avgDistanceFt: z.number().min(0).optional(),
  distanceType: z.enum(['one_way', 'round_trip']).optional(),

  // Section 6
  operatorsPerShift: z.number().int().min(0).default(0),

  // Section 7
  rampRequired: z.boolean().optional(), // tri-state: unset / No / Yes
  rampDistanceFt: z.number().min(0).default(0),
  maxRampGrade: z.number().min(0).default(0),

  // Section 8
  desiredInstallDate: z.string().optional(),
  oemDealer: z.string().optional(),
  dealershipName: z.string().optional(),
  dealerRep: z.string().optional(),

  // Section 9
  certifications: z.array(z.string()).max(50).default([]),

  // Section 10
  interlocks: z.array(z.string()).max(50).default([]),
  flows: z.array(flowSchema).max(500).default([]),
  /** Ordered list of Step 3 group (zone) names, e.g. "ASRS", "Dock". Visual
   *  organization only — fleet sizing pools per vehicleId, not per group.
   *  Flows reference a group via flowSchema.sectionName. */
  flowGroups: z.array(z.string()).max(100).default([]),
  /** Optional per-group color override, keyed by group name. Absent name → the
   *  deterministic sectionColor(name) hash is used. Visual only. */
  flowGroupColors: z.record(z.string(), z.string()).default({}),

  // ---- Fleet Engine: charging + buffer settings ----
  /** Daily recharge window assumption. 'overnight' = an off-shift window exists;
   *  'continuous' = 24/7, charging must happen during operations.
   *  Optional (no .default) so "never chosen" is representable — the effective
   *  regime then derives from shift coverage (useFleetData: 24 h/day schedules
   *  default to 'continuous'). An explicit choice always wins. */
  chargeRegime: z.enum(['overnight', 'continuous']).optional(),
  /** Fleet headroom, stored as the buffer multiplier; set in the UI as a target
   *  utilization (default 80% ⇒ 0.25). See DEFAULT_TARGET_UTILIZATION. */
  bufferPct: z.number().min(0).max(1).default(DEFAULT_BUFFER_PCT),
  /** Per-vehicleId charge-method override ('opportunity' | 'plugged'). Absent →
   *  derived from the vehicle's chargerType. */
  chargeMethods: z.record(z.string(), z.enum(['opportunity', 'plugged'])).default({}),

  // ---- ROM Dashboard: economic assumptions (editable on Step 4) ----
  /** Operators the fleet displaces, and the fully-burdened annual cost per operator.
   *  Annual labor offset = numberOfOperators × fullyBurdenedRateUsdPerYear. */
  // Optional (no .default) — this is an OVERRIDE of the derived
  // operatorsPerShift × shiftsPerDay; a .default(0) was re-injected by Zod on
  // every parse (imports, explicit clears), permanently masking the derived
  // value with 0.
  numberOfOperators: z.number().int().min(0).optional(),
  // Same trap for every assumption below: a schema .default() gets PINNED into
  // storage on create/import, so the UI-level fallbacks (?? 65000, ?? 0.12,
  // ?? defaultOperatingDaysPerYear(...), ?? 7) can never apply. All optional;
  // the UI owns the defaults.
  fullyBurdenedRateUsdPerYear: z.number().min(0).optional(),
  energyCostUsdPerKwh: z.number().min(0).optional(),
  annualMaintenancePctOfCapex: z.number().min(0).max(1).optional(),
  operatingDaysPerYear: z.number().int().min(1).max(366).optional(),
  /** Equipment service life (yr) used for TCO and payback projections. */
  serviceLifeYears: z.number().int().min(1).max(20).optional(),
  /** Customer's target payback period (yr) — informational for ROM framing. */
  roiTargetYears: z.number().int().min(1).max(20).optional(),

  otherAGVs: z.boolean().default(false),
  otherAGVVendor: z.string().optional(),

  // Section 11
  tempMinF: z.number().optional().nullable(),
  tempMaxF: z.number().optional().nullable(),
  outdoorRequired: z.boolean().optional(), // tri-state: unset / Indoor / Outdoor
  freezerCapable: z.boolean().optional(), // legacy — superseded by temperatureEnvironment
  temperatureEnvironment: z.enum(['ambient', 'refrigerated', 'freezer']).optional(),
  dustMoisture: z.string().optional(),

  // Section 12
  wmsRequired: z.boolean().default(false),
  wmsVendor: z.string().optional(),

  // ---- Customer questionnaire: opportunity / sales context (informational only) ----
  vehicleInMind: z.string().optional(),
  vehiclesOfInterest: z.array(z.string()).max(50).default([]),
  pickContext: z.string().optional(),
  dropContext: z.string().optional(),
  peakThroughputPerHour: z.number().int().min(0).optional(),
  isRfq: z.boolean().optional(),
  rfqNumber: z.string().optional(),
  rfqDueDate: z.string().optional(),
  cadAvailable: z.boolean().optional(),
  cadNotes: z.string().optional(),
  projectStage: z.enum(['exploring', 'budgeting', 'approved', 'committed']).optional(),
  budgetStatus: z.enum(['budgetary', 'firm', 'allocated']).optional(),
  budgetRange: z.string().optional(),  // legacy free-text; superseded by budgetMin/budgetMax
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  decisionDate: z.string().optional(),
  targetGoLiveDate: z.string().optional(),
  projectDrivers: z.array(z.string()).max(50).default([]),
  currentProcess: z.string().optional(),
  volumeGrowthNote: z.string().optional(),
  seasonalityNote: z.string().optional(),
  facilitySizeSqFt: z.number().min(0).optional().nullable(),
  dockDoors: z.number().int().min(0).optional().nullable(),
  networkReady: z.boolean().optional(),
  itContact: z.string().optional(),
  existingAutomation: z.string().optional(),
  siteWalkthroughAvailable: z.boolean().optional(),
  specialtyApplications: z.array(z.string()).max(50).default([]),
  customerContactName: z.string().optional(),
  customerContactRole: z.string().optional(),
  customerContactEmail: z.string().optional(),
  customerContactPhone: z.string().optional(),
  talRepName: z.string().optional(),
  talRepEmail: z.string().optional(),
  talRepPhone: z.string().optional(),
  talHistory: z.string().optional(),
  currentToyotaForklifts: z.string().optional(),

  // ---- Customer questionnaire change-log additions (2026-08-07) ----
  // §01 submitter routing
  submissionType: z.enum(['customer', 'dealer', 'internal', 'partner']).optional(),
  partnerCompanyName: z.string().optional(),
  partnerRepContact: z.string().optional(),
  // Internal (TAL) submissions capture the CRM lead/opp via the existing
  // opportunityType + opportunityNumber fields (see top of projectSchema).
  // §03 load types (multi). Legacy singular `typicalUnitType` mirrors [0] on save.
  unitLoadTypes: z.array(z.string()).max(50).default([]),
  // §04 handling detail
  dwellTimeMin: z.number().min(0).optional().nullable(),
  chargingStrategyPreference: z.enum(['plug_in', 'opportunity', 'hydrogen', 'floor_contact', 'inductive', 'battery_swap', 'not_sure']).optional(),
  topOfRollerHeightFt: z.number().min(0).optional().nullable(),
  // §05 environment. driveAisle/rackingAisle mirror min()→minAisleWidthFt on save.
  driveAisleWidthFt: z.number().min(0).optional().nullable(),
  rackingAisleWidthFt: z.number().min(0).optional().nullable(),
  sharedTrafficTypes: z.array(z.string()).max(10).default([]),
  guidanceType: z.enum(['wire', 'rail']).optional(),
  // §09 certs / controls
  hazardZoneClassification: z.string().optional(),
  restApiAvailable: z.enum(['yes', 'no', 'not_sure']).optional(),
  barcodeScanningRequired: z.boolean().optional(),
  wmsInterfaceType: z.enum(['rest_api', 'file', 'middleware', 'other']).optional(),
  taggingScanMethod: z.enum(['barcode', 'qr', 'rfid', 'none']).optional(),
  // §12 current-state. NOTE: the legacy free-text `existingAutomation` (brand/fleet)
  // field above stays — `hasExistingAutomation` is its structured boolean gate and
  // `existingAutomationInterop` the follow-up when true; keep all three.
  hasExistingAutomation: z.boolean().optional(),
  existingAutomationInterop: z.string().optional(),
  currentHeadcount: z.number().min(0).optional().nullable(),

  // Section 13
  projectNotes: z.string().optional(),
})

export type ProjectFormData = z.infer<typeof projectSchema>

export const partialProjectSchema = projectSchema.partial()
export type PartialProjectFormData = z.infer<typeof partialProjectSchema>
