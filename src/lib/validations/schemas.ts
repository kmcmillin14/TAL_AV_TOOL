import { z } from 'zod'

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
  sectionName: z.string().optional(),
})

export const projectSchema = z.object({
  projectName: z.string().optional(),
  customerName: z.string().optional(),
  facilityLocation: z.string().optional(),
  bastianRep: z.string().optional(),
  opportunityNumber: z.string().optional(),
  opportunityType: z.enum(['opp', 'lead']).optional(),

  // Section 1
  maxLoadWeightLbs: z.number().min(0).optional(),
  typicalUnitType: z.string().optional(),
  palletBottomBoard: z.string().optional(),
  customPalletDescription: z.string().optional(),
  otherUnitTypeDescription: z.string().optional(),
  loadLengthIn: z.number().positive().optional().nullable(),
  loadWidthIn: z.number().positive().optional().nullable(),
  loadHeightIn: z.number().positive().optional().nullable(),

  // Section 2
  transferMethod: z.string().optional(),
  deliveryPattern: z.string().optional(),
  maxLiftHeightFt: z.number().positive().optional().nullable(),

  // Section 3
  minAisleWidthFt: z.number().min(0).optional(),
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
  rampDistanceFt: z.number().min(0).default(0),
  maxRampGrade: z.number().min(0).default(0),

  // Section 8
  desiredInstallDate: z.string().optional(),
  oemDealer: z.string().optional(),
  dealershipName: z.string().optional(),
  dealerRep: z.string().optional(),

  // Section 9
  certifications: z.array(z.string()).default([]),

  // Section 10
  interlocks: z.array(z.string()).default([]),
  flows: z.array(flowSchema).default([]),
  /** Ordered list of Step 3 group (zone) names, e.g. "ASRS", "Dock". Visual
   *  organization only — fleet sizing pools per vehicleId, not per group.
   *  Flows reference a group via flowSchema.sectionName. */
  flowGroups: z.array(z.string()).default([]),
  /** Optional per-group color override, keyed by group name. Absent name → the
   *  deterministic sectionColor(name) hash is used. Visual only. */
  flowGroupColors: z.record(z.string(), z.string()).default({}),

  // ---- Fleet Engine: charging + buffer settings ----
  /** Daily recharge window assumption. 'overnight' = an off-shift window exists;
   *  'continuous' = 24/7, charging must happen during operations. */
  chargeRegime: z.enum(['overnight', 'continuous']).default('overnight'),
  /** Final safety buffer fraction applied after base + charging. */
  bufferPct: z.number().min(0).max(1).default(0.10),
  /** Per-vehicleId charge-method override ('opportunity' | 'plugged'). Absent →
   *  derived from the vehicle's chargerType. */
  chargeMethods: z.record(z.string(), z.enum(['opportunity', 'plugged'])).default({}),

  // ---- ROM Dashboard: economic assumptions (editable on Step 4) ----
  /** Operators the fleet displaces, and the fully-burdened annual cost per operator.
   *  Annual labor offset = numberOfOperators × fullyBurdenedRateUsdPerYear. */
  numberOfOperators: z.number().int().min(0).default(0),
  fullyBurdenedRateUsdPerYear: z.number().min(0).default(65000),
  energyCostUsdPerKwh: z.number().min(0).default(0.12),
  annualMaintenancePctOfCapex: z.number().min(0).max(1).default(0.08),
  operatingDaysPerYear: z.number().int().min(1).max(366).default(312),
  /** Equipment service life (yr) used for TCO and payback projections. */
  serviceLifeYears: z.number().int().min(1).max(20).default(7),

  otherAGVs: z.boolean().default(false),
  otherAGVVendor: z.string().optional(),

  // Section 11
  tempMinF: z.number().optional().nullable(),
  tempMaxF: z.number().optional().nullable(),
  outdoorRequired: z.boolean().default(false),
  freezerCapable: z.boolean().default(false),
  dustMoisture: z.string().optional(),

  // Section 12
  wmsRequired: z.boolean().default(false),
  wmsVendor: z.string().optional(),

  // Section 13
  projectNotes: z.string().optional(),
})

export type ProjectFormData = z.infer<typeof projectSchema>

export const partialProjectSchema = projectSchema.partial()
export type PartialProjectFormData = z.infer<typeof partialProjectSchema>
