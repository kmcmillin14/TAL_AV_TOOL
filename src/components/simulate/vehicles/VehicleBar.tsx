'use client'

// Simulation vehicles (owner, 2026-11-12): one chip per type the simulation runs — photo, name, static
// calc → simulated fleet — and + Vehicle. A chip opens its payload (a Step 1 load or custom L × W × H),
// both counts with the simulated stepper, and Remove. Simulation only: Sizing is never changed.

import { useLayoutEffect, useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { newSimType, type SimPayload, type SimVehicleType } from '@/src/calc/sim/simVehicles'
import type { ApplicationRequirements } from '@/src/calc/types'
import { useDismiss } from '@/src/lib/useDismiss'
import { units, type UnitSystem } from '@/src/lib/utils/units'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import VehiclePicker from './VehiclePicker'

interface Load { id: string; unitType?: string; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null }

interface Props {
  types: SimVehicleType[]
  vehicleById: Map<string, Vehicle>
  /** For the + Vehicle window (its cards are worked out only while it is open). */
  vehicles: Vehicle[]
  app: ApplicationRequirements
  sizingIds: string[]
  loads: Load[]
  /** The Fleet Engine's count (static calc), and the fleet the run places per type with a linked flow
   *  (a type missing from it shows "No flows"), by vehicle id. */
  staticN: Record<string, number>
  placed: Record<string, number>
  /** Vehicle ids with a stepper value (simulated differs from the engine on purpose). */
  stepped: Set<string>
  unitSystem: UnitSystem
  onTypes: (next: SimVehicleType[]) => void
  /** Set (or with `undefined`, reset to the engine) a type's simulated count. */
  onFleet: (vehicleId: string, n: number | undefined) => void
}

const CUSTOM = 'custom'
/** A new custom payload starts as a 48 × 40 in pallet. */
const DEFAULT_CUSTOM: Extract<SimPayload, { lengthIn: number }> = { lengthIn: 48, widthIn: 40 }
/** Inches as shown: mm (whole) or in (one decimal). */
const showIn = (i: number, u: UnitSystem) => String(u === 'metric' ? Math.round(units.dimension.toMetric(i)) : Math.round(i * 10) / 10)
const dims = (l: { lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null }, u: UnitSystem) =>
  [l.lengthIn, l.widthIn, l.heightIn].flatMap(i => (i ? [showIn(i, u)] : [])).join(' × ') + ` ${units.dimension.label(u)}`
const loadLabel = (l: Load, u: UnitSystem) => `${l.unitType || 'Load'} · ${dims(l, u)}`

export default function VehicleBar(p: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const added = new Set(p.types.map(t => t.vehicleId))
  const setType = (vid: string, patch: Partial<SimVehicleType>) => p.onTypes(p.types.map(t => (t.vehicleId === vid ? { ...t, ...patch } : t)))
  const add = (ids: string[]) => { p.onTypes([...p.types, ...ids.map(id => newSimType(id, p.loads))]); setPicking(false) }

  return (
    <div className="sim-vbar" role="group" aria-label="Simulation vehicles">
      <span className="sim-vbar-label">Vehicles</span>
      {p.types.map(t => {
        const v = p.vehicleById.get(t.vehicleId)
        const st = p.staticN[t.vehicleId] ?? 0, sim = p.placed[t.vehicleId] ?? st
        return (
          <div key={t.vehicleId} className="sim-vchip-wrap">
            <button type="button" className={`sim-vchip${open === t.vehicleId ? ' is-open' : ''}`} aria-expanded={open === t.vehicleId}
              onClick={() => setOpen(o => (o === t.vehicleId ? null : t.vehicleId))}>
              {/* eslint-disable-next-line @next/next/no-img-element -- chip thumbnail; CSS sizes it */}
              {v?.display.heroImage ? <img src={v.display.heroImage} alt="" /> : <i className="sim-vchip-dot" />}
              <span className="nm">{v?.name ?? t.vehicleId}</span>
              {t.vehicleId in p.placed
                ? <span className="num sim-vchip-n" title="Static calc → simulated">{st}{sim !== st && <> <Icon name="arrowR" size={10} /> <b>{sim}</b></>}</span>
                : <span className="sim-vchip-n is-idle">No flows</span>}
            </button>
            {open === t.vehicleId && (
              <TypePopover t={t} v={v} st={st} sim={sim} stepped={p.stepped.has(t.vehicleId)} loads={p.loads} u={p.unitSystem}
                onPayload={payload => setType(t.vehicleId, { payload })}
                onFleet={n => p.onFleet(t.vehicleId, n)}
                onRemove={() => { setOpen(null); p.onTypes(p.types.filter(q => q.vehicleId !== t.vehicleId)) }}
                onClose={() => setOpen(null)} />
            )}
          </div>
        )
      })}
      <button type="button" className="sim-vchip sim-vadd" onClick={() => setPicking(true)}><Icon name="plus" size={12} /> Vehicle</button>
      {picking && <VehiclePicker vehicles={p.vehicles} app={p.app} sizingIds={p.sizingIds} added={added} onAdd={add} onClose={() => setPicking(false)} />}
    </div>
  )
}

function TypePopover({ t, v, st, sim, stepped, loads, u, onPayload, onFleet, onRemove, onClose }: {
  t: SimVehicleType; v?: Vehicle; st: number; sim: number; stepped: boolean; loads: Load[]; u: UnitSystem
  onPayload: (p: SimPayload | undefined) => void; onFleet: (n: number | undefined) => void; onRemove: () => void; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  // Closes on Escape or a press outside the chip and its popover (the chip itself toggles it).
  const wrap = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => { wrap.current = box.current?.parentElement ?? null }, [])
  useDismiss(onClose, wrap)
  // Near the right edge it opens leftward, so the stepper and Remove stay on screen.
  const [flip, setFlip] = useState(false)
  useLayoutEffect(() => { const r = box.current?.getBoundingClientRect(); if (r && r.right > document.documentElement.clientWidth - 8) setFlip(true) }, [])
  const custom = t.payload && !('loadId' in t.payload) ? t.payload : null
  const which = !t.payload ? '' : 'loadId' in t.payload ? t.payload.loadId : CUSTOM
  /** A dimension typed in: stored (inches) once it is a positive number; height may be cleared. */
  const setDim = (k: 'lengthIn' | 'widthIn' | 'heightIn', inches: number | undefined) => {
    const base = custom ?? DEFAULT_CUSTOM
    if (k === 'heightIn') { const { heightIn: _h, ...rest } = base; onPayload(inches ? { ...rest, heightIn: inches } : rest) }
    else if (inches) onPayload({ ...base, [k]: inches })
  }
  return (
    <div className={`sim-vpop${flip ? ' is-flip' : ''}`} ref={box} role="dialog" aria-label={v?.name ?? t.vehicleId}>
      <label className="sim-field"><span>Payload</span>
        <select value={which} onChange={e => onPayload(e.target.value === CUSTOM ? custom ?? DEFAULT_CUSTOM : e.target.value ? { loadId: e.target.value } : undefined)}>
          <option value="">None — the vehicle alone</option>
          {loads.map(l => <option key={l.id} value={l.id}>{loadLabel(l, u)}</option>)}
          <option value={CUSTOM}>Custom…</option>
        </select>
      </label>
      {which === CUSTOM && custom && (
        <div className="sim-field-row sim-vpop-dims">
          {(['lengthIn', 'widthIn', 'heightIn'] as const).map(k => (
            <label key={k} className="sim-field"><span>{k === 'lengthIn' ? 'L' : k === 'widthIn' ? 'W' : 'H'}</span>
              <DimInput inches={custom[k]} u={u} onInches={i => setDim(k, i)} />
            </label>
          ))}
        </div>
      )}
      <div className="sim-vpop-counts">
        <div><span>Static calc</span><b className="num">{st}</b></div>
        <div><span>Simulated</span>
          <span className="sim-stepper">
            <button type="button" aria-label="One fewer" disabled={sim <= 1} onClick={() => onFleet(sim - 1)}>−</button>
            <b className="num">{sim}</b>
            <button type="button" aria-label="One more" onClick={() => onFleet(sim + 1)}>+</button>
          </span>
        </div>
      </div>
      <div className="sim-vpop-foot">
        {stepped && <button type="button" className="link-btn" onClick={() => onFleet(undefined)}>Reset to static calc</button>}
        <span className="grow" />
        <button type="button" className="link-btn danger" onClick={onRemove}>Remove</button>
      </div>
    </div>
  )
}

/** A dimension field (in or mm) that keeps what is typed — an empty or partial entry is not snapped
 *  back to the stored value; it is stored once it is a positive number, and shown again on blur. */
function DimInput({ inches, u, onInches }: { inches?: number; u: UnitSystem; onInches: (inches: number | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <span className="sim-input-unit">
      <input type="number" min={0} step="any" value={draft ?? (inches == null ? '' : showIn(inches, u))} onBlur={() => setDraft(null)}
        onChange={e => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          onInches(n > 0 ? (u === 'metric' ? units.dimension.toImperial(n) : n) : undefined)
        }} />
      <span>{units.dimension.label(u)}</span>
    </span>
  )
}
