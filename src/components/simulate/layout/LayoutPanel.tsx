'use client'

// Right-hand panel of the layout editor: what is selected, with its few settings (spec v2 §8 —
// the full Summary → Settings → Advanced inspector arrives in Milestone 6). With nothing selected
// it shows the layout's totals, points that are not connected, and Sizing flows to link.

import { useMemo } from 'react'
import {
  flowRefusal, FLOW_POINT_TYPES, pointById, routeDistanceFt, segmentLengthFt, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import type { SimLayout, SimPoint, SimPointType, SimSegment } from '@/src/calc/sim/types'
import Icon from '@/src/design-system/components/Icon'
import { lengthFromDisplay, lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { POINT_LABEL, ROLE_OPTIONS } from './labels'
import type { Selection } from './LayoutCanvas'
import type { ProjectFlow } from './useLayoutEditor'

interface Props {
  layout: SimLayout
  flows: ProjectFlow[]
  vehicles: Vehicle[]
  selection: Selection
  unitSystem: UnitSystem
  notConnected: Set<string>
  suggestions: { flowId: string; from?: string; to?: string }[]
  onPoint: (id: string, patch: Partial<SimPoint>) => void
  onSegment: (id: string, patch: Partial<SimSegment>) => void
  onFlow: (id: string, patch: Partial<ProjectFlow>) => void
  onLink: (flowId: string, from: string, to: string) => void
  onUnlink: (flowId: string) => void
  onDelete: () => void
  onSelect: (s: Selection) => void
}

/** Highest transfer height the project file accepts (simSchemas.ts). */
const MAX_HEIGHT_FT = 100

export default function LayoutPanel(p: Props) {
  const unit = units.distance.label(p.unitSystem)
  const len = (ft: number) => (isFinite(ft) ? `${lengthToDisplay(ft, p.unitSystem).toFixed(1)} ${unit}` : 'No route')
  const byId = useMemo(() => pointById(p.layout), [p.layout])
  const name = (id?: string) => (id && byId.get(id)?.name) || '—'
  const sel = p.selection
  const flow = sel?.kind === 'flow' ? p.flows.find(q => q.id === sel.id) : undefined
  const flowFt = useMemo(
    () => (flow?.fromPointId && flow.toPointId ? routeDistanceFt(p.layout, flow.fromPointId, flow.toPointId) : Infinity),
    [p.layout, flow?.fromPointId, flow?.toPointId],
  )

  if (sel?.kind === 'point') {
    const pt = byId.get(sel.id)
    if (!pt) return null
    return (
      <Panel title={pt.type === 'junction' ? 'Junction' : pt.name || POINT_LABEL[pt.type]} icon={pt.type} onDelete={p.onDelete}>
        {pt.type !== 'junction' && (
          <>
            <label className="sim-field"><span>Name</span>
              <input value={pt.name ?? ''} maxLength={80} onChange={e => p.onPoint(pt.id, { name: e.target.value })} />
            </label>
            <label className="sim-field"><span>Equipment</span>
              <select value={pt.type} onChange={e => {
                const type = e.target.value as SimPointType
                p.onPoint(pt.id, { type, role: FLOW_POINT_TYPES.includes(type) ? pt.role ?? 'pick' : undefined })
              }}>
                <optgroup label="Flow points">{FLOW_POINT_TYPES.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
                <optgroup label="Vehicle points">{VEHICLE_POINT_TYPES.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
              </select>
            </label>
          </>
        )}
        {FLOW_POINT_TYPES.includes(pt.type) && (
          <>
            <div className="sim-field"><span>Role</span>
              <Segmented options={ROLE_OPTIONS} value={pt.role ?? 'pick'} onChange={role => p.onPoint(pt.id, { role })} />
            </div>
            <label className="sim-field"><span>Transfer height</span>
              <span className="sim-input-unit">
                <input type="number" min={0} step="any" value={pt.heightFt == null ? '' : Math.round(lengthToDisplay(pt.heightFt, p.unitSystem) * 100) / 100}
                  onChange={e => p.onPoint(pt.id, { heightFt: e.target.value === '' ? undefined : Math.min(MAX_HEIGHT_FT, Math.max(0, lengthFromDisplay(Number(e.target.value), p.unitSystem))) })} />
                <span>{unit}</span>
              </span>
            </label>
          </>
        )}
      </Panel>
    )
  }

  if (sel?.kind === 'segment') {
    const s = p.layout.segments.find(q => q.id === sel.id)
    if (!s) return null
    return (
      <Panel title="Route" onDelete={p.onDelete}>
        <p className="sim-readout"><span className="num">{len(segmentLengthFt(p.layout, s, byId))}</span> · {name(s.a)} – {name(s.b)}</p>
        <div className="sim-field"><span>Direction</span>
          <Segmented value={s.dir} onChange={dir => p.onSegment(s.id, { dir })}
            options={[{ id: 'two', label: 'Two-way' }, { id: 'ab', label: `→ ${name(s.b)}` }, { id: 'ba', label: `→ ${name(s.a)}` }]} />
        </div>
        <div className="sim-field"><span>Lanes</span>
          <Segmented value={s.lane ?? 'two'} onChange={lane => p.onSegment(s.id, { lane })}
            options={[{ id: 'two', label: 'Two-lane (passing)' }, { id: 'single', label: 'Single-lane' }]} />
        </div>
      </Panel>
    )
  }

  if (flow) {
    return (
      <Panel title="Flow">
        <p className="sim-readout">{name(flow.fromPointId)} → {name(flow.toPointId)} · <span className="num">{len(flowFt)}</span></p>
        <label className="sim-field"><span>Moves per hour</span>
          <input type="number" min={0} step="any" value={flow.thruPerHr || ''} onChange={e => p.onFlow(flow.id, { thruPerHr: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className="sim-field"><span>Vehicle</span>
          <select value={flow.vehicleId ?? ''} onChange={e => p.onFlow(flow.id, { vehicleId: e.target.value || undefined, transferMethodIdx: undefined })}>
            <option value="">Choose a vehicle</option>
            {p.vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <button type="button" className="link-btn" onClick={() => p.onUnlink(flow.id)}>Unlink from points</button>
      </Panel>
    )
  }

  // Nothing selected: the layout at a glance.
  const routeFt = p.layout.segments.reduce((t, s) => t + segmentLengthFt(p.layout, s, byId), 0)
  return (
    <aside className="sim-panel" aria-label="Layout">
      <h3>Layout</h3>
      <dl className="sim-stats">
        <div><dt>Points</dt><dd className="num">{p.layout.points.filter(q => q.type !== 'junction').length}</dd></div>
        <div><dt>Routes</dt><dd className="num">{len(routeFt)}</dd></div>
        <div><dt>Flows</dt><dd className="num">{p.flows.filter(f => f.fromPointId && f.toPointId).length}</dd></div>
      </dl>
      {p.notConnected.size > 0 && (
        <section>
          <h4>Not connected</h4>
          <ul className="sim-list">
            {[...p.notConnected].map(id => <li key={id}><button type="button" className="link-btn" onClick={() => p.onSelect({ kind: 'point', id })}>{name(id)}</button></li>)}
          </ul>
        </section>
      )}
      {p.suggestions.length > 0 && (
        <section>
          <h4>Link to points</h4>
          <ul className="sim-list">
            {p.suggestions.map(s => {
              const f = p.flows.find(q => q.id === s.flowId)!
              const title = `${f.origin || '—'} → ${f.destination || '—'}`
              const ok = s.from && s.to && !flowRefusal(p.layout, s.from, s.to)
              return (
                <li key={s.flowId}>
                  <span title={title}>{title}</span>
                  {ok
                    ? <button type="button" className="btn ghost btn-sm" onClick={() => p.onLink(s.flowId, s.from!, s.to!)}>Link {name(s.from)} → {name(s.to)}</button>
                    : <small>Draw it with the Flow tool</small>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </aside>
  )
}

function Panel({ title, icon, onDelete, children }: { title: string; icon?: SimPointType; onDelete?: () => void; children: React.ReactNode }) {
  return (
    <aside className="sim-panel" aria-label={title}>
      <div className="sim-panel-head">
        {icon && icon !== 'junction' && <Icon name={icon} size={16} />}
        <h3>{title}</h3>
        {onDelete && <button type="button" className="icon-btn" aria-label="Delete" title="Delete (⌫)" onClick={onDelete}><Icon name="trash" size={14} /></button>}
      </div>
      {children}
    </aside>
  )
}

/** A segmented choice on the app's `seg-toggle` style. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg-toggle sim-seg-toggle" role="radiogroup">
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={`seg-btn${o.id === value ? ' on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
