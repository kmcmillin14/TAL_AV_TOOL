// Milestone 6 — the field registry (spec v2 §8; acceptance 34–36).
import { describe, expect, it } from 'vitest'
import cb18 from '@/src/content/vehicles/cb18.json'
import { SIM_FIELD_HELP } from '@/src/content/help'
import { VEHICLE_OVERRIDE_FIELDS, withVehicleOverrides } from '@/src/calc/sim/vehicle'
import { FIELD_GROUPS, SIM_FIELDS, fieldPatch, fieldState, fromDisplay, overriddenFields, toDisplay, type FieldContext, type FieldPatch, type SimFieldDef } from '../simFields'
import type { Vehicle } from '../vehicleLibrary'

const V = cb18 as unknown as Vehicle
const ctxFor = (): FieldContext => ({
  simSettings: {}, vehicle: V, hoursPerShift: 8,
  point: { id: 'p', x: 0, y: 0, type: 'stand', role: 'pick' },
  segment: { id: 's', a: 'p', b: 'q', dir: 'two' },
})
const apply = (c: FieldContext, p: FieldPatch): FieldContext =>
  'simSettings' in p ? { ...c, simSettings: JSON.parse(JSON.stringify({ ...c.simSettings, ...p.simSettings })) } : 'point' in p ? { ...c, point: { ...c.point!, ...p.point } } : { ...c, segment: { ...c.segment!, ...p.segment } }
/** A value different from the field's base, inside its range. */
const other = (d: SimFieldDef, base: unknown): number | string | boolean =>
  d.choices ? d.choices.find(c => c.value !== base)!.value
    : ((b: number, step: number) => (b + step * 3 <= (d.max ?? Infinity) ? b + step * 3 : b - step * 3))(typeof base === 'number' ? base : d.min ?? 0, d.step ?? 1)

describe('acceptance 35 — every field has a source chip, a reset and help text', () => {
  it.each(SIM_FIELDS.map(d => [d.key, d] as const))('%s', (_k, d) => {
    expect(SIM_FIELD_HELP[d.key]?.length).toBeGreaterThan(10)
    expect(d.label.length).toBeGreaterThan(2)
    expect(FIELD_GROUPS).toContain(d.group)
    const c = ctxFor(), before = fieldState(d, c)
    expect(['JSON', 'Step 1', 'Drawn', 'Default', 'Override']).toContain(before.source)
    if (d.readOnly) { expect(before.source).toBe('Step 1'); return }
    expect(before.source).not.toBe('Override')
    const changed = apply(c, fieldPatch(d, c, other(d, before.value) as never))
    expect(fieldState(d, changed).source).toBe(d.drawn ? 'Drawn' : 'Override')
    const reset = apply(changed, fieldPatch(d, changed, undefined))
    expect(fieldState(d, reset)).toEqual(before)
  })
})

describe('acceptance 34 — every assumption is within two clicks of its object', () => {
  it('each field sits in Settings (with the object) or Advanced (one click further)', () => {
    for (const d of SIM_FIELDS) expect(['settings', 'advanced']).toContain(d.level)
  })
})

describe('acceptance 36 — overrides are counted and reset', () => {
  it('counts run, rule, vehicle, point and route overrides; Reset all restores the sources', () => {
    const project = {
      hoursPerShift: 8,
      simSettings: { pacePct: 60, overrides: { 'cb18.speedLoadedFps': 3 }, clearance: { thresholdFps: 3.94, lowSpeedIn: 8, fullSpeedIn: 19.69, sharedBetweenVehicles: true } },
      simLayout: { points: [{ id: 'p', x: 0, y: 0, type: 'stand' as const, handshakeSec: 5, heightFt: 4 }], segments: [{ id: 's', a: 'p', b: 'q', dir: 'two' as const, speedLimitFps: 2 }] },
    }
    const o = overriddenFields(project, [V])
    expect(o.map(x => x.def.key).sort()).toEqual(['point.handshakeSec', 'route.speedLimitFps', 'run.pacePct', 'safety.lowSpeedIn', 'vehicle.speedLoadedFps'])
    expect(overriddenFields({ hoursPerShift: 8, simSettings: {}, simLayout: { points: [{ id: 'p', x: 0, y: 0, type: 'stand' }], segments: [] } }, [V])).toEqual([])
  })
})

describe('vehicle overrides reach the run, and only the run', () => {
  it('lays the override over the file value; untouched vehicles keep their object', () => {
    const [v] = withVehicleOverrides([V], { 'cb18.speedLoadedFps': 2.5, 'cb18.accelFps2': 1.5, 'cb18.junk': 'x' })
    expect(v.calc.speedLoadedFps).toBe(2.5)
    expect(v.calc.sim?.accelFps2).toBe(1.5)
    expect(V.calc.speedLoadedFps).not.toBe(2.5)          // the library is never changed
    expect(withVehicleOverrides([V], {})[0]).toBe(V)
  })
})

describe('display units', () => {
  it('stores imperial; metric only on screen', () => {
    expect(toDisplay('ft', 10, 'metric')).toBeCloseTo(3.048)
    expect(fromDisplay('in', 25.4, 'metric')).toBeCloseTo(1)          // clearances in mm, as elsewhere in the app
    expect(toDisplay('%', 50, 'metric')).toBe(50)
  })
})

describe('one list of vehicle override fields', () => {
  it('the registry shows exactly the fields a run can override', () => {
    expect(SIM_FIELDS.filter(d => d.scope === 'vehicle').map(d => d.field).sort()).toEqual(Object.keys(VEHICLE_OVERRIDE_FIELDS).sort())
  })
})
