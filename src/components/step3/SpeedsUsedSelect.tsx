'use client'

import type { RouteLayout } from '@/src/calc/types'
import { ROUTE_LAYOUT_FACTORS } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'

interface Props {
  value: RouteLayout
  vehicle?: Vehicle
  onChange: (next: RouteLayout) => void
}

interface OptionDef {
  value: RouteLayout
  label: string       // condition, short
}

// Highest-first: 70% is the realistic best-case route AVERAGE ceiling.
const OPTIONS: ReadonlyArray<OptionDef> = [
  { value: 'high',   label: 'Open, low traffic' },
  { value: 'medium', label: 'Mixed traffic' },
  { value: 'low',    label: 'Congested, many turns' },
]

function pct(layout: RouteLayout): number {
  return Math.round(ROUTE_LAYOUT_FACTORS[layout] * 100)
}

function fmtFps(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(1)
}

/**
 * "Route Average Speed" picker. Engineers choose route conditions; each tier
 * is a fraction of the vehicle's rated cruise applied as a *route average*
 * (not an instantaneous cap). 70% is the ceiling — no route sustains full
 * cruise once accel/decel/turns are averaged in. The dropdown shows the % and
 * the resulting effective loaded/empty fps for the selected vehicle.
 *
 * Backed by the same `routeLayout` enum as before; this is purely presentation.
 */
export default function SpeedsUsedSelect({ value, vehicle, onChange }: Props) {
  const sLoaded = vehicle?.calc.speedLoadedFps
  const sEmpty = vehicle?.calc.speedUnloadedFps

  const optionLabel = (opt: OptionDef) => `${pct(opt.value)}% · ${opt.label}`
  const tooltip = (opt: OptionDef) => {
    const f = ROUTE_LAYOUT_FACTORS[opt.value]
    const eLoaded = sLoaded != null ? sLoaded * f : undefined
    const eEmpty = sEmpty != null ? sEmpty * f : undefined
    return `${opt.label} — ${pct(opt.value)}% of rated cruise (route average). Effective ${fmtFps(eLoaded)} / ${fmtFps(eEmpty)} fps.`
  }

  const f = ROUTE_LAYOUT_FACTORS[value]
  const effLoaded = sLoaded != null ? sLoaded * f : undefined
  const effEmpty = sEmpty != null ? sEmpty * f : undefined
  const activeOpt = OPTIONS.find(o => o.value === value) ?? OPTIONS[1]

  return (
    <div className="route-speed-cell">
      <select
        className="speeds-used-select"
        value={value}
        onChange={e => onChange(e.target.value as RouteLayout)}
        aria-label="Route average speed (route conditions)"
        title={tooltip(activeOpt)}
      >
        {OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value} title={tooltip(opt)}>
            {optionLabel(opt)}
          </option>
        ))}
      </select>
      <span className="route-speed-fps mono">
        {vehicle ? `→ ${fmtFps(effLoaded)} / ${fmtFps(effEmpty)} fps` : 'pick a vehicle'}
      </span>
    </div>
  )
}
