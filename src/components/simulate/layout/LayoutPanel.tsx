'use client'

// Right-hand panel of the layout editor: what is selected, with its few settings (spec v2 §8 —
// the full Summary → Settings → Advanced inspector arrives in Milestone 6). With nothing selected
// it shows the layout's totals, points that are not connected, and Sizing flows to link.

import { useMemo, useState } from 'react'
import type { ClearanceRule, SegmentClearance } from '@/src/calc/sim/clearance'
import {
  FLOW_POINT_TYPES, pointById, routeDistanceFt, segmentLengthFt, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import type { SimLayout, SimObject, SimPoint, SimPointType, SimSegment } from '@/src/calc/sim/types'
import Icon from '@/src/design-system/components/Icon'
import { fmtLength, lengthFromDisplay, lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
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
  /** B56.5 results per route, when the overlay is on. */
  clearances: SegmentClearance[] | null
  rule: ClearanceRule
  onPoint: (id: string, patch: Partial<SimPoint>) => void
  /** Turn a junction into a pick, drop, charger or parking point (named as a new one would be). */
  onConvert: (id: string, type: SimPointType) => void
  onPoints: (ids: string[], patch: Partial<SimPoint>) => void
  onCurve: (id: string, kind: 'spline' | 'straight') => void
  onObject: (id: string, patch: Partial<SimObject>) => void
  onRepeat: (id: string, count: number, stepFt: number, dir: { x: number; y: number }) => void
  onCopy: () => void
  onSegment: (id: string, patch: Partial<SimSegment>) => void
  onFlow: (id: string, patch: Partial<ProjectFlow>) => void
  onUnlink: (flowId: string) => void
  onDelete: () => void
}

/** Highest transfer height the project file accepts (simSchemas.ts). */
const MAX_HEIGHT_FT = 100

const DIRS = [{ id: 'r', label: '→', v: { x: 1, y: 0 } }, { id: 'l', label: '←', v: { x: -1, y: 0 } }, { id: 'd', label: '↓', v: { x: 0, y: 1 } }, { id: 'u', label: '↑', v: { x: 0, y: -1 } }] as const
const STATUS: Record<SegmentClearance['status'], string> = {
  clear: 'No object near', full: 'Full speed', capped: 'Below 1.2 m/s — B56.5 reduced clearance', violation: 'Blocked — under the minimum clearance',
}

export default function LayoutPanel(p: Props) {
  const len = (ft: number) => (isFinite(ft) ? fmtLength(ft, p.unitSystem, 1) : 'No route')
  const byId = useMemo(() => pointById(p.layout), [p.layout])
  const name = (id?: string) => (id && byId.get(id)?.name) || '—'
  const sel = p.selection
  const [repeat, setRepeat] = useState({ count: 6, step: 5, dir: 'r' as (typeof DIRS)[number]['id'] })
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
        <div className="sim-field-row">
          <Len u={p.unitSystem} label="Position x" ft={pt.x} signed onFt={x => x != null && p.onPoint(pt.id, { x })} />
          <Len u={p.unitSystem} label="y" ft={pt.y} signed onFt={y => y != null && p.onPoint(pt.id, { y })} />
        </div>
        {pt.type === 'junction' && (
          <label className="sim-field"><span>Turn into</span>
            <select value="" onChange={e => {
              const type = e.target.value as SimPointType
              if (type) p.onConvert(pt.id, type)
            }}>
              <option value="">A junction (route node)</option>
              <optgroup label="Flow points">{FLOW_POINT_TYPES.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
              <optgroup label="Vehicle points">{VEHICLE_POINT_TYPES.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
            </select>
          </label>
        )}
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
            <Len u={p.unitSystem} label="Transfer height" ft={pt.heightFt} max={MAX_HEIGHT_FT} onFt={heightFt => p.onPoint(pt.id, { heightFt })} />
            <div className="sim-field-row">
              <Len u={p.unitSystem} label="Footprint width" ft={pt.footprintFt?.w} onFt={w => p.onPoint(pt.id, { footprintFt: w && pt.footprintFt?.l ? { w, l: pt.footprintFt.l } : w ? { w, l: w } : undefined })} />
              <Len u={p.unitSystem} label="length" ft={pt.footprintFt?.l} onFt={l => p.onPoint(pt.id, { footprintFt: l && pt.footprintFt?.w ? { w: pt.footprintFt.w, l } : l ? { w: l, l } : undefined })} />
            </div>
          </>
        )}
        {pt.type !== 'junction' && (
          <details className="sim-more">
            <summary>Repeat or duplicate</summary>
            <div className="sim-field-row">
              <label className="sim-field"><span>How many</span>
                <input type="number" min={2} max={50} value={repeat.count} onChange={e => setRepeat({ ...repeat, count: Math.max(2, Math.min(50, Math.round(Number(e.target.value) || 2))) })} />
              </label>
              <Len u={p.unitSystem} label="Apart" ft={repeat.step} onFt={step => setRepeat({ ...repeat, step: step ?? 0 })} />
            </div>
            <Segmented options={DIRS.map(d => ({ id: d.id, label: d.label }))} value={repeat.dir} onChange={dir => setRepeat({ ...repeat, dir })} />
            <div className="sim-card-actions">
              <button type="button" className="btn ghost btn-sm" disabled={!(repeat.step > 0)}
                onClick={() => p.onRepeat(pt.id, repeat.count, repeat.step, DIRS.find(d => d.id === repeat.dir)!.v)}>Repeat ×{repeat.count}</button>
              <button type="button" className="link-btn" onClick={p.onCopy}>Duplicate (⌘C ⌘V)</button>
            </div>
          </details>
        )}
      </Panel>
    )
  }

  if (sel?.kind === 'points') {
    const pts = sel.ids.map(id => byId.get(id)).filter((q): q is SimPoint => !!q)
    const allFlow = pts.every(q => FLOW_POINT_TYPES.includes(q.type))
    const same = <K extends keyof SimPoint>(k: K) => (pts.every(q => q[k] === pts[0]?.[k]) ? pts[0]?.[k] : undefined)
    return (
      <Panel title={`${pts.length} points`} onDelete={p.onDelete}>
        {allFlow && (
          <>
            <div className="sim-field"><span>Role</span>
              <Segmented options={ROLE_OPTIONS} value={same('role') ?? ('' as never)} onChange={role => p.onPoints(sel.ids, { role })} />
            </div>
            <Len u={p.unitSystem} label="Transfer height" ft={same('heightFt')} max={MAX_HEIGHT_FT} onFt={heightFt => p.onPoints(sel.ids, { heightFt })} />
          </>
        )}
        <button type="button" className="link-btn" onClick={p.onCopy}>Duplicate (⌘C ⌘V)</button>
      </Panel>
    )
  }

  if (sel?.kind === 'object') {
    const o = (p.layout.objects ?? []).find(q => q.id === sel.id)
    if (!o) return null
    return (
      <Panel title={o.name || 'Object'} onDelete={p.onDelete}>
        <label className="sim-field"><span>Name</span>
          <input value={o.name ?? ''} maxLength={80} onChange={e => p.onObject(o.id, { name: e.target.value })} />
        </label>
        <div className="sim-field-row">
          <Len u={p.unitSystem} label="Width" ft={o.w} onFt={w => w && p.onObject(o.id, { w })} />
          <Len u={p.unitSystem} label="Depth" ft={o.h} onFt={h => h && p.onObject(o.id, { h })} />
        </div>
        <label className="sim-field"><span>Rotation (°)</span>
          <input type="number" step="any" value={o.rotationDeg ?? 0} onChange={e => p.onObject(o.id, { rotationDeg: Number(e.target.value) || 0 })} />
        </label>
      </Panel>
    )
  }

  if (sel?.kind === 'segment') {
    const s = p.layout.segments.find(q => q.id === sel.id)
    if (!s) return null
    const clr = p.clearances?.find(r => r.segId === s.id)
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
        <div className="sim-card-actions">
          {s.curve?.kind !== 'bezier' && <button type="button" className="link-btn" onClick={() => p.onCurve(s.id, 'spline')}>Make a spline</button>}
          {s.curve && <button type="button" className="link-btn" onClick={() => p.onCurve(s.id, 'straight')}>Straighten</button>}
        </div>
        {clr && (
          <section className={`sim-clr-card is-${clr.status}`}>
            <h4>B56.5 clearance</h4>
            <p className="sim-readout">{clr.tightestIn == null ? STATUS.clear : <><span className="num">{clr.tightestIn.toFixed(1)} in</span> tightest · {STATUS[clr.status]}</>}</p>
            {clr.twoLaneFits === false && (
              <p className="sim-warn-line">Two lanes do not fit here.
                <button type="button" className="btn ghost btn-sm" onClick={() => p.onSegment(s.id, { lane: 'single' })}>Make single-lane</button>
              </p>
            )}
          </section>
        )}
      </Panel>
    )
  }

  if (flow) {
    return (
      <Panel title="Flow">
        <p className="sim-readout">{name(flow.fromPointId)} → {name(flow.toPointId)} · <span className="num">{isFinite(flowFt) ? len(flow.distanceFt) : 'No route'}</span></p>
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

  // Nothing selected: the B56.5 rule and its tally while the overlay is on; otherwise no card.
  if (!p.clearances) return null
  return (
    <aside className="sim-card" aria-label="B56.5 clearance">
      <h3>B56.5 clearance</h3>
      <p className="sim-readout">
        {p.rule.lowSpeedIn} in per side below {units.distance.toMetric(p.rule.thresholdFps).toFixed(1)} m/s, {p.rule.fullSpeedIn} in at or above{p.rule.sharedBetweenVehicles ? ', shared between passing vehicles' : ''}.
        <span className="sim-source">Engineer rule — ANSI/ITSDF B56.5</span>
      </p>
      <p className="sim-readout">
        {p.clearances.filter(r => r.status === 'capped').length} slowed · {p.clearances.filter(r => r.status === 'violation').length} blocked
      </p>
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

/** A length field in the user's units (ft or m), stored in feet. */
function Len({ label, ft, max, u, signed, onFt }: { label: string; ft: number | undefined; max?: number; u: UnitSystem; signed?: boolean; onFt: (ft: number | undefined) => void }) {
  return (
    <label className="sim-field"><span>{label}</span>
      <span className="sim-input-unit">
        <input type="number" min={signed ? undefined : 0} step="any" value={ft == null ? '' : Math.round(lengthToDisplay(ft, u) * 100) / 100}
          onChange={e => onFt(e.target.value === '' ? undefined : Math.min(max ?? Infinity, Math.max(signed ? -Infinity : 0, lengthFromDisplay(Number(e.target.value), u))))} />
        <span>{units.distance.label(u)}</span>
      </span>
    </label>
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
