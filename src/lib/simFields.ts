// src/lib/simFields.ts — every assumption the Fleet Simulation reads, in one registry (spec v2 §8,
// Milestone 6). The inspector, the Assumptions view and the enumeration test (acceptance 35) all read
// it: label, unit, group, level, the help key, and how to resolve the value and its source.
// Stored imperial; display converts (units below).
//
// Sources: JSON (the vehicle file) · Step 1 (read-only) · Drawn (a fact of the site, measured onto the
// layout — e.g. a transfer height) · Default (the simulation's default, or the engine's fallback
// where the vehicle file has no value) · Override (a per-project value changing an assumption).
// Overrides change the simulation only — never the Fleet Engine or the quote.

import { B56_5_RULE } from '@/src/calc/sim/clearance'
import type { SimPoint, SimSegment } from '@/src/calc/sim/types'
import { vehicleFileValue, type VehicleOverrideField } from '@/src/calc/sim/vehicle'
import type { StoredProject } from './storage'
import { units, type UnitSystem } from './utils/units'
import type { Vehicle } from './vehicleLibrary'

export type FieldSource = 'JSON' | 'Step 1' | 'Drawn' | 'Default' | 'Override'
export type FieldGroup = 'Vehicle' | 'Motion' | 'Traffic' | 'Handling' | 'Charging' | 'Demand' | 'Safety' | 'Run'
export const FIELD_GROUPS: FieldGroup[] = ['Vehicle', 'Motion', 'Traffic', 'Handling', 'Charging', 'Demand', 'Safety', 'Run']
export type FieldScope = 'vehicle' | 'point' | 'route' | 'run' | 'safety'
export type FieldUnit = 'ft' | 'in' | 'ft/s' | 'ft/s²' | 's' | '%' | 'kW' | '°' | 'h' | ''
type Value = number | string | boolean | null

export interface SimFieldDef {
  /** `scope.field` — the key into `SIM_FIELD_HELP` (src/content/help.ts). */
  key: string
  scope: FieldScope
  field: string
  group: FieldGroup
  /** Settings: shown with the object; Advanced: one click further (spec §5.7a). */
  level: 'settings' | 'advanced'
  label: string
  unit: FieldUnit
  min?: number
  max?: number
  step?: number
  /** A fixed set of values (a select). `value` is what is stored. */
  choices?: { value: string | boolean; label: string }[]
  /** Shown when a Default has no number (the engine's fallback in words). */
  fallback?: string
  readOnly?: boolean
  /** Whole numbers only (a seed). */
  integer?: boolean
  /** A site fact stored on the object (source `Drawn` when set): not an override, never counted. */
  drawn?: boolean
}

const def = (scope: FieldScope, field: string, group: FieldGroup, level: SimFieldDef['level'], label: string, unit: FieldUnit, extra: Partial<SimFieldDef> = {}): SimFieldDef =>
  ({ key: `${scope}.${field}`, scope, field, group, level, label, unit, ...extra })

/** Run assumptions' defaults (spec D-3 pace; the engine's following gap). */
export const RUN_DEFAULTS = { pacePct: 70, safetyFt: 3, arrivals: 'regular' as 'regular' | 'random', demandPct: 100, seed: 1, runLength: 'shift' as RunLength }
export type RunLength = 'shift' | 'day' | 'week'
/** A run length in seconds, for a staffed shift of `shiftH` hours. */
export const runSeconds = (len: RunLength, shiftH: number) => (len === 'week' ? 7 * 86400 : len === 'day' ? 86400 : shiftH * 3600)

