import fs from 'fs'
import path from 'path'
import type { RomInputs } from '@/src/lib/validations/pricingSchemas'

const VEHICLES_DIR = path.join(process.cwd(), 'src/content/vehicles')

export interface TransferMethod {
  method: string
  loadTimeSec: number
  unloadTimeSec: number
  /** True when this transfer method lifts the load vertically. When true, Step 3
   *  derives an additional lift time from the per-flow `liftHeightFt` and the
   *  vehicle's `calc.liftSpeedFps`. Defaults to false. */
  lifts?: boolean
  /** How the vehicle meets a pick/drop with this method (Fleet Simulation, spec §4.3).
   *  Absent → the simulation uses the method default (Lift→rear, Conveyor→left, Pin→under) and flags it. */
  orientation?: TransferOrientation
}

export type TransferOrientation = 'rear' | 'front' | 'left' | 'right' | 'under'
export type TravelEnd = 'forksLeading' | 'forksTrailing' | 'any'

/** Fleet Simulation data (`calc.sim`, spec §4.3). Every value is `null` until it is sourced —
 *  `null` means "not specified in vehicle data", never zero; the simulation uses a stated,
 *  flagged fallback. Provenance goes in `dataNote`, as for the battery block. */
export interface VehicleSimData {
  /** Footprint length including forks/attachments, ft. */
  overallLengthFt?: number | null
  forkLengthFt?: number | null
  /** Point that stays on the path, ft from the footprint centre (+x = body, −x = forks). */
  pathRefPointFt?: { x: number; y: number } | null
  accelFps2?: number | null
  decelFps2?: number | null
  turnSpeedFps?: number | null
  approachSpeedFps?: number | null
  approachDistanceFt?: number | null
  reverseSpeedFps?: number | null
  travelDirection?: 'single' | 'bi' | null
  preferredTravel?: { loaded: TravelEnd; empty: TravelEnd } | null
  reorientSec?: number | null
  /** Can work double-deep racking. Null → treated as NOT capable. */
  doubleDeep?: boolean | null
  availabilityPct?: number | null
  tugger?: { maxCarts: number; cartLengthFt: number; couplingSec: number; trainLengthFt: number } | null
  spriteAsset?: string | null
  spriteRefPx?: { x: number; y: number } | null
  /** True while any value is an assumption rather than measured/sourced. */
  provisional?: boolean
  /** Where the values came from; open items. */
  dataNote?: string
}

export type Partnership = 'TAL Integrated' | 'TAL 3rd Party' | 'OEM' | '3rd Party'
export type NavigationType = 'natural' | 'qr' | 'magnetic' | 'lidar_slam' | 'hybrid'
export type ChargerType = 'opportunity' | 'shift_swap' | 'manual'

export interface VehicleDisplay {
  manufacturer: string
  partnership: Partnership
  /** Runs on TAL's T-One fleet-management platform.
   *
   *  Renamed from `tHive` 2026-10-09 — T-Hive and T-One are the same product,
   *  and carrying both names meant the quote could say one while the spec sheet
   *  said the other.
   *
   *  T-One ships with BlueBotics, so this tracks the FLEET SOFTWARE, not the
   *  chassis: every BlueBotics vehicle is `true`. It was wrong on 8TB50A and
   *  8HBC40A, which are BlueBotics ANT but were flagged false. The invariant
   *  `tOne === fleetSoftware includes "BlueBotics"` is pinned by
   *  src/calc/__tests__/tOnePlatform.test.ts so the two cannot drift. */
  tOne: boolean
  fleetSoftware: string
  heroImage: string
  /** Top-down artwork for the Fleet Simulation map (Run mode), load end facing left (the forks /
   *  tow hitch trail). Drawn at the vehicle's true length × width; without it, a plain outline. */
  topImage?: string
  typicalLoad: string
  category: string
  navigationType?: NavigationType
  /** Path under /public to the manufacturer cutsheet PDF (downloadable from the
   *  Step 2 card back face). */
  cutsheet?: string
  /** Explicit display order for the Step 2 card grid (ascending). Vehicles
   *  without it sort after, by name. */
  order?: number
}

/** How a vehicle transfers a load vertically:
 *  - `forklift`: lifts pick→drop to any height up to `maxLiftHeightFt` (stacking).
 *  - `lift_table`: transfers only at a matched height (pick == drop), e.g. conveyor/roller top.
 *  - `floor`: floor-to-floor only; no above-floor transfer. */
export type LiftClass = 'forklift' | 'lift_table' | 'floor'

export interface VehicleCalc {
  maxWeightLbs: number
  widthFt: number
  lengthFt?: number
  heightFt?: number
  turningRadiusFt?: number
  /** Vertical-transfer class — drives the lift gate (see {@link LiftClass}). */
  liftClass: LiftClass
  maxLiftHeightFt: number | null
  maxLoadLengthIn?: number | null
  maxLoadWidthIn?: number | null
  maxLoadHeightIn?: number | null
  speedLoadedFps: number
  speedUnloadedFps?: number
  /** Vertical lift speed in feet per second. Required when any transfer method
   *  on this vehicle has `lifts: true`. Step 3 uses it to derive lift cycle time. */
  liftSpeedFps?: number
  /** Battery rated capacity (amp-hours) and nominal voltage. Energy kWh = voltageV × ratedAh / 1000. */
  ratedAh: number
  voltageV: number
  /** Hours of operation per full charge. THE single most sensitive input in the
   *  charging model — fleet size moves further on this than on any modelling
   *  choice. Source: the owner's battery/charging sheet ("Typical Runtime"). */
  runTimeHr: number
  /** Time to a full charge (min). When present, the authoritative recharge time. */
  chargeTimeMin?: number
  chargerType?: ChargerType

