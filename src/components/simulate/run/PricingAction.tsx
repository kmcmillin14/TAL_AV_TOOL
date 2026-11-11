'use client'

// "Use N in pricing" for one vehicle type (spec v2 §9, D-1 raise-only). Offered only when the stepper
// value Meets above the Fleet Engine's figure and one fewer does not. Confirming shows the pricing
// fleet and ROM before → after, from the same model Step 4, the Dashboard and the deck use.

import { useMemo, useState } from 'react'
import type { Verdict } from '@/src/calc/sim/types'
import { computeFleetModel } from '@/src/lib/fleetModel'
import type { StoredProject } from '@/src/lib/storage'
import { money } from '@/src/lib/vehicleDisplay'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

type Applied = NonNullable<NonNullable<StoredProject['simSettings']>['appliedFleet']>

interface Props {
  project: StoredProject
  vehicles: Vehicle[]
  vehicleId: string
  /** The stepper value this run used, and what the Fleet Engine sized. */
  n: number
  engineN: number
  /** This run's verdict for the type (null while running or not run). */
  verdict: Verdict | null
  /** The same run with one vehicle fewer: its verdict, or 'checking'. Undefined when not needed. */
  lower: Verdict | 'checking' | undefined
  /** The current inputs key (`simInputsKey`). */
  inputsKey: string
  onApplied: (next: Applied) => void
  onStepDown: () => void
}

export default function PricingAction({ project, vehicles, vehicleId, n, engineN, verdict, lower, inputsKey, onApplied, onStepDown }: Props) {
  const [confirm, setConfirm] = useState(false)
  const all: Applied = project.simSettings?.appliedFleet ?? {}
  const applied = all[vehicleId]
  const without = () => Object.fromEntries(Object.entries(all).filter(([v]) => v !== vehicleId))

  // Before → after, only while the confirmation is open.
  const change = useMemo(() => {
    if (!confirm) return null
    const withN = { ...project, simSettings: { ...project.simSettings, appliedFleet: { ...all, [vehicleId]: { fleet: n, key: inputsKey } } } }
    const a = computeFleetModel(project, vehicles), b = computeFleetModel(withN, vehicles)
    return { fleet: [a.fleet.totalFleetSold, b.fleet.totalFleetSold], rom: b.rom.pricing.totalMid > 0 ? [a.rom.pricing.totalMid, b.rom.pricing.totalMid] : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, project, vehicles, vehicleId, n, inputsKey])

  if (applied && applied.fleet <= engineN) {
    // The engine has since sized as many or more: raise-only pricing uses the engine's figure.
    return (
      <span className="sim-vact">
        <span className="sim-tag stale">Engine now sizes {engineN} — applied {applied.fleet} not used</span>
        <button type="button" className="link-btn" onClick={() => onApplied(without())}>Clear</button>
      </span>
    )
  }
  if (applied) {
    const stale = applied.key !== inputsKey
    return (
      <span className="sim-vact">
        <span className={`sim-tag${stale ? ' stale' : ''}`}>In pricing: {applied.fleet}{stale ? ' · stale — re-run' : ''}</span>
        <button type="button" className="link-btn" onClick={() => onApplied(without())}>Back to engine ({engineN})</button>
      </span>
    )
  }
  if (verdict !== 'meets' || n <= engineN) return null
  if (lower === 'checking' || lower === undefined) return <span className="sim-vact sim-busy">Checking {n - 1}…</span>
  if (lower === 'meets') {
    return <span className="sim-vact"><button type="button" className="btn btn-sm ghost" onClick={onStepDown}>{n - 1} also meets</button></span>
  }
  return (
    <span className="sim-vact">
      {!confirm && <button type="button" className="btn btn-sm" onClick={() => setConfirm(true)}>Use {n} in pricing</button>}
      {confirm && change && (
        <span className="sim-confirm">
          Pricing fleet {change.fleet[0]} → {change.fleet[1]}{change.rom && <> · ROM {money(change.rom[0])} → {money(change.rom[1])}</>} · labelled “simulated (engine {engineN})”
          <button type="button" className="btn btn-sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
          <button type="button" className="btn btn-sm primary" onClick={() => { onApplied({ ...all, [vehicleId]: { fleet: n, key: inputsKey } }); setConfirm(false) }}>Use {n}</button>
        </span>
      )}
    </span>
  )
}
