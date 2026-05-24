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
  label: string
}

const OPTIONS: ReadonlyArray<OptionDef> = [
  { value: 'low',    label: 'Tight aisles' },
  { value: 'medium', label: 'Mixed traffic' },
  { value: 'high',   label: 'Open straightaway' },
]

function fmtFps(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(1)
}

/**
 * "Speeds Used" picker — engineers choose route conditions, and the dropdown
 * shows the resulting effective fps (loaded / empty) per the route-layout
 * factor (50% / 70% / 90%). Same `routeLayout` data field as before; this is
 * a re-skin of RouteLayoutSelect with calmer labels and per-vehicle speeds.
 */
export default function SpeedsUsedSelect({ value, vehicle, onChange }: Props) {
  const sLoaded = vehicle?.calc.speedLoadedFps
  const sEmpty = vehicle?.calc.speedUnloadedFps

  const optionLabel = (opt: OptionDef) => {
    const f = ROUTE_LAYOUT_FACTORS[opt.value]
    const eLoaded = sLoaded != null ? sLoaded * f : undefined
    const eEmpty = sEmpty != null ? sEmpty * f : undefined
    return `${opt.label} — ${fmtFps(eLoaded)} / ${fmtFps(eEmpty)} fps`
  }

  return (
    <select
      className="speeds-used-select"
      value={value}
      onChange={e => onChange(e.target.value as RouteLayout)}
      aria-label="Speeds used (route conditions)"
    >
      {OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>
          {optionLabel(opt)}
        </option>
      ))}
    </select>
  )
}
