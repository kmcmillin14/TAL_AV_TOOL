// Auto-generated title claims for the data slides — the slide's headline IS the
// takeaway ("Your operation needs a fleet of 12"). Pure model → string builders:
// short (≤ ~60 chars), second person, no trailing period. A claim that isn't
// computable returns null and the caller falls back to the descriptive
// FALLBACK_TITLE — a customer deck never shows a blank or a formula.
import type { FleetModel } from '@/src/lib/fleetModel'
import type { StoredProject } from '@/src/lib/storage'
import { paybackSeries } from '@/src/calc/romCharts'
import { usd, usdRange } from './layout'

export const FALLBACK_TITLE = {
  requirements: 'Application requirements',
  vehicles: 'Vehicle selection',
  fleet: 'Fleet sizing',
  flow: 'Material flow',
  financials: 'Financials',
  investment: 'Investment summary',
  roi: 'Return on investment',
} as const

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "Standard Pallet" → "pallets" · "IBC" → "IBCs" · "Other" → its description or null. */
function unitNoun(project: StoredProject): string | null {
  let raw = project.typicalUnitType?.trim()
  if (!raw) return null
  if (raw.toLowerCase() === 'other') {
    raw = project.otherUnitTypeDescription?.trim() ?? ''
    if (!raw) return null
  }
  raw = raw.replace(/^standard\s+/i, '')
  const word = /^[A-Z0-9]+$/.test(raw) ? raw : raw.toLowerCase()   // keep acronym caps
  return word.endsWith('s') ? word : `${word}s`
}

/** S18 — "Moving 2,500-lb pallets, 16 hours a day" (schedule clause optional). */
export function requirementsTitle(project: StoredProject): string | null {
  const lbs = project.maxLoadWeightLbs
  const unit = unitNoun(project)
  if (!lbs || lbs <= 0 || !unit) return null
  const claim = `Moving ${lbs.toLocaleString()}-lb ${unit}`
  const hrPerDay = Math.min(24, (project.shiftsPerDay ?? 0) * (project.hoursPerShift ?? 0))
  return hrPerDay > 0 ? `${claim}, ${hrPerDay} hours a day` : claim
}

/** S19 — "2 vehicles fit your application" (n = distinct assigned chassis). */
export function vehiclesTitle(n: number): string | null {
  if (n <= 0) return null
  return n === 1 ? 'One vehicle fits your application' : `${n} vehicles fit your application`
}

/** S21 — "Your operation needs a fleet of 12". */
export function fleetTitle(model: FleetModel): string | null {
  const sold = model.fleet.totalFleetSold
  return sold > 0 ? `Your operation needs a fleet of ${sold}` : null
}

/** S24 — "4 flows move 210 loads every hour" / "1 flow moves 35 loads every hour". */
export function flowTitle(model: FleetModel): string | null {
  const n = model.flows.length
  if (n === 0) return null
  const thru = Math.round(model.flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))
  const verb = n === 1 ? 'moves' : 'move'
  return thru > 0
    ? `${plural(n, 'flow')} ${verb} ${thru} loads every hour`
    : `${plural(n, 'flow')} across your facility`
}

/** S25 — "Payback in about 2.3 years", else the investment range. */
export function financialsTitle(model: FleetModel): string | null {
  const { rom } = model
  if (rom.payback.paybackYears != null) {
    return `Payback in about ${rom.payback.paybackYears.toFixed(1)} years`
  }
  return rom.pricing.totalMid > 0
    ? `A ${usdRange(rom.pricing.totalMin, rom.pricing.totalMax)} ROM investment` : null
}

/** S27 — "$980K – $1.2M for 13 vehicles". */
export function investmentTitle(model: FleetModel): string | null {
  const { rom, fleet } = model
  if (rom.pricing.lines.length === 0 || rom.pricing.totalMid <= 0) return null
  return `${usdRange(rom.pricing.totalMin, rom.pricing.totalMax)} for ${plural(fleet.totalFleetSold, 'vehicle')}`
}

/**
 * S28 — "$3.40M back over 10 years".
 * Returns null when payback is unavailable (no labor) OR when the cumulative
 * benefit is ≤ 0 (avoids duplicating S25's "Payback in about X.X years" claim).
 */
export function roiTitle(model: FleetModel, serviceLifeYears: number): string | null {
  const payback = model.rom.payback.paybackYears
  if (payback == null) return null
  const { points } = paybackSeries(model.rom, serviceLifeYears)
  const last = points[points.length - 1]?.cumulative
  if (last != null && last > 0) return `${usd(last)} back over ${serviceLifeYears} years`
  return null
}
