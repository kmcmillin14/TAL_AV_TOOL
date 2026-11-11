// src/lib/simFields.ts — every assumption the Fleet Simulation reads, in one registry (spec v2 §8,
// Milestone 6). The inspector, the Assumptions view and the enumeration test (acceptance 35) all read
// it: label, unit, group, level, the help key, and how to resolve the value and its source.
// Stored imperial; display converts (units below).
//
// Sources: JSON (the vehicle file) · Step 1 (read-only) · Default (the simulation's default, or the
// engine's fallback where the vehicle file has no value) · Override (a per-project value).
// Overrides change the simulation only — never the Fleet Engine or the quote.

import { B56_5_RULE } from '@/src/calc/sim/clearance'
import type { SimPoint, SimSegment } from '@/src/calc/sim/types'
import { vehicleFileValue, type VehicleOverrideField } from '@/src/calc/sim/vehicle'
import type { StoredProject } from './storage'
import type { UnitSystem } from './utils/units'
import type { Vehicle } from './vehicleLibrary'

export type FieldSource = 'JSON' | 'Step 1' | 'Default' | 'Override'
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
  choices?: { id: string; label: string }[]
  /** Shown when a Default has no number (the engine's fallback in words). */
  fallback?: string
  readOnly?: boolean
}

const def = (scope: FieldScope, field: string, group: FieldGroup, level: SimFieldDef['level'], label: string, unit: FieldUnit, extra: Partial<SimFieldDef> = {}): SimFieldDef =>
  ({ key: `${scope}.${field}`, scope, field, group, level, label, unit, ...extra })

/** Run assumptions' defaults (spec D-3 pace; the engine's following gap). */
export const RUN_DEFAULTS = { pacePct: 70, safetyFt: 3, arrivals: 'regular' as 'regular' | 'random', demandPct: 100, seed: 1 }

export const SIM_FIELDS: SimFieldDef[] = [
  // Vehicle type (values from the vehicle file; per-project overrides)
  def('vehicle', 'speedLoadedFps', 'Motion', 'settings', 'Speed, loaded', 'ft/s', { min: 0.1, max: 30, step: 0.1 }),
  def('vehicle', 'speedUnloadedFps', 'Motion', 'settings', 'Speed, empty', 'ft/s', { min: 0.1, max: 30, step: 0.1, fallback: 'Loaded speed' }),
  def('vehicle', 'accelFps2', 'Motion', 'advanced', 'Acceleration', 'ft/s²', { min: 0.1, max: 20, step: 0.1, fallback: 'Not in vehicle data — pace used' }),
  def('vehicle', 'decelFps2', 'Motion', 'advanced', 'Braking', 'ft/s²', { min: 0.1, max: 20, step: 0.1, fallback: 'Not in vehicle data — pace used' }),
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
  def('run', 'arrivals', 'Demand', 'settings', 'Arrivals', '', { choices: [{ id: 'regular', label: 'Regular' }, { id: 'random', label: 'Random' }] }),
  def('run', 'seed', 'Run', 'advanced', 'Seed', '', { min: 1, max: 9999, step: 1 }),
  def('run', 'shiftH', 'Run', 'settings', 'Shift length', 'h', { readOnly: true }),
  // B56.5 rule (simSettings.clearance)
  def('safety', 'thresholdFps', 'Safety', 'advanced', 'Speed for the larger clearance', 'ft/s', { min: 0.5, max: 20, step: 0.01 }),
  def('safety', 'lowSpeedIn', 'Safety', 'advanced', 'Clearance below that speed', 'in', { min: 0, max: 60, step: 0.5 }),
  def('safety', 'fullSpeedIn', 'Safety', 'advanced', 'Clearance at or above it', 'in', { min: 0, max: 60, step: 0.5 }),
  def('safety', 'sharedBetweenVehicles', 'Safety', 'advanced', 'Passing vehicles share one clearance', '', { choices: [{ id: 'true', label: 'Shared' }, { id: 'false', label: 'Each its own' }] }),
  // Points and routes (stored on the object)
  def('point', 'heightFt', 'Handling', 'settings', 'Transfer height', 'ft', { min: 0, max: 40, step: 0.1, fallback: 'Floor (0)' }),
  def('point', 'handshakeSec', 'Handling', 'advanced', 'Handshake time', 's', { min: 0, max: 600, step: 1, fallback: '0 s' }),
  def('point', 'approachHeadingDeg', 'Handling', 'advanced', 'Approach direction', '°', { min: 0, max: 359, step: 1, fallback: 'Along the route' }),
  def('route', 'speedLimitFps', 'Traffic', 'settings', 'Speed limit', 'ft/s', { min: 0.1, max: 30, step: 0.1, fallback: 'Vehicle speed' }),
]

