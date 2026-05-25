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
  { value: 'low',    label: 'Tight' },
  { value: 'medium', label: 'Mixed' },
  { value: 'high',   label: 'Open' },
]

const FULL_LABEL: Record<RouteLayout, string> = {
  low:    'Tight aisles',
  medium: 'Mixed traffic',
  high:   'Open straightaway',
}

function fmtFps(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(1)
}

/**
 * "Speeds Used" picker — engineers choose route conditions, and the dropdown
 * shows the resulting effective fps (loaded / empty) per the route-layout
 * factor (50% / 70% / 90%). Same `routeLayout` data field as before; this is
 * a re-skin of RouteLayoutSelect with calmer labels and per-vehicle speeds.
 *
 * Option labels are short (`Mixed (6.9/8.1)`); full descriptions
 * (`Mixed traffic — 6.9 / 8.1 fps`) live on each option's `title` tooltip.
 */
export default function SpeedsUsedSelect({ value, vehicle, onChange }: Props) {
  const sLoaded = vehicle?.calc.speedLoadedFps
  const sEmpty = vehicle?.calc.speedUnloadedFps

  const shortLabel = (opt: OptionDef) => {
    const f = ROUTE_LAYOUT_FACTORS[opt.value]
    const eLoaded = sLoaded != null ? sLoaded * f : undefined
    const eEmpty = sEmpty != null ? sEmpty * f : undefined
    return `${opt.label} (${fmtFps(eLoaded)}/${fmtFps(eEmpty)})`
  }
  const fullTooltip = (opt: OptionDef) => {
    const f = ROUTE_LAYOUT_FACTORS[opt.value]
    const eLoaded = sLoaded != null ? sLoaded * f : undefined
    const eEmpty = sEmpty != null ? sEmpty * f : undefined
    return `${FULL_LABEL[opt.value]} — ${fmtFps(eLoaded)} / ${fmtFps(eEmpty)} fps (${Math.round(f * 100)}% of rated)`
  }

  const activeOpt = OPTIONS.find(o => o.value === value) ?? OPTIONS[1]

  return (
    <select
      className="speeds-used-select"
      value={value}
      onChange={e => onChange(e.target.value as RouteLayout)}
      aria-label="Speeds used (route conditions)"
      title={fullTooltip(activeOpt)}
    >
      {OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value} title={fullTooltip(opt)}>
          {shortLabel(opt)}
        </option>
      ))}
    </select>
  )
}