export const SIM_FIELDS: SimFieldDef[] = [
  // Vehicle type (values from the vehicle file; per-project overrides)
  def('vehicle', 'speedLoadedFps', 'Motion', 'settings', 'Speed, loaded', 'ft/s', { min: 0.1, max: 30, step: 0.1 }),
  def('vehicle', 'speedUnloadedFps', 'Motion', 'settings', 'Speed, empty', 'ft/s', { min: 0.1, max: 30, step: 0.1, fallback: 'Loaded speed' }),
  def('vehicle', 'accelFps2', 'Motion', 'advanced', 'Acceleration', 'ft/s²', { min: 0.1, max: 20, step: 0.1, fallback: 'Pace used instead' }),
  def('vehicle', 'decelFps2', 'Motion', 'advanced', 'Braking', 'ft/s²', { min: 0.1, max: 20, step: 0.1, fallback: 'Pace used instead' }),
  def('vehicle', 'turnSpeedFps', 'Motion', 'advanced', 'Speed in turns', 'ft/s', { min: 0.1, max: 30, step: 0.1, fallback: 'Loaded speed' }),
  def('vehicle', 'reverseSpeedFps', 'Motion', 'advanced', 'Reverse speed', 'ft/s', { min: 0.1, max: 30, step: 0.1, fallback: 'Loaded speed' }),
  def('vehicle', 'widthFt', 'Vehicle', 'advanced', 'Width', 'ft', { min: 0.5, max: 20, step: 0.05 }),
  def('vehicle', 'overallLengthFt', 'Vehicle', 'advanced', 'Overall length', 'ft', { min: 0.5, max: 40, step: 0.05, fallback: 'Body length' }),
  def('vehicle', 'turningRadiusFt', 'Vehicle', 'advanced', 'Turning radius', 'ft', { min: 0, max: 40, step: 0.1, fallback: 'Square corners' }),
  def('vehicle', 'liftSpeedFps', 'Handling', 'advanced', 'Lift speed', 'ft/s', { min: 0.05, max: 5, step: 0.05 }),
  def('vehicle', 'reorientSec', 'Handling', 'advanced', 'Time to turn and face a point', 's', { min: 0, max: 120, step: 1, fallback: '0 s' }),
  def('vehicle', 'approachDistanceFt', 'Handling', 'advanced', 'Approach distance', 'ft', { min: 0, max: 30, step: 0.5, fallback: 'No approach phase' }),
  def('vehicle', 'avgPowerDrawKw', 'Charging', 'advanced', 'Average power draw', 'kW', { min: 0.01, max: 50, step: 0.1 }),
  def('vehicle', 'chargerPowerKw', 'Charging', 'advanced', 'Charger power', 'kW', { min: 0.1, max: 100, step: 0.5 }),
  def('vehicle', 'minSocPct', 'Charging', 'advanced', 'Lowest battery level', '%', { min: 0, max: 90, step: 1 }),
  def('vehicle', 'maxSocPct', 'Charging', 'advanced', 'Highest battery level', '%', { min: 10, max: 100, step: 1 }),
  // Run (simSettings)
  def('run', 'pacePct', 'Motion', 'settings', 'Pace', '%', { min: 10, max: 100, step: 5 }),
  def('run', 'safetyFt', 'Traffic', 'settings', 'Following gap', 'ft', { min: 0.5, max: 30, step: 0.5 }),
  def('run', 'demandPct', 'Demand', 'settings', 'Demand', '%', { min: 10, max: 300, step: 5 }),
  def('run', 'arrivals', 'Demand', 'settings', 'Arrivals', '', { choices: [{ value: 'regular', label: 'Regular' }, { value: 'random', label: 'Random' }] }),
  def('run', 'seed', 'Run', 'advanced', 'Seed', '', { min: 1, max: 99999, step: 1, integer: true }),
  def('run', 'shiftH', 'Run', 'settings', 'Shift length', 'h', { min: 0.5, max: 24, step: 0.5 }),
  def('run', 'shiftsPerDay', 'Run', 'settings', 'Shifts per day', '', { min: 1, max: 3, step: 1, integer: true }),
  // B56.5 rule (simSettings.clearance)
  def('safety', 'thresholdFps', 'Safety', 'advanced', 'Speed for the larger clearance', 'ft/s', { min: 0.5, max: 20, step: 0.01 }),
  def('safety', 'lowSpeedIn', 'Safety', 'advanced', 'Clearance below that speed', 'in', { min: 0, max: 60, step: 0.5 }),
  def('safety', 'fullSpeedIn', 'Safety', 'advanced', 'Clearance at or above it', 'in', { min: 0, max: 60, step: 0.5 }),
  def('safety', 'sharedBetweenVehicles', 'Safety', 'advanced', 'Passing vehicles share one clearance', '', { choices: [{ value: true, label: 'Shared' }, { value: false, label: 'Each its own' }] }),
  // Points and routes (stored on the object)
  def('point', 'heightFt', 'Handling', 'settings', 'Transfer height', 'ft', { min: 0, max: 100, step: 0.1, fallback: 'Floor (0)', drawn: true }),
  def('point', 'handshakeSec', 'Handling', 'advanced', 'Handshake time', 's', { min: 0, max: 600, step: 1, fallback: '0 s' }),
  def('point', 'approachHeadingDeg', 'Handling', 'advanced', 'Approach direction', '°', { min: 0, max: 359, step: 1, fallback: 'Along the route' }),
  def('route', 'speedLimitFps', 'Traffic', 'settings', 'Speed limit', 'ft/s', { min: 0.1, max: 30, step: 0.1, fallback: 'Vehicle speed' }),
]

