'use client'

// The inspector (spec v2 §8 / §5.7a, Milestone 6): what is selected — its name and actions, the few
// numbers that matter, Settings, and every assumption behind it one click further in Advanced
// (source chip, reset, one line of help). With nothing selected: the layout's totals and a navigator
// (stations and routes — a click selects and centres).

import { useEffect, useMemo, useRef, useState } from 'react'
import { laneWidthFt, suggestedWidthFt, type ClearanceRule, type SegmentClearance } from '@/src/calc/sim/clearance'
import { highwayLanes, highwayStops, withHighways } from '@/src/calc/sim/highways'
import { linkedFlows } from '@/src/calc/sim/readiness'
import {
  FLOW_POINT_TYPES, flowTargets, pointById, routeDistanceFt, segmentLengthFt, VEHICLE_POINT_TYPES,
} from '@/src/calc/sim/layoutEdit'
import type { RackGeometry } from '@/src/calc/sim/racks'
import type { ChargerStat } from '@/src/calc/sim/results'
import type { SimHighway, SimLayout, SimObject, SimPoint, SimPointType, SimSegment } from '@/src/calc/sim/types'
import { fieldDef, fieldsFor, fieldPatch, fieldState, type SimFieldDef } from '@/src/lib/simFields'
import { fmtLength, lengthFromDisplay, lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { POINT_LABEL, ROLE_OPTIONS } from './labels'
import { segMid, type Selection, type XY } from './LayoutCanvas'
import type { ProjectFlow } from './useLayoutEditor'
import FieldRow from '../inspector/FieldRow'
import { ApproachArrows, Folds, Inspector, Section, Summary, Tile, TileInput, Tiles, type Tone } from '../inspector/InspectorParts'

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
  onHighway: (id: string, patch: Partial<SimHighway>) => void
  /** Several highways at once (lasso): each gets its own change. */
  onHighways: (ids: string[], patch: (h: SimHighway) => Partial<SimHighway>, what: string) => void
  /** The widest vehicle or payload the run drives, ft — a highway's suggested width (B56.5). */
  envelopeFt: number
  /** Each highway's worst B56.5 status (its derived routes' clearances). */
  highwayStatus: Map<string, SegmentClearance['status']>
  /** Each flow's simulation vehicle, the types it can run as, and choosing one (simulation only). */
  simVehicleOf: Map<string, string | undefined>
  vehicleTypes: Vehicle[]
  onFlowVehicle?: (flowId: string, vehicleId: string) => void
  onRepeat: (id: string, count: number, stepFt: number, dir: { x: number; y: number }) => void
  onCopy: () => void
  onSegment: (id: string, patch: Partial<SimSegment>) => void
  onFlow: (id: string, patch: Partial<ProjectFlow>) => void
  onUnlink: (flowId: string) => void
  onDelete: () => void
  /** Navigator: select this object and centre the view on it. */
  onFocus: (sel: NonNullable<Selection>, at: XY) => void
  /** "Add flow to…": link a new flow Pick → Drop. */
  onAddFlow: (from: string, to: string) => void
  /** A flow just linked in the editor: open it with Moves per hour focused (once — then this is called). */
  focusRateOf?: string | null
  onRateFocused?: () => void
  /** Back to the step's list (clears the selection), and what that list is called. */
  onBack: () => void
  backLabel: string
  /** Open a material flow's card. */
  onSelectFlow: (id: string) => void
  /** The selected rack's sizes and the lowest reach among the vehicles that work it. */
  rack: { id: string; g: RackGeometry; reach: { name: string; ft: number } | null } | null
  /** Arm placing a pick / drop point (from a highway's card). */
  onAddPoint: () => void
  /** Chargers: how many the static model suggests, and each one's day in the last run (null: no current run). */
  chargers: { suggested: number; stats: Record<string, ChargerStat> | null }
}


const DIRS = [{ id: 'r', label: '→', v: { x: 1, y: 0 } }, { id: 'l', label: '←', v: { x: -1, y: 0 } }, { id: 'd', label: '↓', v: { x: 0, y: 1 } }, { id: 'u', label: '↑', v: { x: 0, y: -1 } }] as const
const STATUS: Record<SegmentClearance['status'], string> = {
  clear: 'No object near', full: 'Full speed', capped: 'Below 1.2 m/s — B56.5 reduced clearance', violation: 'Blocked — under the minimum clearance',
}

