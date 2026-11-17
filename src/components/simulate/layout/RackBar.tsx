'use client'

// The rack bar (Milestone 7a, owner 2026-11-17): floated above a selected rack — the pallet (a Step 1 load,
// or custom), the face picked up (short / long, with its length), pallets per bay, levels, the position
// size worked out from those (editable, Reset back), a typed total that snaps the length, the count,
// what is wrong, flip the served side, delete.

import { useState } from 'react'
import type { RackGeometry, RackLoad } from '@/src/calc/sim/racks'
import type { SimPoint, SimRack } from '@/src/calc/sim/types'
import Icon from '@/src/design-system/components/Icon'

export type RackBarLoad = RackLoad & { unitType?: string | null }

export default function RackBar({ p, g, loads, reach, onRack, onFlip, onTotal, onDelete }: {
  p: SimPoint
  g: RackGeometry
  loads: RackBarLoad[]
  /** The lowest reach among the vehicles that work this rack, ft, and whose it is. */
  reach: { name: string; ft: number } | null
  onRack: (patch: Partial<SimRack>) => void
  onFlip: () => void
  onTotal: (total: number) => void
  onDelete: () => void
}) {
  const r = p.rack!
  const pallet = r.pallet
  const custom = !!pallet && !('loadId' in pallet)
  const [editing, setEditing] = useState(custom)
  const sized = loads.filter(l => l.lengthIn && l.widthIn && l.heightIn)
  const short = g.pallet ? Math.min(g.pallet.l, g.pallet.w) : 0, long = g.pallet ? Math.max(g.pallet.l, g.pallet.w) : 0
  const over = reach && g.pallet && g.topBeamFt > reach.ft + 1e-9
  const warnings = [...g.warnings, ...(over ? [`Top level at ${g.topBeamFt.toFixed(1)} ft — above ${reach!.name} reach (${reach!.ft.toFixed(1)} ft)`] : [])]
  const num = (v: string) => { const n = Number(v); return n > 0 ? n : undefined }
  const edited = r.slotIn != null || r.levelIn != null
  return (
    <div className="sim-rackbar">
      <label className={`sim-rackbar-pallet${g.pallet ? '' : ' is-need'}`}>
        <span>Pallet</span>
        <select value={custom ? 'custom' : pallet && 'loadId' in pallet ? pallet.loadId : ''}
          onChange={e => {
            const v = e.target.value
            if (v === 'custom') { setEditing(true); onRack({ pallet: { lengthIn: g.pallet?.l ?? 48, widthIn: g.pallet?.w ?? 40, heightIn: g.pallet?.h ?? 48 }, slotIn: undefined, levelIn: undefined }) }
            else { setEditing(false); onRack({ pallet: v ? { loadId: v } : undefined, slotIn: undefined, levelIn: undefined }) }
          }}>
          {!g.pallet && !custom && <option value="">Choose…</option>}
          {sized.map(l => <option key={l.id} value={l.id}>{l.unitType || 'Load'} {l.lengthIn} × {l.widthIn} × {l.heightIn} in · Step 1</option>)}
          <option value="custom">Custom…</option>
        </select>
      </label>
      {custom && editing && pallet && !('loadId' in pallet) && (
        <span className="sim-rackbar-dims">
          {(['lengthIn', 'widthIn', 'heightIn'] as const).map((k, i) => (
            <span key={k}>{i ? '× ' : ''}<input type="number" min={1} max={200} aria-label={['Length', 'Width', 'Height'][i]} defaultValue={pallet[k]}
              onBlur={e => { const v = num(e.target.value); if (v && v !== pallet[k]) onRack({ pallet: { ...pallet, [k]: v }, slotIn: undefined, levelIn: undefined }) }} /></span>
          ))} in
        </span>
      )}
      {g.pallet && (
        <div className="seg" role="group" aria-label="Face picked up">
          {([['short', short], ['long', long]] as const).map(([k, v]) => (
            <button key={k} type="button" className={r.face === k ? 'on' : ''} aria-pressed={r.face === k} title="The pallet side facing the aisle — the forks enter it"
              onClick={() => onRack({ face: k, slotIn: undefined })}>{k === 'short' ? 'Short' : 'Long'} <small>{Math.round(v)} in</small></button>
          ))}
        </div>
      )}
      <Stepper label="per bay" value={r.perBay} min={1} max={6} onChange={perBay => onRack({ perBay })} />
      <Stepper label={r.levels === 1 ? 'level' : 'levels'} value={r.levels} min={1} max={12} onChange={levels => onRack({ levels })} />
      {g.pallet && (
        <span className="sim-rackbar-size">
          Position
          <input key={`s${g.slotIn}`} type="number" min={10} max={200} aria-label="Position width, in" defaultValue={Math.round(g.slotIn)}
            onBlur={e => { const v = num(e.target.value); if (v && v !== Math.round(g.slotIn)) onRack({ slotIn: v === Math.round(g.auto!.slotIn) ? undefined : v }) }} /> in wide ×
          <input key={`l${g.levelIn}`} type="number" min={10} max={300} aria-label="Level height, in" defaultValue={Math.round(g.levelIn)}
            onBlur={e => { const v = num(e.target.value); if (v && v !== Math.round(g.levelIn)) onRack({ levelIn: v === Math.round(g.auto!.levelIn) ? undefined : v }) }} /> in high · {Math.round(g.depthIn)} in deep
          {edited && <button type="button" className="link-btn" onClick={() => onRack({ slotIn: undefined, levelIn: undefined })} title="Back to the size from the pallet">Reset</button>}
        </span>
      )}
      {g.pallet && (
        <label className="sim-rackbar-total" title="Type a total: the rack takes the fewest bays that hold it">
          <input key={g.positions} type="number" min={1} max={20000} aria-label="Total positions" defaultValue={g.positions}
            onBlur={e => { const v = num(e.target.value); if (v && v !== g.positions) onTotal(Math.round(v)) }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          <span>= {g.long} long × {r.levels} high · top beam {g.topBeamFt.toFixed(1)} ft</span>
        </label>
      )}
      {warnings.length > 0 && <span className="sim-rackbar-warn">{warnings.join(' · ')}</span>}
      <button type="button" className="sim-selbar-del sim-rackbar-flip" onClick={onFlip} title="Serve the other long side" aria-label="Serve the other side"><Icon name="swap" size={14} /></button>
      <button type="button" className="sim-selbar-del" onClick={onDelete} title="Delete (Del)" aria-label="Delete"><Icon name="trash" size={14} /></button>
    </div>
  )
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span className="sim-rackbar-step" role="group" aria-label={label}>
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer (${label})`}>−</button>
      <span><b className="num">{value}</b> {label}</span>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More (${label})`}>+</button>
    </span>
  )
}