const BY_SCOPE = Object.fromEntries((['vehicle', 'point', 'route', 'run', 'safety'] as FieldScope[]).map(sc => [sc, SIM_FIELDS.filter(f => f.scope === sc)])) as Record<FieldScope, SimFieldDef[]>
export const fieldsFor = (scope: FieldScope, level?: SimFieldDef['level']) => (level ? BY_SCOPE[scope].filter(f => f.level === level) : BY_SCOPE[scope])
/** One field by its key (`scope.field`). */
export const fieldDef = (key: string): SimFieldDef => { const d = SIM_FIELDS.find(f => f.key === key); if (!d) throw new Error(`No field ${key}`); return d }

// ---- resolve: value, base and source --------------------------------------------------------------

type SimSettingsData = NonNullable<StoredProject['simSettings']>
export interface FieldContext {
  simSettings?: SimSettingsData | null
  /** For vehicle fields. */
  vehicle?: Vehicle
  point?: SimPoint
  segment?: SimSegment
  hoursPerShift?: number | null
  shiftsPerDay?: number | null
}
export interface FieldState { value: Value; base: Value; source: FieldSource }

const clearanceBase = B56_5_RULE as unknown as Record<string, Value>

export function fieldState(d: SimFieldDef, c: FieldContext): FieldState {
  const ss = c.simSettings ?? {}
  switch (d.scope) {
    case 'vehicle': {
      const base = c.vehicle ? vehicleFileValue(c.vehicle, d.field as VehicleOverrideField) : null
      const o = c.vehicle ? (ss.overrides ?? {})[`${c.vehicle.id}.${d.field}`] : undefined
      return typeof o === 'number' ? { value: o, base, source: 'Override' } : { value: base, base, source: base == null ? 'Default' : 'JSON' }
    }
    case 'run': {
      // The staffed day comes from Step 1; the rest are run defaults.
      const step1 = d.field === 'shiftH' ? c.hoursPerShift ?? 8 : d.field === 'shiftsPerDay' ? c.shiftsPerDay ?? 1 : undefined
      const base = step1 ?? RUN_DEFAULTS[d.field as keyof typeof RUN_DEFAULTS]
      const v = (ss as Record<string, unknown>)[d.field] as Value | undefined
      return v != null && v !== base ? { value: v, base, source: 'Override' } : { value: base, base, source: step1 != null ? 'Step 1' : 'Default' }
    }
    case 'safety': {
      const base = clearanceBase[d.field]
      const v = (ss.clearance as Record<string, Value> | undefined)?.[d.field]
      return v != null && v !== base ? { value: v, base, source: 'Override' } : { value: base, base, source: 'Default' }
    }
    case 'point':
    case 'route': {
      const v = ((d.scope === 'point' ? c.point : c.segment) as unknown as Record<string, Value> | undefined)?.[d.field]
      return v != null ? { value: v, base: null, source: d.drawn ? 'Drawn' : 'Override' } : { value: null, base: null, source: 'Default' }
    }
  }
}

// ---- write: what to store for a new value (undefined = reset to its source) ------------------------

/** Only the keys that change: merged into the stored simSettings (`patchSimSettings`), so a write
 *  never drops a run result saved meanwhile. `undefined` clears a key. */
export type FieldPatch =
  | { simSettings: Partial<SimSettingsData> }
  | { point: Partial<SimPoint> }
  | { segment: Partial<SimSegment> }

