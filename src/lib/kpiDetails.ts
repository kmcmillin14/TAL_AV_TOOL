// Per-KPI "drill" data for the Step 4 interactive KPI tiles — the breakdown
// shown on hover/pin (Power BI-style). Pure: derives display rows + mini-bar
// fractions from the FleetModel. The same shapes feed the web popover and the
// PPTX KPI tiles, so the deck and the dashboard show identical detail.
import type { FleetModel } from '@/src/lib/fleetModel'
import { money } from '@/src/lib/vehicleDisplay'

/** A mini horizontal bar in a KPI popover (`frac` is 0–1 of the row's max). */
export interface KpiBar { label: string; display: string; frac: number }
export interface KpiDetailRow { label: string; value: string }

export interface KpiDetail {
  formula?: string                 // e.g. "base 18  +charging 3  ×buffer 1.10  →  23"
  bars?: KpiBar[]                  // mini bar chart (per chassis / per flow)
  rows?: KpiDetailRow[]            // label → value lines
  note?: string
}

export type KpiId = 'fleet' | 'types' | 'flows' | 'throughput' | 'capex' | 'payback'

const bars = (items: Array<{ label: string; weight: number; display: string }>): KpiBar[] => {
  const max = Math.max(1, ...items.map(i => i.weight))
  return items.map(i => ({ label: i.label, display: i.display, frac: Math.max(0.04, i.weight / max) }))
}

/** Build the drill detail for every KPI tile from the fleet model (or the
 *  loose subset the web dashboard already has on hand). */
export function kpiDetails(
  model: Pick<FleetModel, 'fleet' | 'rom' | 'flows' | 'settings'>,
  names: Record<string, string>,
): Record<KpiId, KpiDetail> {
  const { fleet, rom, flows, settings } = model
  const nm = (id: string) => names[id] ?? id
  const mult = (1 + settings.bufferPct).toFixed(2)
  const throughput = Math.round(flows.reduce((s, f) => s + (f.thruPerHr || 0), 0))

  return {
    fleet: {
      formula: `base ${fleet.totalBaseFleet}   +charging ${fleet.totalChargingDelta}   ×buffer ${mult}   →   ${fleet.totalFleetSold}`,
      bars: bars(fleet.groups.map(g => ({ label: nm(g.vehicleId), weight: g.fleetSold, display: `${g.fleetSold}` }))),
      note: 'Fleet = ⌈(base + charging) × buffer⌉ per chassis.',
    },
    types: {
      rows: fleet.groups.map(g => ({ label: nm(g.vehicleId), value: `${g.fleetSold} veh` })),
      note: `${fleet.groups.length} chassis type${fleet.groups.length === 1 ? '' : 's'} in the fleet.`,
    },
    flows: {
      rows: flows.map(f => ({ label: `${f.origin || '—'} → ${f.destination || '—'}`, value: f.vehicleId ? nm(f.vehicleId) : 'Unassigned' })),
      note: `${flows.length} material flow${flows.length === 1 ? '' : 's'}.`,
    },
    throughput: {
      bars: bars(flows.map(f => ({ label: `${f.origin || '—'} → ${f.destination || '—'}`, weight: f.thruPerHr || 0, display: `${f.thruPerHr || 0}/hr` }))),
      note: `${throughput} moves/hr across all flows.`,
    },
    capex: {
      formula: `${money(rom.pricing.totalMin)} – ${money(rom.pricing.totalMax)}`,
      bars: bars(rom.pricing.lines.map(l => ({ label: nm(l.vehicleId), weight: l.lineMax, display: `${money(l.lineMin)}–${money(l.lineMax)}` }))),
      note: 'Budgetary ROM range — line total = qty × unit price range.',
    },
    payback: {
      rows: [
        { label: 'Simple payback', value: rom.payback.paybackYears == null ? '—' : `${rom.payback.paybackYears.toFixed(1)} yr` },
        { label: 'Annual labor offset', value: money(rom.payback.annualLaborOffset) },
        { label: 'Annual operating cost', value: money(rom.opex.annualOpex) },
      ],
      note: 'Payback = system cost ÷ annual labor offset. OPEX is informational, not netted.',
    },
  }
}
