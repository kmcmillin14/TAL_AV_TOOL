'use client'

// The layout editor's side panel parts, by stage (stage strip, 2026-11-18):
//   Station tray    — Layout: Sizing's stations not on the map yet, dragged (or clicked) onto it
//   Chargers        — Chargers: chargers and parking to place, against a suggested count
//   Validation      — Connect: the live checks (src/calc/sim/readiness.ts): locate and fix each
//   Flows           — Connect: every flow, its Sizing distance and its distance on the layout, the
//                     Fleet Engine figure, and linking with a before → after confirmation (it moves the quote)
// and the status words the stage strip shares with them (one wording per fact).

import type { RackLoad } from '@/src/calc/sim/racks'
import { useMemo, useState } from 'react'
import { engineFleetTotal } from '@/src/calc/fleet'
import { engineFleetFor } from '@/src/lib/fleetModel'
import { linkFlow, linkSuggestions, measureFlows, pointById, sameName } from '@/src/calc/sim/layoutEdit'
import { homeCounts, type checkStatus, type CheckFix, type ReadinessCheck } from '@/src/calc/sim/readiness'
import type { SimLayout, SimPointType, SimRole } from '@/src/calc/sim/types'
import type { FleetSettings, FleetSummary } from '@/src/calc/types'
import { fmtLength, lengthToDisplay, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { ProjectFlow } from './useLayoutEditor'

/** A name suggests a type (proof of concept); the engineer confirms it in the list. */
const suggestType = (name: string): SimPointType => (/conveyor|infeed|outfeed|wrapper/i.test(name) ? 'conveyor' : 'stand')

/** The Sizing flows' location names, with whether each is a flow's origin, destination or both. */
export interface FlowName { name: string; from: boolean; to: boolean }
function flowNames(flows: ProjectFlow[]): FlowName[] {
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
const roleOf = (n: FlowName): SimRole => (n.from && n.to ? 'pickDrop' : n.from ? 'pick' : 'drop')

/** The Sizing names and which are not on the layout yet (the Place section and its status). */
export function placeProgress(layout: SimLayout, flows: ProjectFlow[]) {
  const names = flowNames(flows)
  return { names, unplaced: names.filter(n => !layout.points.some(p => sameName(p.name, n.name))) }
}

/** Layout's station tray (owner plan, 2026-11-21): Sizing's stations not on the map yet, one chip each.
 *  Drag a chip onto the map — or press it, then click the map — to place it; its type is suggested from
 *  the name (change it in the inspector after). The tray is gone once every station is placed. */
export function StationTray({ unplaced, armed, onPick }: {
  unplaced: FlowName[]
  armed: Armed | null
  /** Pressed: arm the Place tool with this station (the drag that follows places it where it is released). */
  onPick: (a: Armed) => void
}) {
  if (!unplaced.length) return null
  // The tray sits on the map: its presses and releases are its own (a release on a chip is not a drop).
  return (
    <div className="sim-tray" aria-label="Stations to place" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
      <span className="sim-tray-label">To place · {unplaced.length}</span>
      {unplaced.map(n => (
        <button key={n.name} type="button" className={`sim-tray-chip${armed && sameName(armed.name, n.name) ? ' on' : ''}`}
          title="Drag onto the map, or click and then click the map"
          onPointerDown={e => { e.preventDefault(); onPick({ name: n.name, type: suggestType(n.name), role: roleOf(n) }) }}>
          <span className={`sim-dot role-${roleOf(n)}`} />{n.name}
        </button>
      ))}
    </div>
  )
}

/** The Chargers stage: chargers against the suggested count (the static charging model's vehicles on a
 *  charger at once), then parking — each placed with one click. */
export function ChargersCard({ layout, suggested, needed, onArmHome }: {
  layout: SimLayout
  suggested: number
  /** Vehicles the run places — each needs a charger or parking spot. */
  needed: number
  onArmHome: (type: 'charger' | 'parking') => void
}) {
  const p = chargerProgress(layout, suggested, needed)
  const meta = { charger: `${p.chargers} placed · ${suggested} suggested`, parking: `${p.homes - p.chargers} placed` }
  return (
    // Its status is the Points step's sub-task line (owner, 2026-11-26: said once).
    <section className="sim-card" aria-label="Chargers">
      {(['charger', 'parking'] as const).map(t => (
        <div key={t} className="sim-check-item">
          <span className={`sim-dot kind-${t} is-placed`} />
          <div className="sim-check-main">
            <div className="nm">{t === 'charger' ? 'Charger' : 'Parking spot'}</div>
            <div className="meta">{meta[t]}</div>
          </div>
          <button type="button" className="btn btn-sm ghost" onClick={() => onArmHome(t)}>Place</button>
        </div>
      ))}
    </section>
  )
}

/** The Chargers stage in words — the strip and the card say it the same way. Every vehicle needs a home (a
 *  charger or a parking spot: validation blocks the run until each has one), and at least the suggested
 *  chargers; it is done when both hold. */
export function chargerProgress(layout: Pick<SimLayout, 'points'>, suggested: number, needed: number) {
  const { chargers, homes } = homeCounts(layout)
  const status = homes < needed ? `${homes} of ${needed} charger or parking spots`
    : chargers < suggested ? `${chargers} of ${suggested} chargers`
    : `${chargers} charger${chargers === 1 ? '' : 's'} · ${homes - chargers} parking`
  return { chargers, homes, status, done: homes >= needed && chargers >= suggested }
}
/** The drawing in words — the strip ("Drawing scaled") and the Setup panel ("Scaled") say it the same way. */
export const drawingStatus = (bg: { scale?: unknown } | undefined) => (!bg ? 'None' : bg.scale ? 'Scaled' : 'Not scaled')

/** Connect's validation list: blockers first, then warnings and notes, one row per thing. A row with a
 *  target selects it and centres on it; its fix button picks the tool, or opens the stage, that fixes it. */
const FIX_LABEL: Record<CheckFix, string> = { scale: 'Scale', route: 'Draw route', charger: 'Place charger', linkFlow: 'Link material flow', flowsTab: 'Place them' }
/** The validation status in words — the page head and the strip's Connect say it the same way. */
export const statusLabel = ({ blockers }: ReturnType<typeof checkStatus>) => (blockers ? `${blockers} blocker${blockers === 1 ? '' : 's'}` : 'Valid')
export function ValidationList({ checks, status, onLocate, onDetails, onFix }: {
  checks: ReadinessCheck[]
  status: ReturnType<typeof checkStatus>
  onLocate: (t: NonNullable<ReadinessCheck['target']>) => void
  /** A row with no fix: select it and open its inspector (the Layout tab), where it is changed. */
  onDetails: (t: NonNullable<ReadinessCheck['target']>) => void
  onFix: (c: ReadinessCheck) => void
}) {
  return (
    <section className="sim-valid" aria-label="Validation">
      <p className={`sim-valid-head is-${status.blockers ? 'bad' : 'good'}`}><i className={`sim-vdot is-${status.tone}`} aria-hidden />{status.blockers ? `${statusLabel(status)} — fix to run` : 'Ready to run'}</p>
      {checks.length > 0 && (
        <ul className="sim-valid-list">
          {checks.map((c, i) => (
            <li key={i} className="sim-valid-row">
              <i className={`sim-vdot is-${c.level}`} aria-hidden />
              {c.target
                ? <button type="button" className="sim-valid-text" onClick={() => onLocate(c.target!)} title="Show on the layout">{c.text}</button>
                : <span className="sim-valid-text">{c.text}</span>}
              {c.fix
                ? <button type="button" className="btn btn-sm ghost" onClick={() => onFix(c)}>{FIX_LABEL[c.fix]}</button>
                : c.target && <button type="button" className="btn btn-sm ghost" onClick={() => onDetails(c.target!)}>Details</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Connect's flows: every flow as two lines — from → to, then vehicle · moves/h · distance — with the
 *  layout distance and its Δ while a link is pending; the Fleet Engine line and "Use layout
 *  distances" (before → after confirmation) at its foot. */
export function FlowsList({ layout, flows, vehicleById, settings, fleet, unitSystem, radiusFor, onFlows, onSelect, selectedId, simVehicleOf, onLinkOnMap, loads = [] }: {
  layout: SimLayout
  flows: ProjectFlow[]
  vehicleById: Map<string, Vehicle>
  settings: FleetSettings
  fleet: FleetSummary
  unitSystem: UnitSystem
  radiusFor: (vehicleId?: string) => number
  onFlows: (next: ProjectFlow[]) => void
  onSelect: (flowId: string) => void
  /** Each flow's simulation vehicle (shown when it differs from Sizing's). */
  simVehicleOf: Map<string, string | undefined>
  selectedId?: string
  /** Link a Pick to a Drop on the map (the Flow tool, off the tool bar). */
  onLinkOnMap?: () => void
  /** Step 1 loads — a rack's lift (its pallet). */
  loads?: RackLoad[]
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
    return new Map(measureFlows(layout, linked, radiusFor, loads).map(f => [f.id, f]))
  }, [layout, flows, matches, radiusFor, loads])
  const linkedAll = useMemo(() => flows.map(f => pending.get(f.id) ?? f), [flows, pending])
  // The Fleet Engine's own figures — without a simulated fleet applied to pricing (D-1).
  const engineTotal = engineFleetTotal(fleet)
  const after = useMemo(() => (confirm ? engineFleetFor(linkedAll, vehicleById, settings).totalFleetSold : null), [confirm, linkedAll, vehicleById, settings])
  const raw = fleet.groups.reduce((t, g) => t + g.groupRaw, 0)

  return (
    <section className="sim-flows" aria-label="Material flows from Sizing">
      <ol className="sim-flow-list">
        {flows.map((f, i) => {
          const linked = !!(f.fromPointId && f.toPointId)
          const would = pending.get(f.id), sv = simVehicleOf.get(f.id)
          const d = would ? (would.distanceFt ?? 0) - f.distanceFt : null
          const body = (
            <>
              <span className="n num">{i + 1}</span>
              <span className="nm">{linked ? `${name(f.fromPointId)} → ${name(f.toPointId)}` : `${f.origin || '—'} → ${f.destination || '—'}`}</span>
              <span className="meta">
                {(sv && vehicleById.get(sv)?.name) || 'No vehicle'}{sv !== f.vehicleId && <span className="sim-tag">sim only</span>} · <span className="num">{f.thruPerHr || 0}</span>/h · <span className="num">{fmt(f.distanceFt)}</span>
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
        {!flows.length && <li className="sim-card-note">No material flows yet — add them on Sizing, or link a Pick point to a Drop point with Link on the map (F).</li>}
      </ol>
      <div className="sim-flows-foot">
        <span>Fleet Engine: raw <b className="num">{raw.toFixed(2)}</b> → <b className="num">{engineTotal}</b> vehicle{engineTotal === 1 ? '' : 's'}</span>
        <span className="sim-card-note">Utilization {Math.round(settings.targetUtilization * 100)}% · {settings.dailyOpHr} h/day</span>
        {onLinkOnMap && <button type="button" className="btn btn-sm ghost" onClick={onLinkOnMap} title="Click a Pick, then a Drop (F)">Link on the map</button>}
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

