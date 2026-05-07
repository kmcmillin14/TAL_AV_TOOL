'use client'

import { useState } from 'react'
import Link from 'next/link'
import PersistentHeader from '@/src/components/PersistentHeader'
import VehicleGrid from '@/src/components/step2/VehicleGrid'
import Icon from '@/src/design-system/components/Icon'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'

interface QualifiedVehicle {
  vehicle: Vehicle
  result: QualificationResult
}

interface Props {
  qualifiedVehicles: QualifiedVehicle[]
  projectId: string
  projectHeader: {
    id: string
    projectName: string
    customerName: string
    facilityLocation?: string | null
    versionNumber: string
    bastianRep?: string | null
    step1Complete: boolean
    step2Complete: boolean
  }
  counts: { green: number; yellow: number; red: number }
  appSummary: {
    transferMethod: string
    deliveryPattern: string
    maxLoadWeightLbs: number
    minAisleWidthFt: number
  }
}

export default function VehicleGridWrapper({
  qualifiedVehicles,
  projectId,
  projectHeader,
  counts,
  appSummary,
}: Props) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')

  return (
    <div className="app-shell">
      <PersistentHeader
        project={projectHeader}
        currentStep={2}
        unitSystem={unitSystem}
        onUnitToggle={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')}
      />

      <div className="workspace">
        <div className="page-header">
          <div className="page-title">
            <span className="step-num">Step 02 / 05</span>
            <h1>Vehicle Compatibility</h1>
            <div className="desc">
              Informational only — vehicles are evaluated against your requirements.
              No selection required to proceed.
            </div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="pill good">
              <span className="dot" /> {counts.green} Compatible
            </span>
            <span className="pill warn">
              <span className="dot" /> {counts.yellow} Review Required
            </span>
            <span className="pill bad">
              <span className="dot" /> {counts.red} Not Compatible
            </span>
          </div>
        </div>

        {/* Application summary bar */}
        <div style={{
          display: 'flex', gap: 16, padding: '12px 32px', background: 'var(--bg-surface-2)',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        }}>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="info" size={11} />
            Requirements:
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Transfer: <strong>{appSummary.transferMethod}</strong>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Pattern: <strong>{appSummary.deliveryPattern}</strong>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Load: <strong>
              {unitSystem === 'metric'
                ? `${(appSummary.maxLoadWeightLbs * 0.453592).toFixed(0)} kg`
                : `${appSummary.maxLoadWeightLbs.toLocaleString()} lbs`}
            </strong>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Aisle: <strong>
              {unitSystem === 'metric'
                ? `${(appSummary.minAisleWidthFt * 0.3048).toFixed(1)} m`
                : `${appSummary.minAisleWidthFt} ft`}
            </strong>
            <span style={{ color: 'var(--info)', marginLeft: 4, fontSize: 10 }}>(informational)</span>
          </span>
        </div>

        <VehicleGrid
          qualifiedVehicles={qualifiedVehicles}
          unitSystem={unitSystem}
        />

        {/* Step navigation */}
        <div className="step-nav">
          <Link href={`/projects/${projectId}/step1`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Requirements
          </Link>
          <div className="row">
            <span className="hint">
              This view is informational — no selection required.
            </span>
            <button className="btn primary" disabled title="Material Flows — coming in Step 3">
              Continue to Flows <Icon name="arrowR" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
