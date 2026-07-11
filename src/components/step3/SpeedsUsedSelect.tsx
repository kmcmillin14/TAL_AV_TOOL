'use client'

import { useRef, useState } from 'react'
import type { RouteLayout } from '@/src/calc/types'
import { ROUTE_LAYOUT_FACTORS } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { units } from '@/src/lib/utils/units'
import Icon from '@/src/design-system/components/Icon'
import FloatingPanel from './FloatingPanel'

interface Props {
  value: RouteLayout
  vehicle?: Vehicle
  unitSystem: 'imperial' | 'metric'
  onChange: (next: RouteLayout) => void
}

interface TierDef {
  value: RouteLayout
  title: string
  desc: string
}

// Highest-first. The tier is a route AVERAGE fraction of rated cruise; 70%
// (High) is the realistic ceiling — no route sustains full cruise once
// accel/decel/turns are averaged in.
const TIERS: ReadonlyArray<TierDef> = [
  { value: 'high',   title: 'High',   desc: 'Open lanes, few turns' },
  { value: 'medium', title: 'Medium', desc: 'Mixed warehouse traffic' },
  { value: 'low',    title: 'Low',    desc: 'Congested, many turns' },
]

const titleOf = (v: RouteLayout) => TIERS.find(t => t.value === v)?.title ?? 'Medium'
const pct = (v: RouteLayout) => Math.round(ROUTE_LAYOUT_FACTORS[v] * 100)

/** Format a feet-per-second value in the active unit system (ft/s or m/s). */
function fmtSpeed(fps: number | undefined, metric: boolean): string {
  if (fps == null || !Number.isFinite(fps)) return '—'
  return (metric ? units.distance.toMetric(fps) : fps).toFixed(1)
}

/**
 * Route layout picker — one line in the grid. The trigger shows only the tier
 * (High / Medium / Low); the resulting Avg speed per tier and the vehicle's Max
 * speeds live in the dropdown, so the cell keeps the table's single-line rhythm.
 * Backed by the unchanged `routeLayout` enum.
 */
export default function SpeedsUsedSelect({ value, vehicle, unitSystem, onChange }: Props) {
  const metric = unitSystem === 'metric'
  const unit = metric ? 'm/s' : 'ft/s'
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const sLoaded = vehicle?.calc.speedLoadedFps
  const sEmpty = vehicle?.calc.speedUnloadedFps

  const pick = (v: RouteLayout) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div className="route-speed-cell">
      <button
        ref={triggerRef}
        type="button"
        className="route-speed-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Route-average speed as a fraction of rated cruise — 70% is the realistic ceiling"
      >
        <span>{titleOf(value)}</span>
        <Icon name="chevronD" size={12} />
      </button>

      <FloatingPanel
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        className="route-speed-panel"
      >
        {TIERS.map(t => {
          const f = ROUTE_LAYOUT_FACTORS[t.value]
          return (
            <button
              key={t.value}
              type="button"
              className={`rs-opt${t.value === value ? ' active' : ''}`}
              onClick={() => pick(t.value)}
            >
              <span className="rs-opt-row">
                <span className="rs-opt-title">{t.title}</span>
                <span className="rs-opt-pct mono">{pct(t.value)}%</span>
              </span>
              <span className="rs-opt-desc">
                {t.desc}
                {sLoaded != null && (
                  <span className="rs-opt-speed mono"> · avg {fmtSpeed(sLoaded * f, metric)} / {fmtSpeed((sEmpty ?? sLoaded) * f, metric)} {unit}</span>
                )}
              </span>
            </button>
          )
        })}
        {vehicle ? (
          <div className="rs-panel-foot mono">
            Rated max {fmtSpeed(sLoaded, metric)} / {fmtSpeed(sEmpty, metric)} {unit} (loaded / empty)
          </div>
        ) : (
          <div className="rs-panel-foot">Pick a vehicle to see speeds</div>
        )}
      </FloatingPanel>
    </div>
  )
}
