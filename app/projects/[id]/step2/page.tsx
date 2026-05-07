'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PersistentHeader from '@/src/components/PersistentHeader'
import VehicleFilters, { type StatusFilter } from '@/src/components/step2/VehicleFilters'
import Icon from '@/src/design-system/components/Icon'
import Link from 'next/link'
import VehicleCard from '@/src/components/step2/VehicleCard'
import { qualifyVehicle } from '@/src/calc/trafficLight'
import type { ApplicationRequirements } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import { useMemo } from 'react'

interface ProjectData {
  id: string
  projectName: string
  customerName: string
  facilityLocation?: string | null
  versionNumber: string
  bastianRep?: string | null
  step1Complete: boolean
  step2Complete: boolean
  maxLoadWeightLbs: number
  typicalUnitType: string
  transferMethod: string
  deliveryPattern: string
  maxLiftHeightFt?: number | null
  minAisleWidthFt: number
  certifications: string[]
  tempMinF?: number | null
  tempMaxF?: number | null
  maxRampGrade: number
  outdoorRequired: boolean
  freezerCapable: boolean
}

export default function Step2Page() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<ProjectData | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('GREEN')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [manufacturerFilter, setManufacturerFilter] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch('/api/vehicles').then(r => r.json()),
    ])
      .then(([proj, vehs]) => {
        setProject(proj)
        setVehicles(Array.isArray(vehs) ? vehs : [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load project data.')
        setLoading(false)
      })
  }, [id])

  const appReq = useMemo((): ApplicationRequirements => ({
    maxLoadWeightLbs: project?.maxLoadWeightLbs ?? 0,
    typicalUnitType: project?.typicalUnitType ?? '',
    transferMethod: project?.transferMethod ?? '',
    deliveryPattern: project?.deliveryPattern ?? '',
    maxLiftHeightFt: project?.maxLiftHeightFt,
    minAisleWidthFt: project?.minAisleWidthFt ?? 0,
    certifications: Array.isArray(project?.certifications) ? project.certifications : [],
    tempMinF: project?.tempMinF,
    tempMaxF: project?.tempMaxF,
    maxRampGrade: project?.maxRampGrade ?? 0,
    outdoorRequired: project?.outdoorRequired ?? false,
    freezerCapable: project?.freezerCapable ?? false,
  }), [project])

  const qualifiedVehicles = useMemo(
    () => vehicles.map(vehicle => ({ vehicle, result: qualifyVehicle(vehicle, appReq) })),
    [vehicles, appReq]
  )

  const counts = useMemo(() => ({
    green:  qualifiedVehicles.filter(qv => qv.result.status === 'GREEN').length,
    yellow: qualifiedVehicles.filter(qv => qv.result.status === 'YELLOW').length,
    red:    qualifiedVehicles.filter(qv => qv.result.status === 'RED').length,
  }), [qualifiedVehicles])

  const categories = useMemo(
    () => [...new Set(vehicles.map(v => v.display.category))].sort(),
    [vehicles]
  )
  const manufacturers = useMemo(
    () => [...new Set(vehicles.map(v => v.display.manufacturer))].sort(),
    [vehicles]
  )

  const filtered = useMemo(() => qualifiedVehicles.filter(({ vehicle, result }) => {
    if (statusFilter === 'GREEN' && result.status !== 'GREEN') return false
    if (statusFilter === 'GREEN+YELLOW' && result.status === 'RED') return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !vehicle.name.toLowerCase().includes(q) &&
        !vehicle.display.manufacturer.toLowerCase().includes(q) &&
        !vehicle.display.category.toLowerCase().includes(q)
      ) return false
    }
    if (categoryFilter && vehicle.display.category !== categoryFilter) return false
    if (manufacturerFilter && vehicle.display.manufacturer !== manufacturerFilter) return false
    return true
  }), [qualifiedVehicles, statusFilter, search, categoryFilter, manufacturerFilter])

  if (loading) return (
    <div className="app-shell">
      <div style={{ padding: 40, color: 'var(--text-tertiary)', fontFamily: 'var(--tal-font-numeric)', fontSize: 12 }}>
        Loading vehicles…
      </div>
    </div>
  )

  if (error || !project) return (
    <div className="app-shell">
      <div style={{ padding: '60px 40px', maxWidth: 560 }}>
        <div style={{ fontFamily: 'var(--tal-font-numeric)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12 }}>
          Database Not Connected
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
          Step 2 requires a database connection
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Project requirements are stored in PostgreSQL. Configure your connection string to continue.
        </p>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '16px 20px' }}>
          <div style={{ fontFamily: 'var(--tal-font-numeric)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
            Quick setup
          </div>
          <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <li>Get a free DB at <strong style={{ color: 'var(--text-primary)' }}>neon.tech</strong> or <strong style={{ color: 'var(--text-primary)' }}>supabase.com</strong></li>
            <li>Set <code style={{ background: 'var(--bg-surface-3)', padding: '1px 5px', borderRadius: 3, color: 'var(--info)' }}>DATABASE_URL</code> in <code style={{ background: 'var(--bg-surface-3)', padding: '1px 5px', borderRadius: 3 }}>.env</code></li>
            <li>Run <code style={{ background: 'var(--bg-surface-3)', padding: '1px 5px', borderRadius: 3 }}>npx prisma migrate dev --name init</code></li>
            <li>Restart the dev server</li>
          </ol>
        </div>
      </div>
    </div>
  )

  const headerData = {
    id: project.id,
    projectName: project.projectName,
    customerName: project.customerName,
    facilityLocation: project.facilityLocation,
    versionNumber: project.versionNumber,
    bastianRep: project.bastianRep,
    step1Complete: project.step1Complete,
    step2Complete: project.step2Complete,
  }

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
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
              Informational only — vehicles evaluated against your requirements. No selection required.
            </div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="pill good"><span className="dot" /> {counts.green} Compatible</span>
            <span className="pill warn"><span className="dot" /> {counts.yellow} Review Required</span>
            <span className="pill bad"><span className="dot" /> {counts.red} Not Compatible</span>
          </div>
        </div>

        {/* Requirements summary bar */}
        <div style={{
          display: 'flex', gap: 16, padding: '12px 24px',
          background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
        }}>
          <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="info" size={11} /> Requirements:
          </span>
          {project.transferMethod && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Transfer: <strong>{project.transferMethod}</strong></span>}
          {project.deliveryPattern && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pattern: <strong>{project.deliveryPattern}</strong></span>}
          {project.maxLoadWeightLbs > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Load: <strong>{unitSystem === 'metric' ? `${(project.maxLoadWeightLbs * 0.453592).toFixed(0)} kg` : `${project.maxLoadWeightLbs.toLocaleString()} lbs`}</strong>
            </span>
          )}
          {project.minAisleWidthFt > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Aisle: <strong>{unitSystem === 'metric' ? `${(project.minAisleWidthFt * 0.3048).toFixed(1)} m` : `${project.minAisleWidthFt} ft`}</strong>
              <span style={{ color: 'var(--info)', marginLeft: 4, fontSize: 10 }}>(informational)</span>
            </span>
          )}
          {!project.transferMethod && !project.maxLoadWeightLbs && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No requirements set — showing all vehicles as compatible</span>
          )}
        </div>

        <VehicleFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          categories={categories}
          manufacturers={manufacturers}
          manufacturerFilter={manufacturerFilter}
          onManufacturerFilterChange={setManufacturerFilter}
          counts={counts}
        />

        {filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No vehicles match your filters</h3>
            <p>Try changing the status filter or clearing search terms.</p>
          </div>
        ) : (
          <div className="veh-grid">
            {filtered.map(({ vehicle, result }) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} result={result} unitSystem={unitSystem} />
          ))}
          </div>
        )}

        <div className="step-nav">
          <Link href={`/projects/${id}/step1`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Requirements
          </Link>
          <div className="row">
            <span className="hint">Informational — no selection required</span>
            <button className="btn primary" disabled title="Material Flows — coming in Step 3">
              Continue to Flows <Icon name="arrowR" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
