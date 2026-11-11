'use client'

// The proof-of-concept side cards and flows table for the layout editor:
//   Place on routes — the Sizing flows' location names, each placed with one click (plus chargers, parking)
//   Ready to run?   — the checklist (src/calc/sim/readiness.ts)
//   Flows — from Sizing — every flow, its Sizing distance and its distance on the layout, the Fleet
//                     Engine figure, and linking with a before → after confirmation (it moves the quote)

import { useMemo, useState } from 'react'
import { fleetFromFlows } from '@/src/calc/fleet'
import { linkFlow, linkSuggestions, measureFlows } from '@/src/calc/sim/layoutEdit'
import type { ReadinessCheck } from '@/src/calc/sim/readiness'
import type { SimLayout, SimPointType, SimRole } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import { lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { POINT_LABEL } from './labels'
import type { ProjectFlow } from './useLayoutEditor'

const norm = (s?: string) => (s ?? '').trim().toLowerCase()
/** A name suggests a type (proof of concept); the engineer confirms it in the list. */
const suggestType = (name: string): SimPointType => (/conveyor|infeed|outfeed|wrapper/i.test(name) ? 'conveyor' : 'stand')
const PLACEABLE: SimPointType[] = ['stand', 'conveyor', 'machine', 'dock']

/** What the Place tool is armed with from this list. */
export interface Armed { name: string; type: SimPointType; role: SimRole }

export function PlaceCard({ layout, flows, armed, onArm, onArmHome }: {
  layout: SimLayout
  flows: ProjectFlow[]
  armed: Armed | null
  onArm: (a: Armed) => void
  onArmHome: (type: 'charger' | 'parking') => void
}) {
  const [types, setTypes] = useState<Record<string, SimPointType>>({})
  const names = useMemo(() => {
    const m = new Map<string, { name: string; from: boolean; to: boolean }>()
    for (const f of flows) for (const [n, end] of [[f.origin, 'from'], [f.destination, 'to']] as const) {
      if (!n?.trim()) continue
      const k = norm(n), e = m.get(k) ?? { name: n.trim(), from: false, to: false }
      e[end] = true; m.set(k, e)
    }
    return [...m.values()]
  }, [flows])
  const placed = (n: string) => layout.points.filter(p => norm(p.name) === norm(n))
  const count = (t: SimPointType) => layout.points.filter(p => p.type === t).length
  return (
    <section className="sim-card" aria-label="Place on routes">
      <h3>Place on routes</h3>
      {!names.length && <p className="sim-card-note">No Sizing flows yet — add them on Sizing, or draw flows with the Flow tool.</p>}
      {names.map(({ name, from, to }) => {
        const ps = placed(name)
        const type = ps[0]?.type ?? types[norm(name)] ?? suggestType(name)
        const role: SimRole = from && to ? 'pickDrop' : from ? 'pick' : 'drop'
        const on = armed && norm(armed.name) === norm(name)
        return (
          <div key={name} className="sim-check-item">
            <span className={`sim-dot role-${role}${ps.length ? ' is-placed' : ''}`} />
            <div className="sim-check-main">
              <div className="nm" title={name}>{name}</div>
              {ps.length
                ? <div className="meta">{POINT_LABEL[type]} · {ps.length} position{ps.length > 1 ? 's' : ''}</div>
                : <select className="sim-sel" value={type} title="Type — suggested from the name; confirm before placing"
                    onChange={e => setTypes({ ...types, [norm(name)]: e.target.value as SimPointType })}>
                    {PLACEABLE.map(t => <option key={t} value={t}>{POINT_LABEL[t]}</option>)}
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
      <h3>Ready to run?</h3>
      <div className="sim-msgs">
        {checks.length
          ? checks.map((c, i) => <div key={i} className={`sim-msg ${c.level}`}><i /><span>{c.text}</span></div>)
          : <div className="sim-msg ok"><i /><span>Layout complete — switch to Run.</span></div>}
      </div>
    </section>
  )
}

export function FlowsTable({ layout, flows, vehicleById, settings, fleet, unitSystem, radiusFor, onFlows, onSelect }: {
  layout: SimLayout
  flows: ProjectFlow[]
  vehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  unitSystem: UnitSystem
  radiusFor: (vehicleId?: string) => number
  onFlows: (next: ProjectFlow[]) => void
  onSelect: (flowId: string) => void
}) {
  const [confirm, setConfirm] = useState(false)
  const unit = units.distance.label(unitSystem)
  const fmt = (ft?: number) => (ft == null || !isFinite(ft) ? '—' : `${lengthToDisplay(ft, unitSystem).toFixed(0)} ${unit}`)
  const name = (id?: string) => layout.points.find(p => p.id === id)?.name ?? '—'
  // Flows a name match can link, measured as they would be once linked.
  const matches = useMemo(() => linkSuggestions(layout, flows).filter(s => s.from && s.to), [layout, flows])
  const linkedAll = useMemo(() => {
    const pick = new Map(matches.map(m => [m.flowId, m]))
    return measureFlows(layout, flows.map(f => (pick.has(f.id) ? linkFlow(layout, f, pick.get(f.id)!.from!, pick.get(f.id)!.to!) : f)), radiusFor)
  }, [layout, flows, matches, radiusFor])
  const after = useMemo(() => (confirm ? fleetFromFlows(linkedAll, vehicleById, settings).totalFleetSold : null), [confirm, linkedAll, vehicleById, settings])
  const raw = fleet.groups.reduce((t, g) => t + g.groupRaw, 0)

  return (
    <section className="sim-card sim-flows" aria-label="Flows from Sizing">
      <h3>Flows — from Sizing</h3>
      <div className="sim-tbl-wrap">
        <table className="sim-tbl">
          <thead><tr><th className="l">#</th><th className="l">From → To</th><th>Moves/h</th><th className="l">Vehicle</th><th>Sizing distance</th><th className="band">On the layout</th><th className="band">Δ</th></tr></thead>
          <tbody>
            {flows.map((f, i) => {
              const linked = f.fromPointId && f.toPointId
              const would = linkedAll.find(q => q.id === f.id)
              const onLayout = linked ? f.distanceFt : would?.distanceSource === 'layout' ? would.distanceFt : undefined
              const d = onLayout != null && !linked ? onLayout - f.distanceFt : null
              return (
                <tr key={f.id} onClick={() => linked && onSelect(f.id)} className={linked ? 'is-linked' : ''}>
                  <td className="dim">{i + 1}</td>
                  <td className="l">{linked ? `${name(f.fromPointId)} → ${name(f.toPointId)}` : `${f.origin || '—'} → ${f.destination || '—'}`}</td>
                  <td>{f.thruPerHr || 0}</td>
                  <td className="l">{(f.vehicleId && vehicleById.get(f.vehicleId)?.name) || <span className="dim">—</span>}</td>
                  <td>{fmt(f.distanceFt)}{linked && <span className="sim-tag">layout</span>}</td>
                  <td className={`band${onLayout == null ? ' dim' : ''}`}>{onLayout == null ? 'Not placed' : fmt(onLayout)}</td>
                  <td className={`band${d != null && Math.abs(d) >= 0.5 ? ' warn' : ' dim'}`}>{d == null ? '—' : `${d > 0 ? '+' : ''}${lengthToDisplay(d, unitSystem).toFixed(0)}`}</td>
                </tr>
              )
            })}
            {!flows.length && <tr><td className="dim l" colSpan={7}>No flows yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="sim-tbl-foot">
        <span>Fleet Engine: raw <b className="num">{raw.toFixed(2)}</b> → <b className="num">{fleet.totalFleetSold}</b> vehicle{fleet.totalFleetSold === 1 ? '' : 's'}
          <span className="sim-card-note"> (utilization {Math.round(settings.targetUtilization * 100)}% · {settings.dailyOpHr} h/day)</span></span>
        <span className="grow" />
        <button type="button" className="btn btn-sm ghost" disabled={!matches.length} onClick={() => setConfirm(true)}>
          Use layout distances{matches.length ? ` (${matches.length})` : ''}
        </button>
      </div>
      {confirm && after != null && (
        <div className="sim-confirm">
          Links {matches.length} flow{matches.length === 1 ? '' : 's'} to the layout — distance and lift then come from the drawing · Fleet Engine {fleet.totalFleetSold} → {after}
          <span className="grow" />
          <button type="button" className="btn btn-sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
          <button type="button" className="btn btn-sm primary" onClick={() => { onFlows(linkedAll); setConfirm(false) }}>Apply</button>
        </div>
      )}
    </section>
  )
}
