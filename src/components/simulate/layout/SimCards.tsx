'use client'

// The layout editor's side panel parts (proof of concept; QoL pass):
//   Place on routes — the Sizing flows' location names, each placed with one click (plus chargers, parking)
//   Ready to run?   — the checklist (src/calc/sim/readiness.ts)
//   Flows           — the Flows tab: every flow, its Sizing distance and its distance on the layout, the
//                     Fleet Engine figure, and linking with a before → after confirmation (it moves the quote)
//   Step strip      — Draw aisles · Place stations · Link flows · Chargers & parking · Run, above the canvas

import { useMemo, useState } from 'react'
import { engineFleetTotal, fleetFromFlows } from '@/src/calc/fleet'
import { FLOW_POINT_TYPES, linkFlow, linkSuggestions, measureFlows, pointById, sameName } from '@/src/calc/sim/layoutEdit'
import { homeCounts } from '@/src/calc/sim/readiness'
import type { ReadinessCheck } from '@/src/calc/sim/readiness'
import type { SimLayout, SimPointType, SimRole } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import { fmtLength, lengthToDisplay, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { POINT_LABEL } from './labels'
import type { ProjectFlow } from './useLayoutEditor'

/** A name suggests a type (proof of concept); the engineer confirms it in the list. */
export const suggestType = (name: string): SimPointType => (/conveyor|infeed|outfeed|wrapper/i.test(name) ? 'conveyor' : 'stand')

/** The Sizing flows' location names, with whether each is a flow's origin, destination or both. */
export interface FlowName { name: string; from: boolean; to: boolean }
export function flowNames(flows: ProjectFlow[]): FlowName[] {
  const m = new Map<string, FlowName>()
  for (const f of flows) for (const [n, end] of [[f.origin, 'from'], [f.destination, 'to']] as const) {
    if (!n?.trim()) continue
    const k = n.trim().toLowerCase(), e = m.get(k) ?? { name: n.trim(), from: false, to: false }
    e[end] = true; m.set(k, e)
  }
  return [...m.values()]
}

/** What the Place tool is armed with from this list. */
export interface Armed { name: string; type: SimPointType; role: SimRole }
/** A name's role: Pick where flows start, Drop where they end, both where both. */
export const roleOf = (n: FlowName): SimRole => (n.from && n.to ? 'pickDrop' : n.from ? 'pick' : 'drop')

/** The Sizing names and which are not on the layout yet — one count for the step strip, the Place
 *  section's status and the step's arming. */
export function placeProgress(layout: SimLayout, flows: ProjectFlow[]) {
  const names = flowNames(flows)
  return { names, unplaced: names.filter(n => !layout.points.some(p => sameName(p.name, n.name))) }
}

export function PlaceCard({ layout, names, armed, onArm, onArmHome }: {
  layout: SimLayout
  names: FlowName[]
  armed: Armed | null
  onArm: (a: Armed) => void
  onArmHome: (type: 'charger' | 'parking') => void
}) {
  const [types, setTypes] = useState<Record<string, SimPointType>>({})
  const placed = (n: string) => layout.points.filter(p => sameName(p.name, n))
  const count = (t: SimPointType) => layout.points.filter(p => p.type === t).length
  return (
    <section className="sim-card" aria-label="Place on routes">
      {!names.length && <p className="sim-card-note">No Sizing flows yet — add them on Sizing, or draw flows with the Flow tool.</p>}
      {names.map(n => {
        const { name } = n, ps = placed(name)
        const type = ps[0]?.type ?? types[name.toLowerCase()] ?? suggestType(name)
        const role = roleOf(n)
        const on = armed && sameName(armed.name, name)
        return (
          <div key={name} className="sim-check-item">
            <span className={`sim-dot role-${role}${ps.length ? ' is-placed' : ''}`} />
            <div className="sim-check-main">
              <div className="nm" title={name}>{name}</div>
              {ps.length
                ? <div className="meta">{POINT_LABEL[type]} · {ps.length} position{ps.length > 1 ? 's' : ''}</div>
                : <select className="sim-sel" value={type} title="Type — suggested from the name; confirm before placing"
                    onChange={e => setTypes({ ...types, [name.toLowerCase()]: e.target.value as SimPointType })}>
                    {FLOW_POINT_TYPES.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}
                  </select>}
            </div>
            <button type="button" className={`btn btn-sm${on ? ' primary' : ' ghost'}`} onClick={() => onArm({ name, type, role })}>{ps.length ? '+ Position' : 'Place'}</button>
          </div>
        )
      })}
      {(['charger', 'parking'] as const).map(t => (
        <div key={t} className="sim-check-item">
          <span className={`sim-dot kind-${t} is-placed`} />
          <div className="sim-check-main"><div className="nm">{t === 'charger' ? 'Charger' : 'Parking spot'}</div><div className="meta">{count(t)} placed</div></div>
          <button type="button" className="btn btn-sm ghost" onClick={() => onArmHome(t)}>Place</button>
        </div>
      ))}
    </section>
  )
}

export function ChecksCard({ checks }: { checks: ReadinessCheck[] }) {
  return (
    <section className="sim-card" aria-label="Ready to run?">
      <div className="sim-msgs">
        {checks.length
          ? checks.map((c, i) => <div key={i} className={`sim-msg ${c.level}`}><i /><span>{c.text}</span></div>)
          : <div className="sim-msg ok"><i /><span>Layout complete — switch to Run.</span></div>}
      </div>
    </section>
  )
}

/** The Flows tab: every flow as two lines — from → to, then vehicle · moves/h · distance — with the
 *  layout distance and its Δ while a link is pending; the Fleet Engine line and "Use layout
 *  distances" (before → after confirmation) at its foot. */
export function FlowsList({ layout, flows, vehicleById, settings, fleet, unitSystem, radiusFor, onFlows, onSelect, selectedId }: {
  layout: SimLayout
  flows: ProjectFlow[]
  vehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  unitSystem: UnitSystem
  radiusFor: (vehicleId?: string) => number
  onFlows: (next: ProjectFlow[]) => void
  onSelect: (flowId: string) => void
  selectedId?: string
}) {
  const [confirm, setConfirm] = useState(false)
  const fmt = (ft?: number) => fmtLength(ft, unitSystem)
  const byId = useMemo(() => pointById(layout), [layout])
  const name = (id?: string) => (id && byId.get(id)?.name) || '—'
  // Flows a name match can link, measured as they would be once linked — only those.
  const matches = useMemo(() => linkSuggestions(layout, flows).filter(s => s.from && s.to), [layout, flows])
  const pending = useMemo(() => {
    const byId = new Map(flows.map(f => [f.id, f]))
    const linked = matches.map(m => linkFlow(layout, byId.get(m.flowId)!, m.from!, m.to!))
    return new Map(measureFlows(layout, linked, radiusFor).map(f => [f.id, f]))
  }, [layout, flows, matches, radiusFor])
  const linkedAll = useMemo(() => flows.map(f => pending.get(f.id) ?? f), [flows, pending])
  // The Fleet Engine's own figures — without a simulated fleet applied to pricing (D-1).
  const engineTotal = engineFleetTotal(fleet)
  const after = useMemo(() => (confirm ? fleetFromFlows(linkedAll, vehicleById, { ...settings, appliedFleet: undefined }).fleet.totalFleetSold : null), [confirm, linkedAll, vehicleById, settings])
  const raw = fleet.groups.reduce((t, g) => t + g.groupRaw, 0)

  return (
    <section className="sim-flows" aria-label="Flows from Sizing">
      <ol className="sim-flow-list">
        {flows.map((f, i) => {
          const linked = !!(f.fromPointId && f.toPointId)
          const would = pending.get(f.id)
          const d = would ? (would.distanceFt ?? 0) - f.distanceFt : null
          const body = (
            <>
              <span className="n num">{i + 1}</span>
              <span className="nm">{linked ? `${name(f.fromPointId)} → ${name(f.toPointId)}` : `${f.origin || '—'} → ${f.destination || '—'}`}</span>
              <span className="meta">
                {(f.vehicleId && vehicleById.get(f.vehicleId)?.name) || 'No vehicle'} · <span className="num">{f.thruPerHr || 0}</span>/h · <span className="num">{fmt(f.distanceFt)}</span>
                {linked ? <span className="sim-tag">layout</span> : !would && <span className="sim-tag is-off">not placed</span>}
                {would && <span className={d != null && Math.abs(d) >= 0.5 ? 'warn' : ''}> → <span className="num">{fmt(would.distanceFt)}</span> ({d! > 0 ? '+' : ''}{lengthToDisplay(d!, unitSystem).toFixed(0)})</span>}
              </span>
            </>
          )
          return (
            <li key={f.id} className={f.id === selectedId ? 'is-selected' : ''}>
              {linked ? <button type="button" onClick={() => onSelect(f.id)} title="Select on the layout">{body}</button> : <div>{body}</div>}
            </li>
          )
        })}
        {!flows.length && <li className="sim-card-note">No flows yet — add them on Sizing, or link a Pick point to a Drop point with the Flow tool (F).</li>}
      </ol>
      <div className="sim-flows-foot">
        <span>Fleet Engine: raw <b className="num">{raw.toFixed(2)}</b> → <b className="num">{engineTotal}</b> vehicle{engineTotal === 1 ? '' : 's'}</span>
        <span className="sim-card-note">Utilization {Math.round(settings.targetUtilization * 100)}% · {settings.dailyOpHr} h/day</span>
        {!confirm && (
          <button type="button" className="btn btn-sm ghost" disabled={!matches.length} onClick={() => setConfirm(true)}>
            Use layout distances{matches.length ? ` (${matches.length})` : ''}
          </button>
        )}
        {confirm && after != null && (
          <div className="sim-confirm">
            <span>Links {matches.length} flow{matches.length === 1 ? '' : 's'} to the layout — distance and lift then come from the drawing · Fleet Engine {engineTotal} → {after}</span>
            <span className="sim-confirm-actions">
              <button type="button" className="btn btn-sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
              <button type="button" className="btn btn-sm primary" onClick={() => { onFlows(linkedAll); setConfirm(false) }}>Apply</button>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

export type StepId = 'aisles' | 'stations' | 'flows' | 'homes' | 'run'
export interface Step { id: StepId; label: string; done: boolean; note?: string; disabled?: boolean }

/** The five steps of a layout, from what is drawn and the same counts the readiness checks use. */
export function layoutSteps({ layout, place, linked, flowCount, fleetNeeded, canRun }: {
  layout: SimLayout; place: ReturnType<typeof placeProgress>; linked: number; flowCount: number; fleetNeeded: number; canRun: boolean
}): Step[] {
  const { names, unplaced } = place
  const { chargers, homes } = homeCounts(layout)
  return [
    { id: 'aisles', label: 'Draw aisles', done: layout.segments.length > 0 },
    { id: 'stations', label: 'Place stations', done: names.length ? !unplaced.length : layout.points.some(p => FLOW_POINT_TYPES.includes(p.type)),
      note: names.length ? `${names.length - unplaced.length}/${names.length}` : undefined },
    { id: 'flows', label: 'Link flows', done: linked > 0 && linked === flowCount, note: flowCount ? `${linked}/${flowCount}` : undefined },
    { id: 'homes', label: 'Chargers & parking', done: chargers > 0 && homes >= fleetNeeded, note: fleetNeeded ? `${homes}/${fleetNeeded}` : undefined },
    { id: 'run', label: 'Run', done: false, note: canRun ? 'ready' : undefined, disabled: !canRun },
  ]
}

/** The step strip above the canvas: done ✓, the next step highlighted, a click picks its tool. */
export function StepStrip({ steps, onStep }: { steps: Step[]; onStep: (id: StepId) => void }) {
  const next = steps.find(s => !s.done)?.id
  return (
    <nav className="sim-steps" aria-label="Layout steps">
      <ol>
        {steps.map((s, i) => {
          return (
            <li key={s.id}>
              <button type="button" className={`sim-step${s.done ? ' is-done' : ''}${s.id === next ? ' is-next' : ''}`} disabled={s.disabled}
                aria-current={s.id === next ? 'step' : undefined} onClick={() => onStep(s.id)}>
                <span className="sim-step-n" aria-hidden>{s.done ? '✓' : i + 1}</span>
                <span>{s.label}</span>
                {s.note && <span className="sim-step-note num">{s.note}</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
