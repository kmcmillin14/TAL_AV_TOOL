'use client'

// What moves on the map in Run mode (proof-of-concept drawing), in feet:
//   wait heat — soft red halos where vehicles stood waiting
//   vehicles  — the true-scale footprint (overall length incl. forks × width), the pallet when
//               loaded, a state dot, and "#n · SOC %" (labels on); a ring on the followed vehicle
//   gridlock  — a pulsing red ring where the run stopped

import { useRef } from 'react'
import type { SimState } from '@/src/calc/sim/engine'

export type VehicleState = 'travel' | 'handle' | 'wait' | 'charge' | 'idle'
export const STATE_LABEL: Record<VehicleState, string> = { travel: 'Travelling', handle: 'Pick / drop', wait: 'Waiting', charge: 'Charging', idle: 'Idle' }

type V = SimState['veh'][number]
export function vehicleState(v: V): VehicleState {
  if (v.mode === 'pick' || v.mode === 'drop') return 'handle'
  if (v.mode === 'charging' || v.mode === 'toCharge') return 'charge'
  if (v.mode === 'toPick' || v.mode === 'toDrop') return v.moved > 0 ? 'travel' : 'wait'
  return 'idle'
}

/** Two-way aisles: a moving vehicle keeps to the right-hand side, eased so it does not jump. */
const LANE_OFFSET_FT = 2.6

export function RunScene({ S, follow, labels, px }: { S: SimState; follow: number; labels: boolean; px: number }) {
  // Display-only easing per vehicle (heading and lane offset), kept out of the engine's state.
  const ease = useRef(new Map<number, { off: number; h: number }>())
  let maxHeat = 0
  for (const h of S.heat) maxHeat = Math.max(maxHeat, h)
  const pts = S.G.points
  const gl = S.gridlock && pts.find(p => p.id === S.gridlock!.nodeId)
  return (
    <g className="sim-scene">
      <defs>
        <radialGradient id="sim-heat"><stop offset="0" stopColor="var(--bad)" stopOpacity="0.55" /><stop offset="1" stopColor="var(--bad)" stopOpacity="0" /></radialGradient>
      </defs>
      {maxHeat > 30 && Array.from(S.heat, (h, i) => (h < maxHeat * 0.08 ? null : (
        <circle key={i} cx={pts[i].x} cy={pts[i].y} r={14 * (0.4 + h / maxHeat)} fill="url(#sim-heat)" opacity={0.25 + 0.75 * (h / maxHeat)} />
      )))}
      {S.veh.map(v => {
        const e = ease.current.get(v.i) ?? { off: 0, h: v.h }
        const moving = (v.mode === 'toPick' || v.mode === 'toDrop' || v.mode === 'toHome' || v.mode === 'toCharge') && !v.atNode
        e.off += ((moving ? LANE_OFFSET_FT : 0) - e.off) * 0.2
        e.h += Math.atan2(Math.sin(v.h - e.h), Math.cos(v.h - e.h)) * 0.35
        ease.current.set(v.i, e)
        const L = v.prof.lengthFt, W = v.prof.vehicle.calc.widthFt
        const x = v.x - Math.sin(e.h) * e.off, y = v.y + Math.cos(e.h) * e.off
        const deg = (e.h * 180) / Math.PI
        const pay = v.loaded ? (v.payload ?? { length: Math.min(4, L * 0.45), width: Math.min(4, W) }) : null
        return (
          <g key={v.i} className={`sim-veh st-${vehicleState(v)}${follow === v.i ? ' is-followed' : ''}`}>
            <g transform={`translate(${x} ${y}) rotate(${deg})`}>
              {follow === v.i && <ellipse rx={L * 0.65} ry={W * 0.9} className="sim-veh-follow" />}
              <rect x={-L / 2} y={-W / 2} width={L} height={W} rx={Math.min(0.6, W / 6)} className="sim-veh-body" />
              {/* forks / load end at the rear */}
              <path d={`M${-L / 2} ${-W * 0.28}H${-L / 2 + L * 0.38}M${-L / 2} ${W * 0.28}H${-L / 2 + L * 0.38}`} className="sim-veh-forks" />
              {pay && <rect x={-L / 2 - 0.1} y={-pay.width / 2} width={pay.length} height={pay.width} className="sim-veh-pallet" />}
              <circle cx={L * 0.22} cy={0} r={Math.max(0.45, W * 0.16)} className="sim-veh-dot" />
            </g>
            {labels && <g transform={`translate(${x} ${y + W / 2}) scale(${px})`}><text y={14} className="sim-veh-label">{v.id} · {Math.round(v.soc)}%</text></g>}
          </g>
        )
      })}
      {gl && <g transform={`translate(${gl.x} ${gl.y}) scale(${px})`}><circle r={16 + 6 * Math.sin(performance.now() / 200)} className="sim-gridlock" /></g>}
    </g>
  )
}
