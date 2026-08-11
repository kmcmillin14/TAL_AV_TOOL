import fs from 'fs'
import path from 'path'

const VEHICLES_DIR = path.join(process.cwd(), 'src/content/vehicles')

export interface TransferMethod {
  method: string
  loadTimeSec: number
  unloadTimeSec: number
  /** True when this transfer method lifts the load vertically. When true, Step 3
   *  derives an additional lift time from the per-flow `liftHeightFt` and the
   *  vehicle's `calc.liftSpeedFps`. Defaults to false. */
  lifts?: boolean
}

export type Partnership = 'TAL Integrated' | 'TAL 3rd Party' | 'OEM' | '3rd Party'
export type NavigationType = 'natural' | 'qr' | 'magnetic' | 'lidar_slam' | 'hybrid'
export type ChargerType = 'opportunity' | 'shift_swap' | 'manual'

export interface VehicleDisplay {
  manufacturer: string
  partnership: Partnership
  tHive: boolean
  fleetSoftware: string
  heroImage: string
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
  /** Hours of operation per full charge (cutsheet). The v3 charging calc and
   *  ROM energy both derive from this — no amp fields. */
  runTimeHr: number
  /** Time to a full charge (min). When present, the authoritative recharge time. */
  chargeTimeMin?: number
  chargerType?: ChargerType
  priceRange: {
    minUsd: number
    maxUsd: number
  }
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
