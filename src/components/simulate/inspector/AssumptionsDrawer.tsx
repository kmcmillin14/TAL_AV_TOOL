'use client'

// The Assumptions view (Milestone 6, spec §5.7 / §8): every assumption the simulation reads, grouped
// Vehicle · Motion · Traffic · Handling · Charging · Demand · Safety · Run, in a side drawer — never a
// modal: the page stays usable, Esc closes. "Changed only" narrows to overrides; Reset all restores
// every source. Opened from the page head's override count, the Run chip, or a vehicle's Run row
// (`focus`: just that vehicle).

import { useEffect, useMemo, useState } from 'react'
import { FIELD_GROUPS, SIM_FIELDS, fieldPatch, fieldState, overriddenFields, type FieldContext, type SimFieldDef } from '@/src/lib/simFields'
import { patchSimSettings, updateProject, type StoredProject } from '@/src/lib/storage'
import type { UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import FieldRow from './FieldRow'

interface Props {
  project: StoredProject
  /** The vehicle types the run uses (their files, not overridden). */
  vehicles: Vehicle[]
  unitSystem: UnitSystem
  /** Show one vehicle type only (opened from its Run row). */
  focus?: string | null
  onClose: () => void
}

interface Row { def: SimFieldDef; ctx: FieldContext; owner?: string; key: string }

export default function AssumptionsDrawer({ project, vehicles, unitSystem, focus, onClose }: Props) {
  const [changedOnly, setChangedOnly] = useState(false)
  const [only, setOnly] = useState<string | null>(focus ?? null)
  useEffect(() => setOnly(focus ?? null), [focus])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const ss = project.simSettings ?? {}
  const shown = only ? vehicles.filter(v => v.id === only) : vehicles
  // Every row: run and rule fields once, vehicle fields per vehicle type; points and routes only
  // where overridden (they are edited in the inspector, on the object itself).
  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    if (!only) {
      for (const d of SIM_FIELDS.filter(f => f.scope === 'run' || f.scope === 'safety'))
        out.push({ def: d, ctx: { simSettings: ss, hoursPerShift: project.hoursPerShift }, key: d.key })
    }
    for (const v of shown) for (const d of SIM_FIELDS.filter(f => f.scope === 'vehicle'))
      out.push({ def: d, ctx: { simSettings: ss, vehicle: v }, owner: vehicles.length > 1 && !only ? v.name : undefined, key: `${v.id}.${d.key}` })
    if (!only) {
      for (const pt of project.simLayout?.points ?? []) for (const d of SIM_FIELDS.filter(f => f.scope === 'point'))
        if (fieldState(d, { point: pt }).source === 'Override') out.push({ def: d, ctx: { point: pt }, owner: pt.name || 'Junction', key: `${pt.id}.${d.key}` })
      for (const sg of project.simLayout?.segments ?? []) for (const d of SIM_FIELDS.filter(f => f.scope === 'route'))
        if (fieldState(d, { segment: sg }).source === 'Override') out.push({ def: d, ctx: { segment: sg }, owner: 'Route', key: `${sg.id}.${d.key}` })
    }
    return out
  }, [ss, shown, only, vehicles.length, project.simLayout, project.hoursPerShift])

  const overrides = overriddenFields(project, vehicles)
  const write = (r: Row, v: number | string | boolean | undefined) => {
    const patch = fieldPatch(r.def, r.ctx, v)
    if ('simSettings' in patch) patchSimSettings(project.id, patch.simSettings)
    else if ('point' in patch && r.ctx.point) updateProject(project.id, { simLayout: { ...project.simLayout!, points: project.simLayout!.points.map(q => (q.id === r.ctx.point!.id ? { ...q, ...patch.point } : q)) } })
    else if ('segment' in patch && r.ctx.segment) updateProject(project.id, { simLayout: { ...project.simLayout!, segments: project.simLayout!.segments.map(q => (q.id === r.ctx.segment!.id ? { ...q, ...patch.segment } : q)) } })
  }
  const resetAll = () => {
    if (!window.confirm(`Reset ${overrides.length} assumption${overrides.length === 1 ? '' : 's'} to their sources? The header’s Undo brings them back.`)) return
    const pointIds = new Set(overrides.filter(o => o.def.scope === 'point').map(o => o.ownerId))
    const segIds = new Set(overrides.filter(o => o.def.scope === 'route').map(o => o.ownerId))
    patchSimSettings(project.id, { overrides: {}, clearance: undefined, pacePct: undefined, safetyFt: undefined, demandPct: undefined, arrivals: undefined, seed: undefined })
    if (project.simLayout && (pointIds.size || segIds.size)) {
      updateProject(project.id, {
        simLayout: {
          ...project.simLayout,
          // Drawn site facts (transfer heights) are not overrides and stay.
          points: project.simLayout.points.map(q => (pointIds.has(q.id) ? { ...q, handshakeSec: undefined, approachHeadingDeg: undefined } : q)),
          segments: project.simLayout.segments.map(q => (segIds.has(q.id) ? { ...q, speedLimitFps: undefined } : q)),
        },
      })
    }
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
        <span className="sim-drawer-count">{overrides.length ? `${overrides.length} changed` : 'All from their sources'}</span>
        <span className="grow" />
        {only && <button type="button" className="link-btn" onClick={() => setOnly(null)}>All assumptions</button>}
        {!only && overrides.length > 0 && <button type="button" className="link-btn" onClick={resetAll}>Reset all</button>}
      </div>
      <p className="sim-frow-help">Changes here affect the simulation only — never the Fleet Engine or the quote.</p>
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
