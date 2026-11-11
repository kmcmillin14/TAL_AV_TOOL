'use client'

// The inspector (spec v2 §8 / §5.7a, Milestone 6): what is selected — its name and actions, the few
// numbers that matter, Settings, and every assumption behind it one click further in Advanced
// (source chip, reset, one line of help). With nothing selected: the layout's totals.

import { useMemo, useState } from 'react'
import type { ClearanceRule, SegmentClearance } from '@/src/calc/sim/clearance'
import {
  FLOW_POINT_TYPES, pointById, routeDistanceFt, segmentLengthFt, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import type { SimLayout, SimObject, SimPoint, SimPointType, SimSegment } from '@/src/calc/sim/types'
import { fieldsFor, fieldPatch, fieldState, type SimFieldDef } from '@/src/lib/simFields'
import { fmtLength, lengthFromDisplay, lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { POINT_LABEL, ROLE_OPTIONS } from './labels'
import type { Selection } from './LayoutCanvas'
import type { ProjectFlow } from './useLayoutEditor'
import FieldRow from '../inspector/FieldRow'
import { ApproachArrows, Inspector, Section, Summary } from '../inspector/InspectorParts'

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
    const ctx = { point: pt }
    const row = (d: SimFieldDef) => (
      <FieldRow key={d.key} def={d} state={fieldState(d, ctx)} unitSystem={p.unitSystem}
        onChange={v => { const patch = fieldPatch(d, ctx, v); if ('point' in patch) p.onPoint(pt.id, patch.point) }} />
    )
    const [height, handshake, approach] = ['heightFt', 'handshakeSec', 'approachHeadingDeg'].map(f => fieldsFor('point').find(d => d.field === f)!)
    const flowsHere = p.flows.filter(f => f.fromPointId === pt.id || f.toPointId === pt.id)
    const routes = p.layout.segments.filter(q => q.a === pt.id || q.b === pt.id).length
    const isFlowPoint = FLOW_POINT_TYPES.includes(pt.type)
    const advancedOverrides = [handshake, approach].filter(d => fieldState(d, ctx).source === 'Override').length
    return (
      <Inspector title={pt.type === 'junction' ? 'Junction' : pt.name || POINT_LABEL[pt.type]} icon={pt.type} onCopy={pt.type === 'junction' ? undefined : p.onCopy} onDelete={p.onDelete}>
        <Summary items={[
          ['Type', pt.type === 'junction' ? 'Junction' : `${POINT_LABEL[pt.type]}${isFlowPoint ? ` · ${ROLE_OPTIONS.find(r => r.id === (pt.role ?? 'pick'))?.label}` : ''}`],
          ['Routes', routes || 'Not connected'],
          ...(isFlowPoint ? [['Flows', flowsHere.length ? `${flowsHere.length} · ${flowsHere.reduce((t, f) => t + (f.thruPerHr || 0), 0)}/h` : 'None'] as [string, string]] : []),
          ...(isFlowPoint ? [['Height', pt.heightFt ? fmtLength(pt.heightFt, p.unitSystem, 1) : 'Floor'] as [string, string]] : []),
        ]} />
        <Section title="Settings" open>
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
          {isFlowPoint && (
            <>
              <div className="sim-field"><span>Role</span>
                <Segmented options={ROLE_OPTIONS} value={pt.role ?? 'pick'} onChange={role => p.onPoint(pt.id, { role })} />
              </div>
              {row(height)}
            </>
          )}
        </Section>
        <Section title="Advanced" count={advancedOverrides}>
          {isFlowPoint && (
            <>
              {row(handshake)}
              <ApproachArrows state={fieldState(approach, ctx)} onChange={deg => p.onPoint(pt.id, { approachHeadingDeg: deg })} />
              <div className="sim-field-row">
                <Len u={p.unitSystem} label="Footprint width" ft={pt.footprintFt?.w} onFt={w => p.onPoint(pt.id, { footprintFt: w && pt.footprintFt?.l ? { w, l: pt.footprintFt.l } : w ? { w, l: w } : undefined })} />
                <Len u={p.unitSystem} label="length" ft={pt.footprintFt?.l} onFt={l => p.onPoint(pt.id, { footprintFt: l && pt.footprintFt?.w ? { w: pt.footprintFt.w, l } : l ? { w: l, l } : undefined })} />
              </div>
            </>
          )}
          <div className="sim-field-row">
            <Len u={p.unitSystem} label="Position x" ft={pt.x} signed onFt={x => x != null && p.onPoint(pt.id, { x })} />
            <Len u={p.unitSystem} label="y" ft={pt.y} signed onFt={y => y != null && p.onPoint(pt.id, { y })} />
          </div>
        </Section>
        {pt.type !== 'junction' && (
          <Section title="Repeat">
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
            </div>
          </Section>
        )}
      </Inspector>
    )
  }

  if (sel?.kind === 'points') {
    const pts = sel.ids.map(id => byId.get(id)).filter((q): q is SimPoint => !!q)
    const allFlow = pts.every(q => FLOW_POINT_TYPES.includes(q.type))
    const same = <K extends keyof SimPoint>(k: K) => (pts.every(q => q[k] === pts[0]?.[k]) ? pts[0]?.[k] : undefined)
    return (
      <Inspector title={`${pts.length} points`} onCopy={p.onCopy} onDelete={p.onDelete}>
        {allFlow && (
          <>
            <div className="sim-field"><span>Role</span>
              <Segmented options={ROLE_OPTIONS} value={same('role') ?? ('' as never)} onChange={role => p.onPoints(sel.ids, { role })} />
            </div>
            <Len u={p.unitSystem} label="Transfer height" ft={same('heightFt')} max={MAX_HEIGHT_FT} onFt={heightFt => p.onPoints(sel.ids, { heightFt })} />
          </>
        )}
      </Inspector>
    )
  }

  if (sel?.kind === 'object') {
    const o = (p.layout.objects ?? []).find(q => q.id === sel.id)
    if (!o) return null
    return (
      <Inspector title={o.name || 'Object'} onDelete={p.onDelete}>
        <Summary items={[['Width', fmtLength(o.w, p.unitSystem, 1)], ['Depth', fmtLength(o.h, p.unitSystem, 1)], ['Rotation', `${Math.round(o.rotationDeg ?? 0)}°`]]} />
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
      </Inspector>
    )
  }

  if (sel?.kind === 'segment') {
    const s = p.layout.segments.find(q => q.id === sel.id)
    if (!s) return null
    const clr = p.clearances?.find(r => r.segId === s.id)
    const ctx = { segment: s }, speed = fieldsFor('route')[0]
    return (
      <Inspector title="Route" onDelete={p.onDelete}>
        <Summary items={[
          ['Length', len(segmentLengthFt(p.layout, s, byId))],
          ['Direction', s.dir === 'two' ? 'Two-way' : 'One-way'],
          ['Lanes', (s.lane ?? 'two') === 'two' ? 'Two' : 'One'],
          ['Clearance', clr?.tightestIn != null ? `${clr.tightestIn.toFixed(1)} in` : clr ? 'Clear' : 'B56.5 off'],
        ]} />
        <Section title="Settings" open>
          <div className="sim-field"><span>Direction</span>
            <Segmented value={s.dir} onChange={dir => p.onSegment(s.id, { dir })}
              options={[{ id: 'two', label: 'Two-way' }, { id: 'ab', label: `→ ${name(s.b)}` }, { id: 'ba', label: `→ ${name(s.a)}` }]} />
          </div>
          <div className="sim-field"><span>Lanes</span>
            <Segmented value={s.lane ?? 'two'} onChange={lane => p.onSegment(s.id, { lane })}
              options={[{ id: 'two', label: 'Two-lane (passing)' }, { id: 'single', label: 'Single-lane' }]} />
          </div>
          <FieldRow def={speed} state={fieldState(speed, ctx)} unitSystem={p.unitSystem}
            onChange={v => { const patch = fieldPatch(speed, ctx, v); if ('segment' in patch) p.onSegment(s.id, patch.segment) }} />
        </Section>
        <Section title="Advanced">
          <div className="sim-card-actions">
            {s.curve?.kind !== 'bezier' && <button type="button" className="link-btn" onClick={() => p.onCurve(s.id, 'spline')}>Make a spline</button>}
            {s.curve && <button type="button" className="link-btn" onClick={() => p.onCurve(s.id, 'straight')}>Straighten</button>}
          </div>
          {clr ? (
            <section className={`sim-clr-card is-${clr.status}`}>
              <h4>B56.5 clearance</h4>
              <p className="sim-readout">{clr.tightestIn == null ? STATUS.clear : <><span className="num">{clr.tightestIn.toFixed(1)} in</span> tightest · {STATUS[clr.status]}</>}</p>
              {clr.twoLaneFits === false && (
                <p className="sim-warn-line">Two lanes do not fit here.
                  <button type="button" className="btn ghost btn-sm" onClick={() => p.onSegment(s.id, { lane: 'single' })}>Make single-lane</button>
                </p>
              )}
            </section>
          ) : <p className="sim-frow-help">Turn on B56.5 (top right) to see this route’s clearance.</p>}
        </Section>
      </Inspector>
    )
  }

  if (flow) {
    return (
      <Inspector title="Flow">
        <Summary items={[
          ['From → to', `${name(flow.fromPointId)} → ${name(flow.toPointId)}`],
          ['Moves/h', flow.thruPerHr || 0],
          ['Distance', isFinite(flowFt) ? len(flow.distanceFt) : 'No route'],
          ['Vehicle', p.vehicles.find(v => v.id === flow.vehicleId)?.name ?? '—'],
        ]} />
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
      </Inspector>
    )
  }

  // Nothing selected: the layout's totals (and the B56.5 rule while its overlay is on).
  const linkedFlows = p.flows.filter(f => f.fromPointId && f.toPointId).length
  const totalFt = p.layout.segments.reduce((t, q) => t + segmentLengthFt(p.layout, q, byId), 0)
  return (
    <aside className="sim-panel is-empty" aria-label="Layout">
      <div className="sim-panel-head"><h3>Nothing selected</h3></div>
      <Summary items={[
        ['Points', p.layout.points.filter(q => q.type !== 'junction').length],
        ['Routes', `${p.layout.segments.length} · ${fmtLength(totalFt, p.unitSystem)}`],
        ['Flows on layout', `${linkedFlows} of ${p.flows.length}`],
        ['Objects', (p.layout.objects ?? []).length],
      ]} />
      <p className="sim-frow-help">Click a point, route, object or flow to see its settings.</p>
      {p.clearances && (
        <Section title="B56.5 clearance" open>
          <p className="sim-readout">
            {p.rule.lowSpeedIn} in per side below {units.distance.toMetric(p.rule.thresholdFps).toFixed(1)} m/s, {p.rule.fullSpeedIn} in at or above{p.rule.sharedBetweenVehicles ? ', shared between passing vehicles' : ''}.
            <span className="sim-source">Engineer rule — ANSI/ITSDF B56.5</span>
          </p>
          <p className="sim-readout">
            {p.clearances.filter(r => r.status === 'capped').length} slowed · {p.clearances.filter(r => r.status === 'violation').length} blocked
          </p>
        </Section>
      )}
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