/** A length as shown in a field or tile: the user's units, two decimals. */
const shownLen = (ft: number, u: UnitSystem) => Math.round(lengthToDisplay(ft, u) * 100) / 100
/** A point's dot: its kind and role colour. */
const dotClass = (q: SimPoint) => `sim-dot is-placed kind-${q.type}${q.role ? ` role-${q.role}` : ''}`

/** A route's or highway's B56.5 status as its card's chip. */
const CLEAR_CHIP: Record<SegmentClearance['status'], { label: string; tone: Tone }> = {
  clear: { label: 'Full speed', tone: 'good' }, full: { label: 'Full speed', tone: 'good' },
  capped: { label: 'Slowed', tone: 'warn' }, violation: { label: 'Blocked', tone: 'bad' },
}

/** Point types a point can be switched to here — not a rack, which is drawn with its own tool. */
const CONVERTIBLE = FLOW_POINT_TYPES.filter(t => t !== 'rack')

export default function LayoutPanel(p: Props) {
  const len = (ft: number) => (isFinite(ft) ? fmtLength(ft, p.unitSystem, 1) : 'No route')
  const byId = useMemo(() => pointById(p.layout), [p.layout])
  /** With the highways' routes, so a point on a highway counts as connected. */
  const expanded = useMemo(() => withHighways(p.layout), [p.layout])
  const name = (id?: string) => (id && byId.get(id)?.name) || '—'
  const sel = p.selection
  const [repeat, setRepeat] = useState({ count: 6, step: 5, dir: 'r' as (typeof DIRS)[number]['id'] })
  // Navigator rows (stations; routes with their length and middle) and the totals, once per layout.
  const nav = useMemo(() => {
    const routes = p.layout.segments.flatMap(q => {
      const a = byId.get(q.a), b = byId.get(q.b)
      return a && b ? [{ q, a, b, ft: segmentLengthFt(p.layout, q, byId), mid: segMid(q, a, b) }] : []
    })
    return { stations: p.layout.points.filter(q => q.type !== 'junction'), routes, totalFt: routes.reduce((t, r) => t + r.ft, 0) }
  }, [p.layout, byId])
  const flow = sel?.kind === 'flow' ? p.flows.find(q => q.id === sel.id) : undefined
  const fromId = flow?.fromPointId, toId = flow?.toPointId
  const flowFt = useMemo(() => (fromId && toId ? routeDistanceFt(p.layout, fromId, toId) : Infinity), [p.layout, fromId, toId])

  // A flow just linked opens with Moves per hour focused — a moment after the click that made it, which
  // otherwise takes the focus back to the canvas.
  const rateRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!p.focusRateOf || p.focusRateOf !== flow?.id) return
    const t = window.setTimeout(() => { rateRef.current?.focus(); p.onRateFocused?.() })
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusRateOf, flow?.id])

  // "Add flow to…" for the selected Pick or Drop point: what it can link to, nearest first.
  const links = useMemo(() => {
    const t = sel?.kind === 'point' ? flowTargets(p.layout, sel.id, p.flows) : null
    return t && { end: t.end, reachable: t.targets.filter(x => x.ok) }
  }, [sel, p.layout, p.flows])

  if (sel?.kind === 'point') {
    const pt = byId.get(sel.id)
    if (!pt) return null
    const ctx = { point: pt }
    const set = (d: SimFieldDef, v: number | string | boolean | undefined) => { const patch = fieldPatch(d, ctx, v); if ('point' in patch) p.onPoint(pt.id, patch.point) }
    // Every registry field for points, by level: Settings with the point, Advanced one click on.
    // The approach direction uses arrows in place of a number box (same row, chip and reset).
    const row = (d: SimFieldDef) => (
      <FieldRow key={d.key} def={d} state={fieldState(d, ctx)} unitSystem={p.unitSystem} onChange={v => set(d, v)}>
        {d.field === 'approachHeadingDeg' ? <ApproachArrows value={typeof pt.approachHeadingDeg === 'number' ? pt.approachHeadingDeg : null} onChange={v => set(d, v)} /> : undefined}
      </FieldRow>
    )
    const flowsHere = p.flows.filter(f => f.fromPointId === pt.id || f.toPointId === pt.id)
    const routes = expanded.segments.filter(q => q.a === pt.id || q.b === pt.id).length
    const isFlowPoint = FLOW_POINT_TYPES.includes(pt.type)
    const advancedOverrides = fieldsFor('point', 'advanced').filter(d => fieldState(d, ctx).source === 'Override').length
    const moves = flowsHere.reduce((t, f) => t + (f.thruPerHr || 0), 0)
    const role = isFlowPoint ? ROLE_OPTIONS.find(r => r.id === (pt.role ?? 'pick'))?.label : undefined
    const rack = pt.rack && p.rack?.id === pt.id ? p.rack : null
    const over = rack?.reach && rack.g.pallet ? rack.g.topBeamFt > rack.reach.ft + 1e-9 : false
    const chip: Tone = !routes ? 'warn' : over ? 'bad' : 'good'
    return (
      <Inspector title={pt.type === 'junction' ? 'Junction' : pt.name || POINT_LABEL[pt.type]} icon={pt.type} back={p.backLabel} onBack={p.onBack}
        chip={pt.type === 'junction' ? null : { label: !routes ? 'Needs a route' : over ? 'Out of reach' : rack?.reach ? 'In reach' : 'Connected', tone: chip }}
        sub={[POINT_LABEL[pt.type], role, `${routes || 'no'} route${routes === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
        onCopy={pt.type === 'junction' ? undefined : p.onCopy} onDelete={p.onDelete}>
        {isFlowPoint && (
          <Tiles>
            {rack
              ? <Tile label="long × high" value={`${rack.g.long} × ${pt.rack!.levels}`} />
              : <Tile label="moves / h" value={moves} />}
            {rack
              ? <Tile label="positions" value={rack.g.positions} />
              : <TileInput label="height" placeholder="Floor" unit={units.distance.label(p.unitSystem)} max={lengthToDisplay(fieldDef('point.heightFt').max ?? Infinity, p.unitSystem)}
                  value={pt.heightFt ? shownLen(pt.heightFt, p.unitSystem) : undefined}
                  onChange={v => p.onPoint(pt.id, { heightFt: v ? lengthFromDisplay(v, p.unitSystem) : undefined })} />}
            <Tile label="flows" value={flowsHere.length} unit={rack ? `· ${moves}/h` : undefined} />
          </Tiles>
        )}
        {pt.type === 'charger' && (() => {
          // The charger card (owner, 2026-11-22): its day in the last run; before one, placed against suggested.
          const st = p.chargers.stats?.[pt.id]
          return st
            ? <Tiles>
                <Tile label="docks/day" value={st.docksPerDay} />
                <Tile label="charging/day" value={st.chargingHPerDay} unit="h" />
                <Tile label="wait/day" value={st.waitMinPerDay} unit="min" />
              </Tiles>
            : <Tiles>
                <Tile label="placed" value={p.layout.points.filter(q => q.type === 'charger').length} />
                <Tile label="suggested" value={p.chargers.suggested} />
                <Tile label="last run" value="—" />
              </Tiles>
        })()}
        {rack?.reach && rack.g.pallet && (
          <div className="sim-reach" aria-label="Top beam against the vehicle's reach">
            <div className={`sim-bar${over ? ' is-bad' : ''}`}><i style={{ width: `${Math.min(100, (rack.g.topBeamFt / Math.max(rack.reach.ft, rack.g.topBeamFt)) * 100)}%` }} /></div>
            <div className="sim-bar-meta num"><span>Top beam {len(rack.g.topBeamFt)}</span><span>{rack.reach.name} reach {len(rack.reach.ft)}</span></div>
          </div>
        )}
        <Folds>
          {isFlowPoint && (
            <Section fold title="Material flows" status={flowsHere.length ? `${flowsHere.length} · ${moves}/h` : links ? `${links.reachable.length} reachable` : 'None'}>
              {flowsHere.length > 0 && (
                <ul className="sim-routes">
                  {flowsHere.map(f => (
                    <li key={f.id}><button type="button" onClick={() => p.onSelectFlow(f.id)}>
                      <span className="sim-route-ends"><span>{name(f.fromPointId)}</span><span>{name(f.toPointId)}</span></span>
                      <span className="sim-bar is-route"><i /></span>
                      <span className="sim-bar-meta num"><span>{f.thruPerHr || 0} / h</span><span>{len(f.distanceFt ?? Infinity)}</span></span>
                    </button></li>
                  ))}
                </ul>
              )}
              {links && (links.reachable.length
                ? <>
                    <h4>Add material flow to</h4>
                    <ul className="sim-nav">
                      {links.reachable.map(t => (
                        <li key={t.id}><button type="button" onClick={() => p.onAddFlow(t.pick, t.drop)}>
                          <span className="nm">{t.pick === pt.id ? '→ ' : '← '}{name(t.id)}</span><span className="meta num">{len(t.distanceFt!)}</span>
                        </button></li>
                      ))}
                    </ul>
                  </>
                : <p className="sim-card-note">No {links.end} point it can link to yet.</p>)}
            </Section>
          )}
          <Section fold title="Settings">
            {pt.type === 'junction' && (
              <label className="sim-field"><span>Turn into</span>
                <select value="" onChange={e => {
                  const type = e.target.value as SimPointType
                  if (type) p.onConvert(pt.id, type)
                }}>
                  <option value="">A junction (route node)</option>
                  <optgroup label="Material flow points">{CONVERTIBLE.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
                  <optgroup label="Vehicle points">{VEHICLE_POINT_TYPES.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
                </select>
              </label>
            )}
            {pt.type !== 'junction' && (
              <>
                <label className="sim-field"><span>Name</span>
                  <input value={pt.name ?? ''} maxLength={80} onChange={e => p.onPoint(pt.id, { name: e.target.value })} />
                </label>
                {/* A rack is drawn with the Rack tool and stays a rack (its bar sets the rest). */}
                {!pt.rack && <label className="sim-field"><span>Equipment</span>
                  <select value={pt.type} onChange={e => {
                    const type = e.target.value as SimPointType
                    p.onPoint(pt.id, { type, role: FLOW_POINT_TYPES.includes(type) ? pt.role ?? 'pick' : undefined })
                  }}>
                    <optgroup label="Material flow points">{CONVERTIBLE.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
                    <optgroup label="Vehicle points">{VEHICLE_POINT_TYPES.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}</optgroup>
                  </select>
                </label>}
              </>
            )}
            {isFlowPoint && (
              <>
                <div className="sim-field"><span>Role</span>
                  <Segmented options={ROLE_OPTIONS} value={pt.role ?? 'pick'} onChange={role => p.onPoint(pt.id, { role })} />
                </div>
                {fieldsFor('point', 'settings').map(row)}
              </>
            )}
          </Section>
          <Section fold title="Advanced" count={advancedOverrides}>
            {isFlowPoint && (
              <>
                {fieldsFor('point', 'advanced').map(row)}
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
            {pt.type !== 'junction' && (
              <>
                <h4>Repeat</h4>
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
              </>
            )}
          </Section>
        </Folds>
      </Inspector>
    )
  }

  if (sel?.kind === 'points') {
    const pts = sel.ids.map(id => byId.get(id)).filter((q): q is SimPoint => !!q)
    const allFlow = pts.every(q => FLOW_POINT_TYPES.includes(q.type))
    const same = <K extends keyof SimPoint>(k: K) => (pts.every(q => q[k] === pts[0]?.[k]) ? pts[0]?.[k] : undefined)
    return (
      <Inspector title={`${pts.length} points`} back={p.backLabel} onBack={p.onBack} onCopy={p.onCopy} onDelete={p.onDelete}>
        {allFlow && (
          <>
            <div className="sim-field"><span>Role</span>
              <Segmented options={ROLE_OPTIONS} value={same('role') ?? ('' as never)} onChange={role => p.onPoints(sel.ids, { role })} />
            </div>
            <Len u={p.unitSystem} label="Transfer height" ft={same('heightFt')} max={fieldDef('point.heightFt').max} onFt={heightFt => p.onPoints(sel.ids, { heightFt })} />
          </>
        )}
      </Inspector>
    )
  }

  if (sel?.kind === 'object') {
    const o = (p.layout.objects ?? []).find(q => q.id === sel.id)
    if (!o) return null
    return (
      <Inspector title={o.name || 'Object'} sub="Wall, column or guard" back={p.backLabel} onBack={p.onBack} onDelete={p.onDelete}>
        <Tiles>
          <TileInput label="width" unit={units.distance.label(p.unitSystem)} value={shownLen(o.w, p.unitSystem)} onChange={v => v && p.onObject(o.id, { w: lengthFromDisplay(v, p.unitSystem) })} />
          <TileInput label="depth" unit={units.distance.label(p.unitSystem)} value={shownLen(o.h, p.unitSystem)} onChange={v => v && p.onObject(o.id, { h: lengthFromDisplay(v, p.unitSystem) })} />
          <TileInput label="rotation" unit="°" max={360} value={Math.round(o.rotationDeg ?? 0)} onChange={v => p.onObject(o.id, { rotationDeg: v ?? 0 })} />
        </Tiles>
        <Folds>
          <Section fold title="Settings">
            <label className="sim-field"><span>Name</span>
              <input value={o.name ?? ''} maxLength={80} onChange={e => p.onObject(o.id, { name: e.target.value })} />
            </label>
          </Section>
        </Folds>
      </Inspector>
    )
  }

  if (sel?.kind === 'highways') {
    const hs = (p.layout.highways ?? []).filter(h => sel.ids.includes(h.id))
    if (!hs.length) return null
    const ids = hs.map(h => h.id), all = (patch: Partial<SimHighway>) => p.onHighways(ids, () => patch, Object.keys(patch).join())
    const same = <K extends keyof SimHighway>(k: K) => (hs.every(h => h[k] === hs[0]?.[k]) ? hs[0]?.[k] : undefined)
    const oneWay = hs.filter(h => h.dir !== 'two').length
    const suggestedOf = (h: SimHighway) => suggestedWidthFt({ dir: h.dir, lane: h.lane }, p.envelopeFt, p.rule)
    const offSuggested = hs.filter(h => Math.abs(h.widthFt - suggestedOf(h)) > 0.05).length
    // The worst B56.5 status among them — only once a vehicle drives the layout, and only if each has one.
    const sts = p.envelopeFt > 0 ? hs.map(h => p.highwayStatus.get(h.id)) : []
    const worst = sts.find(s => s === 'violation') ?? sts.find(s => s === 'capped')
    return (
      <Inspector title={`${hs.length} highways`} back={p.backLabel} onBack={p.onBack} onDelete={p.onDelete}>
        <Summary items={[
          ['Overall length', len(hs.reduce((a, h) => a + h.lengthFt, 0))],
          ['One-way', `${oneWay} of ${hs.length}`],
          ['Width', same('widthFt') != null ? len(same('widthFt')!) : 'Mixed'],
          ['B56.5', worst ? <span className={`sim-hw-status is-${CLEAR_CHIP[worst].tone}`}>{STATUS[worst].split(' — ')[0]}</span> : sts.length && sts.every(Boolean) ? 'Full speed' : '—'],
        ]} />
        <Section title="Change all" open>
          <label className="sim-field"><span>Direction</span>
            <Segmented options={[{ id: 'two', label: 'Two-way' }, { id: 'ab', label: 'Start → end' }, { id: 'ba', label: 'End → start' }]} value={same('dir') ?? ('' as never)} onChange={dir => all({ dir })} />
          </label>
          {hs.every(h => h.dir === 'two') && (
            <label className="sim-field"><span>Lanes</span>
              <Segmented options={[{ id: 'two', label: 'Two lanes' }, { id: 'single', label: 'Single lane' }]} value={hs.every(h => (h.lane ?? 'two') === (hs[0].lane ?? 'two')) ? hs[0].lane ?? 'two' : ('' as never)} onChange={lane => all({ lane })} />
            </label>
          )}
          <Len u={p.unitSystem} label="Width" ft={same('widthFt')} max={200} onFt={w => w && all({ widthFt: w })} />
          {offSuggested > 0 && (
            <div className="sim-hw-suggest">
              <span>{offSuggested} not at the suggested width</span>
              <button type="button" className="btn btn-sm ghost" onClick={() => p.onHighways(ids, h => ({ widthFt: suggestedOf(h) }), 'suggested')}>Use suggested</button>
            </div>
          )}
        </Section>
      </Inspector>
    )
  }

  if (sel?.kind === 'highway') {
    const h = (p.layout.highways ?? []).find(q => q.id === sel.id)
    if (!h) return null
    const set = (patch: Partial<SimHighway>) => p.onHighway(h.id, patch)
    const kind = { dir: h.dir, lane: h.lane }, env = p.envelopeFt
    // Suggested width: the envelope plus the B56.5 clearance per side at full speed (shared between two
    // lanes). The status is the run's own clearance check on the highway's routes.
    const suggested = suggestedWidthFt(kind, env, p.rule)
    const twoLanes = highwayLanes(h) === 2
    const inch = (ft: number) => { const i = ft * 12; return p.unitSystem === 'metric' ? `${Math.round(units.dimension.toMetric(i))} mm` : `${Math.round(i * 10) / 10} in` }
    const c = p.rule.fullSpeedIn / 12
    const working = env > 0
      ? (twoLanes ? `2 × ${inch(env)} envelope + ${p.rule.sharedBetweenVehicles ? 3 : 4} × ${inch(c)}` : `${inch(env)} envelope + 2 × ${inch(c)}`) + ` = ${inch(laneWidthFt(kind, env, p.rule))}`
      : 'No vehicle drives it yet — the default aisle'
    const st = env > 0 ? p.highwayStatus.get(h.id) : undefined
    const status = st ? { word: st === 'clear' ? STATUS.full : STATUS[st], tone: CLEAR_CHIP[st].tone } : null
    const stops = highwayStops(p.layout, h.id, expanded).flatMap(q => { const pt = byId.get(q.id); return pt ? [{ pt, t: q.t }] : [] })
    const lanes = twoLanes ? 2 : 1
    return (
      <Inspector title={h.name || 'Highway'} back={p.backLabel} onBack={p.onBack} onDelete={p.onDelete}
        chip={st ? CLEAR_CHIP[st] : null}
        sub={`${h.dir === 'two' ? 'Two-way' : 'One-way'} · ${lanes} lane${lanes === 1 ? '' : 's'}`}>
        <div className="sim-strip" aria-label={`${stops.length} stops along it`}>
          <span className="sim-strip-lane" />
          {h.dir !== 'two' && <span className="sim-strip-dir" aria-hidden="true">{h.dir === 'ab' ? '→' : '←'}</span>}
          {stops.map(({ pt, t }) => <span key={pt.id} className={dotClass(pt)} style={{ left: `${t * 100}%` }} title={pt.name} />)}
        </div>
        <Tiles>
          <TileInput label="width" unit={units.distance.label(p.unitSystem)} value={shownLen(h.widthFt, p.unitSystem)} max={lengthToDisplay(200, p.unitSystem)}
            onChange={v => v && set({ widthFt: lengthFromDisplay(v, p.unitSystem) })} />
          <Tile label="long" value={len(h.lengthFt)} />
          <Tile label="stops" value={stops.length} />
        </Tiles>
        <button type="button" className="btn ghost btn-sm sim-dcard-act" onClick={p.onAddPoint}>Add pick / drop point here</button>
        <Folds>
          <Section fold title="Stops" status={stops.length || 'None'}>
            {stops.length
              ? <ul className="sim-nav">
                  {stops.map(({ pt }) => (
                    <li key={pt.id}><button type="button" onClick={() => p.onFocus({ kind: 'point', id: pt.id }, pt)}>
                      <span className={dotClass(pt)} /><span className="nm">{pt.name || POINT_LABEL[pt.type]}</span>
                      <span className="meta num">{pt.rack ? 'Rack' : pt.heightFt ? len(pt.heightFt) : 'Floor'}</span>
                    </button></li>
                  ))}
                </ul>
              : <p className="sim-card-note">Nothing on this highway yet.</p>}
          </Section>
          <Section fold title="Settings">
            <label className="sim-field"><span>Name</span>
              <input value={h.name ?? ''} maxLength={80} onChange={e => set({ name: e.target.value })} />
            </label>
            <label className="sim-field"><span>Direction</span>
              <Segmented options={[{ id: 'two', label: 'Two-way' }, { id: 'ab', label: 'Start → end' }, { id: 'ba', label: 'End → start' }]} value={h.dir} onChange={dir => set({ dir })} />
            </label>
            {h.dir === 'two' && (
              <label className="sim-field"><span>Lanes</span>
                <Segmented options={[{ id: 'two', label: 'Two lanes' }, { id: 'single', label: 'Single lane' }]} value={h.lane ?? 'two'} onChange={lane => set({ lane })} />
              </label>
            )}
            <div className="sim-hw-suggest">
              <span>Suggested width <b className="num">{len(suggested)}</b> — {working}</span>
              {Math.abs(h.widthFt - suggested) > 0.05 && <button type="button" className="btn btn-sm ghost" onClick={() => set({ widthFt: suggested })}>Use suggested</button>}
            </div>
            {status && status.tone !== 'good' && <p className={`sim-hw-status is-${status.tone}`}>{status.word}</p>}
          </Section>
          <Section fold title="Advanced">
            <Len u={p.unitSystem} label="Length" ft={h.lengthFt} max={10000} onFt={l => l && l >= 2 && set({ lengthFt: l })} />
            <label className="sim-field"><span>Angle (°)</span>
              <input type="number" step="any" value={Math.round(h.angleDeg * 10) / 10} onChange={e => set({ angleDeg: Number(e.target.value) || 0 })} />
            </label>
            <div className="sim-field-row">
              <Len u={p.unitSystem} label="Centre x" ft={h.x} signed onFt={x => x != null && set({ x })} />
              <Len u={p.unitSystem} label="Centre y" ft={h.y} signed onFt={y => y != null && set({ y })} />
            </div>
          </Section>
        </Folds>
      </Inspector>
    )
  }

  if (sel?.kind === 'segment') {
    const s = p.layout.segments.find(q => q.id === sel.id)
    if (!s) return null
    const clr = p.clearances?.find(r => r.segId === s.id)
    const ctx = { segment: s }
    return (
      <Inspector title={`${name(s.a)} ${s.dir === 'two' ? '↔' : s.dir === 'ab' ? '→' : '←'} ${name(s.b)}`} back={p.backLabel} onBack={p.onBack} onDelete={p.onDelete}
        chip={clr ? CLEAR_CHIP[clr.status] : null}
        sub={`Route · ${s.dir === 'two' ? 'Two-way' : 'One-way'}`}>
        <Tiles>
          <Tile label="long" value={len(segmentLengthFt(p.layout, s, byId))} />
          <Tile label="lanes" value={(s.lane ?? 'two') === 'two' ? 2 : 1} />
          <Tile label="tightest" value={clr?.tightestIn != null ? `${clr.tightestIn.toFixed(1)} in` : '—'} />
        </Tiles>
        <Folds>
          <Section fold title="Settings">
            <div className="sim-field"><span>Direction</span>
              <Segmented value={s.dir} onChange={dir => p.onSegment(s.id, { dir })}
                options={[{ id: 'two', label: 'Two-way' }, { id: 'ab', label: `→ ${name(s.b)}` }, { id: 'ba', label: `→ ${name(s.a)}` }]} />
            </div>
            <div className="sim-field"><span>Lanes</span>
              <Segmented value={s.lane ?? 'two'} onChange={lane => p.onSegment(s.id, { lane })}
                options={[{ id: 'two', label: 'Two-lane (passing)' }, { id: 'single', label: 'Single-lane' }]} />
            </div>
            {fieldsFor('route', 'settings').map(d => (
              <FieldRow key={d.key} def={d} state={fieldState(d, ctx)} unitSystem={p.unitSystem}
                onChange={v => { const patch = fieldPatch(d, ctx, v); if ('segment' in patch) p.onSegment(s.id, patch.segment) }} />
            ))}
          </Section>
          <Section fold title="Advanced">
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
            ) : null}
          </Section>
        </Folds>
      </Inspector>
    )
  }

  if (flow) {
    const simVid = p.simVehicleOf.get(flow.id)
    const from = byId.get(flow.fromPointId ?? ''), to = byId.get(flow.toPointId ?? '')
    const height = (q?: SimPoint) => (q?.rack ? 'rack' : q?.heightFt ? len(q.heightFt) : 'floor')
    const routed = isFinite(flowFt)
    return (
      <Inspector title={`${name(flow.fromPointId)} → ${name(flow.toPointId)}`} back={p.backLabel} onBack={p.onBack}
        chip={from && to ? { label: routed ? 'Routed' : 'No route', tone: routed ? 'good' : 'bad' } : { label: 'Not on the map', tone: 'warn' }}
        sub={p.vehicles.find(v => v.id === simVid)?.name ?? 'No vehicle'}>
        {from && to && (
          <div className="sim-route">
            <span className="sim-route-ends"><span>{from.name}<small>pick · {height(from)}</small></span><span>{to.name}<small>drop · {height(to)}</small></span></span>
            <span className={`sim-bar is-route${routed ? '' : ' is-bad'}`}><i /></span>
          </div>
        )}
        <Tiles>
          <TileInput label="moves / h" value={flow.thruPerHr || undefined} inputRef={rateRef} onChange={v => p.onFlow(flow.id, { thruPerHr: v ?? 0 })} />
          <Tile label="on the map" value={routed ? len(flowFt) : '—'} />
          <Tile label="lift" value={flow.liftHeightFt != null ? len(flow.liftHeightFt) : '—'} />
        </Tiles>
        <Folds>
          <Section fold title="Vehicle" status={p.vehicles.find(v => v.id === simVid)?.name ?? '—'}>
            {/* The types the simulation runs. A flow with a Sizing vehicle keeps it (the choice is the
                simulation's); a flow with none yet — e.g. drawn here — gets its first vehicle in Sizing. */}
            <label className="sim-field"><span>Vehicle</span>
              <select value={simVid ?? ''} disabled={!p.vehicleTypes.length || !p.onFlowVehicle} onChange={e => (flow.vehicleId ? p.onFlowVehicle?.(flow.id, e.target.value) : p.onFlow(flow.id, { vehicleId: e.target.value, transferMethodIdx: undefined }))}>
                {!p.vehicleTypes.length && <option value="">Add a vehicle first</option>}
                {p.vehicleTypes.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {flow.vehicleId && simVid !== flow.vehicleId && <small className="sim-field-note">Sizing: {p.vehicles.find(v => v.id === flow.vehicleId)?.name ?? 'no vehicle'}</small>}
            </label>
            <button type="button" className="link-btn" onClick={() => p.onUnlink(flow.id)}>Unlink from points</button>
          </Section>
        </Folds>
      </Inspector>
    )
  }

  // Nothing selected: the layout's totals (and the B56.5 rule while its overlay is on).
  const { stations } = nav
  return (
    <aside className="sim-panel is-empty" aria-label="Layout">
      <div className="sim-panel-head"><h3>Layout</h3></div>
      <Summary items={[
        ['Points', stations.length],
        ['Routes', `${p.layout.segments.length} · ${fmtLength(nav.totalFt, p.unitSystem)}`],
        ['Material flows on layout', `${linkedFlows(p.flows).length} of ${p.flows.length}`],
        ['Objects', (p.layout.objects ?? []).length],
      ]} />
      <Section title={`Stations · ${stations.length}`} open={stations.length > 0}>
        <ul className="sim-nav">
          {stations.map(q => (
            <li key={q.id}><button type="button" onClick={() => p.onFocus({ kind: 'point', id: q.id }, q)}>
              <span className={dotClass(q)} /><span className="nm">{q.name || POINT_LABEL[q.type]}</span><span className="meta">{POINT_LABEL[q.type]}</span>
            </button></li>
          ))}
        </ul>
      </Section>
      {(p.layout.highways ?? []).length > 0 && (
        <Section title={`Highways · ${p.layout.highways!.length}`} open>
          <ul className="sim-nav">
            {p.layout.highways!.map(h => (
              <li key={h.id}><button type="button" onClick={() => p.onFocus({ kind: 'highway', id: h.id }, h)}>
                <span className="nm">{h.name || 'Highway'}</span><span className="meta num">{len(h.lengthFt)} · {h.dir === 'two' ? '↔' : '→'}</span>
              </button></li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={`Routes · ${p.layout.segments.length}`}>
        <ul className="sim-nav">
          {nav.routes.map(({ q, a, b, ft, mid }) => (
            <li key={q.id}><button type="button" onClick={() => p.onFocus({ kind: 'segment', id: q.id }, mid)}>
              <span className="nm">{a.name || 'Junction'} {q.dir === 'two' ? '↔' : q.dir === 'ab' ? '→' : '←'} {b.name || 'Junction'}</span><span className="meta num">{len(ft)}</span>
            </button></li>
          ))}
        </ul>
      </Section>
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
        <input type="number" min={signed ? undefined : 0} step="any" value={ft == null ? '' : shownLen(ft, u)}
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