export const fieldsFor = (scope: FieldScope) => SIM_FIELDS.filter(f => f.scope === scope)

// ---- resolve: value, base and source --------------------------------------------------------------

type SimSettingsData = NonNullable<StoredProject['simSettings']>
export interface FieldContext {
  simSettings?: SimSettingsData | null
  /** For vehicle fields. */
  vehicle?: Vehicle
  point?: SimPoint
  segment?: SimSegment
  hoursPerShift?: number | null
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
      if (d.field === 'shiftH') return { value: c.hoursPerShift ?? 8, base: c.hoursPerShift ?? 8, source: 'Step 1' }
      const base = RUN_DEFAULTS[d.field as keyof typeof RUN_DEFAULTS]
      const v = (ss as Record<string, unknown>)[d.field] as Value | undefined
      return v != null && v !== base ? { value: v, base, source: 'Override' } : { value: base, base, source: 'Default' }
    }
    case 'safety': {
      const base = clearanceBase[d.field]
      const v = (ss.clearance as Record<string, Value> | undefined)?.[d.field]
      return v != null && v !== base ? { value: v, base, source: 'Override' } : { value: base, base, source: 'Default' }
    }
    case 'point':
    case 'route': {
      const v = ((d.scope === 'point' ? c.point : c.segment) as unknown as Record<string, Value> | undefined)?.[d.field]
      return v != null ? { value: v, base: null, source: 'Override' } : { value: null, base: null, source: 'Default' }
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
      const reset = value == null || value === RUN_DEFAULTS[d.field as keyof typeof RUN_DEFAULTS]
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

export interface Overridden { def: SimFieldDef; owner: string; ownerId: string; state: FieldState }

/** Every overridden assumption in the project: run, B56.5 rule, the run's vehicle types, points, routes. */
export function overriddenFields(project: Pick<StoredProject, 'simSettings' | 'simLayout' | 'hoursPerShift'>, vehicles: Vehicle[]): Overridden[] {
  const ss = project.simSettings ?? {}
  const out: Overridden[] = []
  const add = (scope: FieldScope, owner: string, ownerId: string, c: FieldContext) => {
    for (const d of fieldsFor(scope)) { const st = fieldState(d, c); if (st.source === 'Override') out.push({ def: d, owner, ownerId, state: st }) }
  }
  add('run', 'Run', 'run', { simSettings: ss, hoursPerShift: project.hoursPerShift })
  add('safety', 'B56.5 rule', 'safety', { simSettings: ss })
  for (const v of vehicles) add('vehicle', v.name, v.id, { simSettings: ss, vehicle: v })
  for (const p of project.simLayout?.points ?? []) add('point', p.name || 'Junction', p.id, { point: p })
  for (const s of project.simLayout?.segments ?? []) add('route', 'Route', s.id, { segment: s })
  return out
}

// ---- display units (stored imperial; metric only on screen) ----------------------------------------

const METRIC: Partial<Record<FieldUnit, { unit: string; k: number }>> = {
  ft: { unit: 'm', k: 0.3048 }, in: { unit: 'cm', k: 2.54 }, 'ft/s': { unit: 'm/s', k: 0.3048 }, 'ft/s²': { unit: 'm/s²', k: 0.3048 },
}
export const unitLabel = (u: FieldUnit, s: UnitSystem) => (s === 'metric' ? METRIC[u]?.unit ?? u : u)
export const toDisplay = (u: FieldUnit, v: number, s: UnitSystem) => (s === 'metric' && METRIC[u] ? v * METRIC[u]!.k : v)
export const fromDisplay = (u: FieldUnit, v: number, s: UnitSystem) => (s === 'metric' && METRIC[u] ? v / METRIC[u]!.k : v)