  // ── Battery & charging spec (owner sheet, 2026-10-09) ────────────────────
  // `null` means the cell was BLANK on the sheet — a placeholder to be filled,
  // never a measured zero. See docs/VEHICLE-DATA-PROVENANCE.md for per-field
  // provenance and the open-questions list.

  /** Determines the charging profile and usable capacity. */
  batteryChemistry?: 'Li-ion' | 'TPPL' | 'AGM' | null
  /** Share of rated capacity actually usable (%). Per platform — this is what
   *  `DEFAULT_DOD` was standing in for with one global 80%. */
  usableCapacityPct?: number | null
  avgCurrentDrawA?: number | null
  avgPowerDrawKw?: number | null
  /** Worst-case loading. */
  peakCurrentDrawA?: number | null
  idlePowerDrawW?: number | null
  /** Charge-start threshold (%). */
  minSocPct?: number | null
  /** Charge-stop target (%). */
  maxSocPct?: number | null
  /** Opportunity-charging window, 20→80% SOC (min). */
  chargeTime20to80Min?: number | null
  /** Full recharge, 0→100% SOC (hours). */
  chargeTime0to100Hr?: number | null
  /** Charger spec as written on the sheet — a range for some platforms, so a string. */
  chargerVoltage?: string | null
  chargerOutputA?: number | null
  chargerPowerKw?: number | null
  /** True when `avgPowerDrawKw` / `chargerPowerKw` were BLANK on the owner sheet and
   *  are back-derived from this platform's own [estimate] runtime and charge time.
   *  The fleet still sizes, but every surface must say the figures are provisional —
   *  silently sizing on a guess is worse than sizing on nothing. */
  batterySpecProvisional?: boolean
  /** Unreconciled conflicts / unverified cells for this platform's battery data. */
  batteryDataNote?: string
  /** Fleet Simulation data — see {@link VehicleSimData}. */
  sim?: VehicleSimData
  priceRange: {
    minUsd: number
    maxUsd: number
  }
}

export interface VehicleAccessory {
  id: string
  label: string
  /** PLACEHOLDER USD pending real pricing — see each vehicle JSON's own note. */
  amount: number
  note?: string
}

export interface VehicleSpecs {
  tempMinF: number
  tempMaxF: number
  outdoorCapable: boolean
  freezerCapable: boolean
  maxRampGrade: number
  certifications: string[]
}

export interface Vehicle {
  id: string
  name: string
  display: VehicleDisplay
  transferMethods: TransferMethod[]
  /** Payload categories this vehicle can carry — matched against ApplicationRequirements.typicalUnitType. */
  payloadTypes: string[]
  /** Pallet bottom-board / stringer compatibility. 'stringer' = 2-way entry (forks from
   *  the end only); 'block' = 4-way entry; omit or leave empty = any / not applicable.
   *  Drives a soft (YELLOW) gate when the project's palletEntryType is set. */
  palletEntryCompatibility?: ('stringer' | 'block')[]
  /** This vehicle tows carts rather than carrying the load directly (tugger). */
  towsCarts?: boolean
  /** What the towed carts can carry. Matched in the payload gate (a project whose unit
   *  type is here qualifies via the cart) and shown as "Tows carts → …". Entries must be
   *  in TYPICAL_UNIT_TYPES. */
  cartPayloads?: string[]
  calc: VehicleCalc
  specs: VehicleSpecs
  /** Sell-price ROM engine inputs (integration/software floors + base sell
   *  prices — Integration's base price includes commissioning/bring-up cost).
   *  Optional at the type level because a vehicle
   *  missing it is a valid, loadable vehicle — it's simply excluded from the ROM
   *  sell-price UI ("pricing not configured") rather than failing to load. See
   *  `src/calc/sellPriceRom.ts` and `src/lib/validations/pricingSchemas.ts`. */
  romInputs?: RomInputs
  /** Optional, vehicle-specific equipment priced alongside this chassis
   *  (e.g. ML2's conveyor interface). Elective — the engineer selects which
   *  apply, same interaction as a program-level adder — but the dollar
   *  amount folds into the Hardware subtotal, not the Adders bucket, since
   *  it IS hardware. Absent for any vehicle that needs none. */
  accessories?: VehicleAccessory[]
}

export async function loadVehicleLibrary(): Promise<Vehicle[]> {
  const files = fs.readdirSync(VEHICLES_DIR)
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const raw = fs.readFileSync(path.join(VEHICLES_DIR, f), 'utf-8')
      return JSON.parse(raw) as Vehicle
    })
    .sort((a, b) => {
      const ao = a.display.order ?? Number.MAX_SAFE_INTEGER
      const bo = b.display.order ?? Number.MAX_SAFE_INTEGER
      return ao - bo || a.name.localeCompare(b.name)
    })
}

export async function getVehicleById(id: string): Promise<Vehicle | null> {
  const vehicles = await loadVehicleLibrary()
  return vehicles.find(v => v.id === id) || null
}