export function fieldPatch(d: SimFieldDef, c: FieldContext, value: Value | undefined): FieldPatch {
  const ss: SimSettingsData = c.simSettings ?? {}
  switch (d.scope) {
    case 'vehicle': {
      const overrides = { ...(ss.overrides ?? {}) }, k = `${c.vehicle!.id}.${d.field}`
      if (value == null || value === fieldState(d, { ...c, simSettings: {} }).base) delete overrides[k]
      else overrides[k] = value as number
      return { simSettings: { overrides } }
    }
    case 'run': {
      const reset = value == null || value === fieldState(d, { ...c, simSettings: {} }).base
      return { simSettings: { [d.field]: reset ? undefined : value } as Partial<SimSettingsData> }
    }
    case 'safety': {
      const cur = { ...clearanceBase, ...(ss.clearance ?? {}) } as Record<string, Value>
      cur[d.field] = value ?? clearanceBase[d.field]
      const same = Object.keys(clearanceBase).every(k => cur[k] === clearanceBase[k])
      return { simSettings: { clearance: same ? undefined : (cur as unknown as SimSettingsData['clearance']) } }
    }
    case 'point': return { point: { [d.field]: value ?? undefined } as Partial<SimPoint> }
    case 'route': return { segment: { [d.field]: value ?? undefined } as Partial<SimSegment> }
  }
}

// ---- what is overridden (count in the page head, dots on the map, "Changed only") ------------------

/** How a point is named as the owner of a field. */
export const ownerName = (p: SimPoint) => p.name || 'Junction'

export interface Overridden { def: SimFieldDef; owner: string; ownerId: string; state: FieldState }

/** Every overridden assumption in the project: run, B56.5 rule, the run's vehicle types, points, routes. */
export function overriddenFields(project: Pick<StoredProject, 'simSettings' | 'simLayout' | 'hoursPerShift' | 'shiftsPerDay'>, vehicles: Vehicle[]): Overridden[] {
  const ss = project.simSettings ?? {}
  const out: Overridden[] = []
  const add = (scope: FieldScope, owner: string, ownerId: string, c: FieldContext) => {
    for (const d of fieldsFor(scope)) { const st = fieldState(d, c); if (st.source === 'Override') out.push({ def: d, owner, ownerId, state: st }) }
  }
  add('run', 'Run', 'run', { simSettings: ss, hoursPerShift: project.hoursPerShift, shiftsPerDay: project.shiftsPerDay })
  add('safety', 'B56.5 rule', 'safety', { simSettings: ss })
  for (const v of vehicles) add('vehicle', v.name, v.id, { simSettings: ss, vehicle: v })
  for (const p of project.simLayout?.points ?? []) add('point', ownerName(p), p.id, { point: p })
  for (const s of project.simLayout?.segments ?? []) add('route', 'Route', s.id, { segment: s })
  return out
}

// ---- display units (stored imperial; metric only on screen) ----------------------------------------

// Lengths and speeds convert as distance (ft → m), clearances as dimension (in → mm), as elsewhere in
// the app (src/lib/utils/units.ts); %, s, kW, ° and h do not convert.
const CONVERT: Partial<Record<FieldUnit, { to: (v: number) => number; from: (v: number) => number; label: string }>> = {
  ft: { to: units.distance.toMetric, from: units.distance.toImperial, label: 'm' },
  'ft/s': { to: units.distance.toMetric, from: units.distance.toImperial, label: 'm/s' },
  'ft/s²': { to: units.distance.toMetric, from: units.distance.toImperial, label: 'm/s²' },
  in: { to: units.dimension.toMetric, from: units.dimension.toImperial, label: units.dimension.label('metric') },
}
export const unitLabel = (u: FieldUnit, s: UnitSystem) => (s === 'metric' ? CONVERT[u]?.label ?? u : u)
export const toDisplay = (u: FieldUnit, v: number, s: UnitSystem) => (s === 'metric' && CONVERT[u] ? CONVERT[u]!.to(v) : v)
export const fromDisplay = (u: FieldUnit, v: number, s: UnitSystem) => (s === 'metric' && CONVERT[u] ? CONVERT[u]!.from(v) : v)
