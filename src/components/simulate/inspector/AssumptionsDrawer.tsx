'use client'

// The Assumptions view (Milestone 6, spec §5.7 / §8): every assumption the simulation reads, grouped
// Vehicle · Motion · Traffic · Handling · Charging · Demand · Safety · Run, in a side drawer — never a
// modal: the page stays usable, Esc closes. "Changed only" narrows to overrides; Reset all restores
// every source. Opened from the page head's override count, the Run chip, or a vehicle's Run row
// (`focus`: just that vehicle).

import { useEffect, useState } from 'react'
import { updatePoint, updateSegment } from '@/src/calc/sim/layoutEdit'
import { FIELD_GROUPS, fieldPatch, fieldState, fieldsFor, ownerName, step1DaysPerWeek, type FieldContext, type FieldPatch, type Overridden, type SimFieldDef } from '@/src/lib/simFields'
import { patchSimSettings, type StoredProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import FieldRow from './FieldRow'

type SimLayoutData = NonNullable<StoredProject['simLayout']>

interface Props {
  project: StoredProject
  /** The vehicle types the run uses (their files, not overridden). */
  vehicles: Vehicle[]
  /** What is overridden (computed once by the page, for its count too). */
  changed: Overridden[]
  /** Change the layout — through the open editor (its undo history) when there is one. */
  writeLayout: (update: (L: SimLayoutData) => SimLayoutData) => void
  unitSystem: UnitSystem
  /** Show one vehicle type only (opened from its Run row). The page re-keys the drawer on it. */
  focus?: string | null
  onClose: () => void
}

interface Row { def: SimFieldDef; ctx: FieldContext; owner?: string; key: string }

export default function AssumptionsDrawer({ project, vehicles, changed, writeLayout, unitSystem, focus, onClose }: Props) {
  const [changedOnly, setChangedOnly] = useState(false)
  const [only, setOnly] = useState<string | null>(focus ?? null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const ss = project.simSettings ?? {}
  const shown = only ? vehicles.filter(v => v.id === only) : vehicles
  // Every row: run and rule fields once, vehicle fields per vehicle type; points and routes only
  // where overridden (they are edited in the inspector, on the object itself).
  const rows: Row[] = [
    ...(only ? [] : [...fieldsFor('run'), ...fieldsFor('safety')].map(d => ({ def: d, ctx: { simSettings: ss, hoursPerShift: project.hoursPerShift, shiftsPerDay: project.shiftsPerDay, daysPerWeek: step1DaysPerWeek(project) }, key: d.key }))),
    ...shown.flatMap(v => fieldsFor('vehicle').map(d => ({ def: d, ctx: { simSettings: ss, vehicle: v }, owner: vehicles.length > 1 && !only ? v.name : undefined, key: `${v.id}.${d.key}` }))),
    ...(only ? [] : changed.filter(o => o.def.scope === 'point' || o.def.scope === 'route').map(o => {
      const point = project.simLayout?.points.find(q => q.id === o.ownerId), segment = project.simLayout?.segments.find(q => q.id === o.ownerId)
      return { def: o.def, ctx: { point, segment }, owner: point ? ownerName(point) : 'Route', key: `${o.ownerId}.${o.def.key}` }
    })),
  ]

  /** Apply one field's patch: run, rule and vehicle values to simSettings; points and routes to the layout. */
  const apply = (patch: FieldPatch, ctx: FieldContext) => {
    if ('simSettings' in patch) patchSimSettings(project.id, patch.simSettings)
    else if ('point' in patch && ctx.point) writeLayout(L => updatePoint(L, ctx.point!.id, patch.point))
    else if ('segment' in patch && ctx.segment) writeLayout(L => updateSegment(L, ctx.segment!.id, patch.segment))
  }
  const write = (r: Row, v: number | string | boolean | undefined) => apply(fieldPatch(r.def, r.ctx, v), r.ctx)
  /** Reset every override to its source — the registry's own reset for each, so nothing is missed. */
  const resetAll = () => {
    if (!window.confirm(`Reset ${changed.length} assumption${changed.length === 1 ? '' : 's'} to their sources? `)) return
    let settings: Partial<NonNullable<StoredProject['simSettings']>> = {}
    const layoutResets: { id: string; patch: FieldPatch }[] = []
    for (const o of changed) {
      const ctx = { simSettings: { ...ss, ...settings }, vehicle: vehicles.find(v => v.id === o.ownerId), hoursPerShift: project.hoursPerShift, shiftsPerDay: project.shiftsPerDay, daysPerWeek: step1DaysPerWeek(project),
        point: project.simLayout?.points.find(q => q.id === o.ownerId), segment: project.simLayout?.segments.find(q => q.id === o.ownerId) }
      const patch = fieldPatch(o.def, ctx, undefined)
      if ('simSettings' in patch) settings = { ...settings, ...patch.simSettings }
      else layoutResets.push({ id: o.ownerId, patch })
    }
    if (Object.keys(settings).length) patchSimSettings(project.id, settings)
    if (layoutResets.length) writeLayout(L => layoutResets.reduce((acc, r) => ('point' in r.patch ? updatePoint(acc, r.id, r.patch.point) : 'segment' in r.patch ? updateSegment(acc, r.id, r.patch.segment) : acc), L))
  }

  const visible = rows.filter(r => !changedOnly || fieldState(r.def, r.ctx).source === 'Override')
  return (
    <aside className="sim-drawer" aria-label="Assumptions">
      <div className="sim-drawer-head">
        <h3>{only ? vehicles.find(v => v.id === only)?.name ?? 'Vehicle' : 'Assumptions'}</h3>
        <button type="button" className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>✕</button>
      </div>
      <div className="sim-drawer-bar">
        <label className="sim-check"><input type="checkbox" checked={changedOnly} onChange={e => setChangedOnly(e.target.checked)} />Changed only</label>
        <span className="sim-drawer-count">{changed.length ? `${changed.length} changed` : 'All from their sources'}</span>
        <span className="grow" />
        {only && <button type="button" className="link-btn" onClick={() => setOnly(null)}>All assumptions</button>}
        {!only && changed.length > 0 && <button type="button" className="link-btn" onClick={resetAll}>Reset all</button>}
      </div>
      <p className="sim-frow-help">Simulation only — not the Fleet Engine or the quote.</p>
      <div className="sim-drawer-body">
        {FIELD_GROUPS.map(g => {
          const inGroup = visible.filter(r => r.def.group === g)
          if (!inGroup.length) return null
          return (
            <section key={g} className="sim-drawer-group">
              <h4>{g}</h4>
              {inGroup.map(r => <FieldRow key={r.key} def={r.def} state={fieldState(r.def, r.ctx)} unitSystem={unitSystem} owner={r.owner} onChange={v => write(r, v)} />)}
            </section>
          )
        })}
        {!visible.length && <p className="sim-frow-help">Nothing changed — every assumption is from its source.</p>}
      </div>
    </aside>
  )
}
