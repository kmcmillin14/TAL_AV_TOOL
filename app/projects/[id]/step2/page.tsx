'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PersistentHeader from '@/src/components/PersistentHeader'
import VehicleFilters, { type StatusFilter } from '@/src/components/step2/VehicleFilters'
import VehicleCard from '@/src/components/step2/VehicleCard'
import ComparisonModal from '@/src/components/step2/ComparisonModal'
import Icon from '@/src/design-system/components/Icon'
import { qualifyVehicle } from '@/src/calc/trafficLight'
import type { ApplicationRequirements } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import { getProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'

type ProjectData = StoredProject

export default function Step2Page() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<ProjectData | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unitSystem, toggleUnitSystem] = useUnitSystem()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [manufacturerFilter, setManufacturerFilter] = useState('')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  const MAX_COMPARE = 4
  const toggleCompare = (id: string) => setCompareIds(prev =>
    prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length >= MAX_COMPARE ? prev : [...prev, id]
  )

  // Close the modal if the selection drops below the 2-vehicle minimum.
  useEffect(() => {
    if (compareIds.length < 2) setCompareOpen(false)
  }, [compareIds])

  useEffect(() => {
    const proj = getProject(id)
    if (!proj) {
      setError('Project not found.')
      setLoading(false)
      return
    }
    setProject(proj)
    fetchVehiclesCached()
      .then(vehs => {
        setVehicles(vehs)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load vehicle library.')
        setLoading(false)
      })
  }, [id])

  // Re-read storage when another tab writes (cross-tab 'storage' event) or
  // when this tab regains focus (covers same-tab edits that happened between
  // mount and return, e.g. via PersistentHeader meta inputs).
  useEffect(() => {
    const refresh = () => {
      const proj = getProject(id)
      if (proj) setProject(proj)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
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
    loadLengthIn: project?.loadLengthIn,
    loadWidthIn: project?.loadWidthIn,
    loadHeightIn: project?.loadHeightIn,
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

  const filterKey = `${statusFilter}|${search}|${categoryFilter}|${manufacturerFilter}`

  // Comparison set — preserve selection order; drop ids no longer in the library.
  const compareEntries = useMemo(
    () => compareIds
      .map(id => qualifiedVehicles.find(qv => qv.vehicle.id === id))
      .filter((qv): qv is { vehicle: Vehicle; result: ReturnType<typeof qualifyVehicle> } => qv != null),
    [compareIds, qualifiedVehicles]
  )

  if (loading) return (
    <div className="app-shell">
      <div className="step2-loading">Loading vehicles...</div>
    </div>
  )

  if (error || !project) return (
    <div className="app-shell">
      <div className="step2-error">
        <div className="step2-error-tag">Not Found</div>
        <h1>Could not load project</h1>
        <p>{error ?? 'This project does not exist in your browser. Try importing the project file or creating a new project.'}</p>
      </div>
    </div>
  )

  const headerData = {
    id: project.id,
    projectName: project.projectName ?? '',
    customerName: project.customerName ?? '',
    facilityLocation: project.facilityLocation,
    versionNumber: project.versionNumber,
    bastianRep: project.bastianRep,
    createdAt: project.createdAt,
    step1Complete: project.step1Complete,
    step2Complete: project.step2Complete,
  }

  const hasRequirements = project.transferMethod || (project.maxLoadWeightLbs ?? 0) > 0

  return (
    <div className="app-shell">
      <PersistentHeader
        project={headerData}
        currentStep={2}
        unitSystem={unitSystem}
        onUnitToggle={toggleUnitSystem}
      />

      <div className="workspace">
        {/* Page header */}
        <div className="page-header">
          <div className="page-title">
            <span className="step-num">Step 02 / 04</span>
            <h1>Vehicle Compatibility</h1>
            <div className="desc">
              Informational only — vehicles evaluated against your requirements. No selection required.
            </div>
          </div>
          <div className="status-pills">
            <span className="pill good"><span className="dot" /> {counts.green} Compatible</span>
            <span className="pill warn"><span className="dot" /> {counts.yellow} Review</span>
            <span className="pill bad"><span className="dot" /> {counts.red} Incompatible</span>
          </div>
        </div>

        {/* Requirements summary */}
        <div className="req-summary">
          <span className="req-summary-label">
            <Icon name="info" size={12} /> Active Requirements
          </span>
          {project.transferMethod && (
            <span className="req-tag">Transfer: <strong>{project.transferMethod}</strong></span>
          )}
          {project.deliveryPattern && (
            <span className="req-tag">Pattern: <strong>{project.deliveryPattern}</strong></span>
          )}
          {(project.maxLoadWeightLbs ?? 0) > 0 && (
            <span className="req-tag">
              Load: <strong>
                {unitSystem === 'metric'
                  ? `${((project.maxLoadWeightLbs ?? 0) * 0.453592).toFixed(0)} kg`
                  : `${(project.maxLoadWeightLbs ?? 0).toLocaleString()} lbs`}
              </strong>
            </span>
          )}
          {(project.minAisleWidthFt ?? 0) > 0 && (
            <span className="req-tag">
              Aisle: <strong>
                {unitSystem === 'metric'
                  ? `${((project.minAisleWidthFt ?? 0) * 0.3048).toFixed(1)} m`
                  : `${project.minAisleWidthFt} ft`}
              </strong>
              <span className="req-info">(info only)</span>
            </span>
          )}
          {!hasRequirements && (
            <span className="req-tag muted">No requirements set — all vehicles shown as compatible</span>
          )}
        </div>

        {/* Filters */}
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
          compareCount={compareIds.length}
          maxCompare={MAX_COMPARE}
          onClearCompare={() => setCompareIds([])}
          onOpenCompare={() => setCompareOpen(true)}
        />

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No vehicles match your filters</h3>
            <p>Try changing the status filter or clearing search terms.</p>
          </div>
        ) : (
          <div className="veh-grid">
            {filtered.map(({ vehicle, result }) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                result={result}
                unitSystem={unitSystem}
                filterKey={filterKey}
                selected={compareIds.includes(vehicle.id)}
                onToggleSelect={toggleCompare}
              />
            ))}
          </div>
        )}

        {/* Bottom nav */}
        <div className="step-nav">
          <Link href={`/projects/${id}/step1`} className="btn ghost">
            <Icon name="arrowL" size={13} /> Back to Requirements
          </Link>
          <div className="row">
            <span className="hint">Informational — no selection required</span>
            <Link href={`/projects/${id}/step3`} className="btn primary">
              Continue to Fleet Engine <Icon name="arrowR" size={13} />
            </Link>
          </div>
        </div>
      </div>

      {compareOpen && compareEntries.length >= 2 && (
        <ComparisonModal
          entries={compareEntries}
          unitSystem={unitSystem}
          onClose={() => setCompareOpen(false)}
          onRemove={toggleCompare}
        />
      )}
    </div>
  )
}
