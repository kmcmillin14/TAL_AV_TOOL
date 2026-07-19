'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary, Flow, FlowDerived } from '@/src/calc/types'
import type { RomSummary } from '@/src/calc/rom'
import {
  flowDiagramSeries, dutyCycleSeries, utilizationSeries, chargingSeries,
  batterySocSeries, capexBarsSeries, paybackSeries, tcoSeries,
} from '@/src/calc/romCharts'
import FlowDiagram from './charts/FlowDiagram'
import FlowMapTable from './charts/FlowMapTable'
import DutyCycleChart from './charts/DutyCycleChart'
import UtilizationChart from './charts/UtilizationChart'
import ChargingSummary from './charts/ChargingSummary'
import BatterySocChart from './charts/BatterySocChart'
import CapexRangeBars from './charts/CapexRangeBars'
import PaybackCurve from './charts/PaybackCurve'
import TcoStacked from './charts/TcoStacked'
import RequirementsMatrix from './RequirementsMatrix'
import SensitivityPanel from './SensitivityPanel'
import AssumptionsPanel from './AssumptionsPanel'
import MethodologyPanel from './MethodologyPanel'
import FleetMath from './FleetMath'
import RomPricingTable from './RomPricingTable'

interface Props {
  project: StoredProject
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  fleet: FleetSummary
  rom: RomSummary
  vehicleById: Map<string, Vehicle>
  effDailyOpHr: number
  serviceLifeYears: number
}

/** Bento cell — `span` is the column count (1–4 in the 4-col grid). Any cell can
 *  be expanded to a full-screen overlay (its content re-renders larger; charts use
 *  responsive containers so they fill the space). Esc or the close button collapses it.
 *  `cellId` sets a stable HTML id on the section element for tour targeting. */
function Cell({ title, span = 1, cellId, children }: { title: string; span?: 1 | 2 | 4; cellId?: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])

  const head = (full: boolean) => (
    <div className="rom2-cell-head">
      <span className="rom-card-eyebrow">{title}</span>
      <button
        type="button"
        className="rom2-cell-fs-btn"
        onClick={() => setExpanded(!full)}
        aria-label={full ? 'Exit full screen' : 'View full screen'}
        title={full ? 'Exit full screen (Esc)' : 'View full screen'}
      >
        {full ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 9 4 4M9 9V5M9 9H5M15 9l5-5M15 9V5M15 9h4M9 15l-5 5M9 15v4M9 15H5M15 15l5 5M15 15v4M15 15h4" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        )}
      </button>
    </div>
  )

  return (
    <section id={cellId} className={`rom2-cell rom2-span-${span}`}>
      {head(false)}
      {!expanded && children}
      {expanded && createPortal(
        <div className="rom2-fs-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={() => setExpanded(false)}>
          <div className="rom2-fs-panel" onClick={e => e.stopPropagation()}>
            {head(true)}
            <div className="rom2-fs-body">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}

/** Inline collapsible sub-section (e.g. the formula reference under the walkthrough).
 *  Collapsed by default so the dashboard stays scannable. */
function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`fm-block rom2-collapse${open ? ' is-open' : ''}`}>
      <button type="button" className="rom2-sub-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="fm-subhead">{title}</span>
        <svg className="rom2-collapse-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div className="rom2-sub-body">{children}</div>}
    </div>
  )
}

/** The dashboard body as a responsive bento of cards (replaces the scroll-spy
 *  sections). Reuses the existing chart components; the driver rail + KPI band
 *  live in the page shell. */
export default function RomBento(p: Props) {
  const flowSeries = useMemo(() => flowDiagramSeries(p.flows, p.vehicleById, p.fleet), [p.flows, p.vehicleById, p.fleet])
  const duty = useMemo(() => dutyCycleSeries(p.flows, p.derivedByFlowId, p.fleet), [p.flows, p.derivedByFlowId, p.fleet])
  const util = useMemo(() => utilizationSeries(p.fleet, p.vehicleById), [p.fleet, p.vehicleById])
  const charge = useMemo(() => chargingSeries(p.fleet, p.vehicleById), [p.fleet, p.vehicleById])
  const soc = useMemo(() => batterySocSeries(p.fleet, p.vehicleById, p.effDailyOpHr, 0.25), [p.fleet, p.vehicleById, p.effDailyOpHr])
  const capex = useMemo(() => capexBarsSeries(p.rom, p.vehicleById), [p.rom, p.vehicleById])
  const payback = useMemo(() => paybackSeries(p.rom, p.serviceLifeYears), [p.rom, p.serviceLifeYears])
  const tco = useMemo(() => tcoSeries(p.rom, p.serviceLifeYears), [p.rom, p.serviceLifeYears])

  return (
    <div className="rom2-bento">
      {/* The operation map is the centerpiece — its own full-width row, with the
          backing data table underneath. */}
      <Cell title="Operation map" span={4}>
        <FlowDiagram series={flowSeries} />
        <FlowMapTable flows={p.flows} derivedByFlowId={p.derivedByFlowId} vehicleById={p.vehicleById} />
      </Cell>

      {/* The money, paired: cash over time, then the line-item detail. */}
      <Cell title="Payback" span={2}><PaybackCurve series={payback} /></Cell>
      <Cell title="Total cost of ownership" span={2}><TcoStacked series={tco} /></Cell>
      <Cell title="ROM pricing" span={2}><RomPricingTable pricing={p.rom.pricing} vehicleById={p.vehicleById} /></Cell>
      <Cell title="ROM CAPEX" span={2}><CapexRangeBars series={capex} /></Cell>

      {/* What the fleet does all day. */}
      <Cell title="What the fleet does" span={2}><DutyCycleChart series={duty} /></Cell>
      <Cell title="Utilization" span={2}><UtilizationChart series={util} /></Cell>

      {/* Battery: state-of-charge chart with the runtime table underneath, one card. */}
      <Cell title="Battery — state of charge &amp; runtime" span={4}>
        <BatterySocChart series={soc} />
        <ChargingSummary series={charge} />
      </Cell>

      {/* Trust & robustness. */}
      <Cell title="Requirements met" span={2}><RequirementsMatrix project={p.project} fleet={p.fleet} vehicleById={p.vehicleById} /></Cell>
      <Cell title="Redundancy — one vehicle down" span={2}><SensitivityPanel fleet={p.fleet} /></Cell>

      <Cell title="How the fleet is calculated" span={4} cellId="rom-fleet-math">
        <FleetMath project={p.project} flows={p.flows} derivedByFlowId={p.derivedByFlowId} fleet={p.fleet} vehicleById={p.vehicleById} />
        <CollapsibleSection title="Formulas &amp; variables" defaultOpen={false}>
          <MethodologyPanel />
        </CollapsibleSection>
      </Cell>
      <Cell title="Assumptions" span={4} cellId="rom-assumptions"><AssumptionsPanel project={p.project} /></Cell>
    </div>
  )
}
