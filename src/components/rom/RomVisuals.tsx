'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { StoredProject } from '@/src/lib/storage'
import type { FleetSummary, Flow, FlowDerived } from '@/src/calc/types'
import type { RomSummary, RomCostInputs } from '@/src/calc/rom'
import {
  flowDiagramSeries, dutyCycleSeries, utilizationSeries, chargingSeries,
  batterySocSeries, capexBarsSeries, paybackSeries, tcoSeries,
} from '@/src/calc/romCharts'
import FlowDiagram from './charts/FlowDiagram'
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
import FleetMath from './FleetMath'
import RomPricingTable from './RomPricingTable'
import RomEconomics, { type RomPatch } from './RomEconomics'

interface Props {
  project: StoredProject
  flows: Flow[]
  derivedByFlowId: Map<string, FlowDerived>
  fleet: FleetSummary
  rom: RomSummary
  vehicleById: Map<string, Vehicle>
  costs: RomCostInputs
  onPatch: (patch: RomPatch) => void
  effDailyOpHr: number
  serviceLifeYears: number
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rom-card"><span className="rom-card-eyebrow">{title}</span>{children}</section>
}

type RomTab = 'overview' | 'cost' | 'operations' | 'methodology'

// Tabs group the dashboard summary-first: Overview is the customer-facing story
// (what you get, what it costs, when it pays back); the rest hold the engineering
// detail so the page isn't one long scroll.
const TABS: ReadonlyArray<{ id: RomTab; label: string }> = [
  { id: 'overview',    label: 'Overview' },
  { id: 'cost',        label: 'Cost detail' },
  { id: 'operations',  label: 'Operations' },
  { id: 'methodology', label: 'Methodology' },
]

/** The stacked visual & sales layer, organized into tabs (summary-first). */
export default function RomVisuals(p: Props) {
  const [tab, setTab] = useState<RomTab>('overview')

  const flowSeries = useMemo(() => flowDiagramSeries(p.flows, p.vehicleById, p.fleet), [p.flows, p.vehicleById, p.fleet])
  const duty = useMemo(() => dutyCycleSeries(p.flows, p.derivedByFlowId, p.fleet), [p.flows, p.derivedByFlowId, p.fleet])
  const util = useMemo(() => utilizationSeries(p.fleet, p.vehicleById), [p.fleet, p.vehicleById])
  const charge = useMemo(() => chargingSeries(p.fleet, p.vehicleById), [p.fleet, p.vehicleById])
  const soc = useMemo(() => batterySocSeries(p.fleet, p.vehicleById, p.effDailyOpHr, 0.25), [p.fleet, p.vehicleById, p.effDailyOpHr])
  const capex = useMemo(() => capexBarsSeries(p.rom, p.vehicleById), [p.rom, p.vehicleById])
  const payback = useMemo(() => paybackSeries(p.rom, p.serviceLifeYears), [p.rom, p.serviceLifeYears])
  const tco = useMemo(() => tcoSeries(p.rom, p.serviceLifeYears), [p.rom, p.serviceLifeYears])

  return (
    <div className="rom-visuals">
      <div className="engine-seg rom-tabbar" role="tablist" aria-label="ROM dashboard views">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`es-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <Card title="Operation map"><FlowDiagram series={flowSeries} /></Card>
          <div className="rom-grid">
            <Card title="ROM pricing"><RomPricingTable pricing={p.rom.pricing} vehicleById={p.vehicleById} /></Card>
            <Card title="Payback"><PaybackCurve series={payback} /></Card>
          </div>
        </>
      )}

      {tab === 'cost' && (
        <>
          <Card title="Operating cost &amp; payback"><RomEconomics costs={p.costs} rom={p.rom} onPatch={p.onPatch} /></Card>
          <Card title="ROM CAPEX"><CapexRangeBars series={capex} /></Card>
          <Card title="Total cost of ownership"><TcoStacked series={tco} /></Card>
        </>
      )}

      {tab === 'operations' && (
        <>
          <div className="rom-grid">
            <Card title="What the fleet does"><DutyCycleChart series={duty} /></Card>
            <Card title="Utilization"><UtilizationChart series={util} /></Card>
          </div>
          <div className="rom-grid">
            <Card title="Charging"><ChargingSummary series={charge} /></Card>
            <Card title="Battery state of charge"><BatterySocChart series={soc} /></Card>
          </div>
        </>
      )}

      {tab === 'methodology' && (
        <>
          <FleetMath project={p.project} flows={p.flows} derivedByFlowId={p.derivedByFlowId} fleet={p.fleet} vehicleById={p.vehicleById} />
          <Card title="Requirements met"><RequirementsMatrix project={p.project} fleet={p.fleet} vehicleById={p.vehicleById} /></Card>
          <div className="rom-grid">
            <Card title="Resilience"><SensitivityPanel fleet={p.fleet} /></Card>
            <Card title="Assumptions &amp; methodology"><AssumptionsPanel project={p.project} /></Card>
          </div>
        </>
      )}
    </div>
  )
}
