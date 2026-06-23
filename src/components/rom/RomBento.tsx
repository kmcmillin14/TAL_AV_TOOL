'use client'

import { useMemo, type ReactNode } from 'react'
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

/** Bento cell — `span` is the column count (1–4 in the 4-col grid). */
function Cell({ title, span = 1, children }: { title: string; span?: 1 | 2 | 4; children: ReactNode }) {
  return (
    <section className={`rom2-cell rom2-span-${span}`}>
      <span className="rom-card-eyebrow">{title}</span>
      {children}
    </section>
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
      <Cell title="Resilience" span={2}><SensitivityPanel fleet={p.fleet} /></Cell>

      <Cell title="How the fleet is calculated" span={4}>
        <MethodologyPanel />
        <FleetMath project={p.project} flows={p.flows} derivedByFlowId={p.derivedByFlowId} fleet={p.fleet} vehicleById={p.vehicleById} />
      </Cell>
      <Cell title="Assumptions" span={4}><AssumptionsPanel project={p.project} /></Cell>
    </div>
  )
}
