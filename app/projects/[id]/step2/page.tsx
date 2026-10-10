'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PersistentHeader from '@/src/components/PersistentHeader'
import VehicleFilters, { type StatusFilter } from '@/src/components/step2/VehicleFilters'
import VehicleCard from '@/src/components/step2/VehicleCard'
import VehicleListMobile from '@/src/components/step2/VehicleListMobile'
import ComparisonModal from '@/src/components/step2/ComparisonModal'
import Icon from '@/src/design-system/components/Icon'
import { useIsNarrow } from '@/src/lib/useIsNarrow'
import { qualifyVehicle } from '@/src/calc/trafficLight'
import { activeRequirements } from '@/src/calc/gates'

/** Short labels for the Active Requirements strip. The gate NAMES are written
 *  for the compatibility matrix, where there is room — "Operating Environment"
 *  alone was a 104px tag. With nine gates live the strip ran to 1,870px of
 *  content in a 1,536px row and wrapped to two lines.
 *
 *  Keyed by gate id with a fallback to the full name, so a gate added later
 *  degrades to its long label rather than disappearing. `reqShortNames.test.ts`
 *  asserts every gate currently in the registry has an entry. */
const REQ_SHORT: Record<string, string> = {
  weight: 'Weight',
  payload_type: 'Payload',
  transfer_method: 'Transfer',
  lift_height: 'Lift',
  outdoor: 'Env',
  temperature_env: 'Temp',
  ramp: 'Ramp',
  pallet_entry: 'Pallet',
  pallet_stacking: 'Stacking',
  certifications: 'Certs',
}
import type { ApplicationRequirements } from '@/src/calc/types'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import { useUnitSystem } from '@/src/lib/uiPrefs'
import { getProject, subscribeProjects, type StoredProject } from '@/src/lib/storage'
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
  const narrow = useIsNarrow()

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

  // Re-read storage on cross-tab writes ('storage'), focus return, and same-tab
  // mutations (subscribeProjects — e.g. an undo, or PersistentHeader meta edits).
  useEffect(() => {
    const refresh = () => {
      const proj = getProject(id)
      if (proj) setProject(proj)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    const unsub = subscribeProjects(refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      unsub()
    }
  }, [id])

  const appReq = useMemo((): ApplicationRequirements => ({
    maxLoadWeightLbs: project?.maxLoadWeightLbs ?? 0,
    typicalUnitType: project?.typicalUnitType ?? '',
    transferType: project?.transferType ?? null,
    transferHeightFt: project?.transferHeightFt ?? null,
    transferMethod: project?.transferMethod ?? '',
    deliveryPattern: project?.deliveryPattern ?? '',
    liftTypeNeeded: project?.liftTypeNeeded ?? null,
    maxLiftHeightFt: project?.maxLiftHeightFt,
    pickHeightFt: project?.pickHeightFt,
    dropHeightFt: project?.dropHeightFt,
    minAisleWidthFt: project?.minAisleWidthFt ?? 0,
    certifications: Array.isArray(project?.certifications) ? project.certifications : [],
    tempMinF: project?.tempMinF,
    tempMaxF: project?.tempMaxF,
    rampRequired: project?.rampRequired,
    maxRampGrade: project?.maxRampGrade ?? 0,
    outdoorRequired: project?.outdoorRequired,
    freezerCapable: project?.freezerCapable,
    temperatureEnvironment: project?.temperatureEnvironment,
    loadLengthIn: project?.loadLengthIn,
    loadWidthIn: project?.loadWidthIn,
    loadHeightIn: project?.loadHeightIn,
  }), [project])

  const qualifiedVehicles = useMemo(
    () => vehicles.map(vehicle => ({ vehicle, result: qualifyVehicle(vehicle, appReq) })),
    [vehicles, appReq]
  )

  const counts = useMemo(() => ({
    green:      qualifiedVehicles.filter(qv => qv.result.status === 'GREEN').length,
    yellow:     qualifiedVehicles.filter(qv => qv.result.status === 'YELLOW').length,
    red:        qualifiedVehicles.filter(qv => qv.result.status === 'RED').length,
    incomplete: qualifiedVehicles.filter(qv => qv.result.status === 'INCOMPLETE').length,
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
    if (statusFilter === 'GREEN+YELLOW' && result.status !== 'YELLOW') return false
    if (statusFilter === 'RED' && result.status !== 'RED') return false
    if (statusFilter === 'INCOMPLETE' && result.status !== 'INCOMPLETE') return false
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
  /** What is ACTUALLY gating, derived from the gate registry rather than a
   *  hand-picked list. The old strip named four fields and was wrong three
   *  ways — it missed every hard gate but Weight and every soft gate, it
   *  advertised Aisle (explicitly not a gate), and its Transfer tag read the
   *  legacy `transferMethod` the Step 1 form stopped writing, so it never
   *  rendered on a current project while the gate was live. */
  const activeReqs = useMemo(
    () => (vehicles.length > 0 ? activeRequirements(appReq, vehicles[0]) : []),
    [appReq, vehicles],
  )

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
    opportunityNumber: project.opportunityNumber,
    opportunityType: project.opportunityType,
    createdAt: project.createdAt,
    step1Complete: project.step1Complete,
    step2Complete: project.step2Complete,
  }

  const hasRequirements = activeReqs.length > 0

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
            <span className="step-num">Step 02 / 05</span>
            <h1>Vehicle Compatibility</h1>
            <div className="desc">Every vehicle, checked against your requirements.</div>
          </div>
          <div className="status-pills">
            {([
              ['GREEN', 'good', counts.green, 'Compatible'],
              ['GREEN+YELLOW', 'warn', counts.yellow, 'Review'],
              ['RED', 'bad', counts.red, 'Incompatible'],
              ...(counts.incomplete > 0 ? [['INCOMPLETE', 'neutral', counts.incomplete, 'In Progress'] as const] : []),
            ] as const).map(([filter, tone, n, label]) => (
              <button
                key={label} type="button"
                className={`pill ${tone}${statusFilter === filter ? ' is-active' : ''}`}
                aria-pressed={statusFilter === filter}
                onClick={() => setStatusFilter(statusFilter === filter ? 'ALL' : filter)}
                title={statusFilter === filter ? 'Show all vehicles' : `Show only ${label.toLowerCase()}`}
              >
                <span className="dot" /> {n} {label}
              </button>
            ))}
          </div>
        </div>

        {/* Requirements summary — every live gate, derived from GATES so the
            strip cannot drift from what is actually being checked. */}
        <div className="req-summary">
          <span className="req-summary-label">
            <Icon name="info" size={12} /> Active Requirements
            {activeReqs.length > 0 && <span className="req-count mono">{activeReqs.length}</span>}
          </span>
          {activeReqs.map(r => (
            <span key={r.id} className={`req-tag is-${r.severity}`}
              title={`${r.name}: ${r.value} — ${r.severity === 'hard' ? 'hard gate: a vehicle that fails this is RED' : 'soft gate: a vehicle that fails this is YELLOW'}`}>
              <span className="req-k">{REQ_SHORT[r.id] ?? r.name}</span>
              <strong>{r.value}</strong>
            </span>
          ))}
          {/* Aisle width is informational, never a gate (ARCHITECTURE.md §3).
              It used to sit in this row looking like one. */}
          {(project.minAisleWidthFt ?? 0) > 0 && (
            <span className="req-tag is-info" title="Aisle width is informational — it is not a gate and never changes a vehicle's status">
              <span className="req-k">Aisle</span>
              <strong>
                {unitSystem === 'metric'
                  ? `${((project.minAisleWidthFt ?? 0) * 0.3048).toFixed(1)} m`
                  : `${project.minAisleWidthFt} ft`}
              </strong>
              <span className="req-info">info</span>
            </span>
          )}
          {!hasRequirements && (
            <span className="req-tag muted">No requirements set — all vehicles shown as compatible</span>
          )}
        </div>

        {narrow ? (
          <VehicleListMobile
            entries={filtered}
            unitSystem={unitSystem}
            counts={counts}
            categories={categories}
            manufacturers={manufacturers}
            search={search}
            onSearch={setSearch}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            categoryFilter={categoryFilter}
            onCategoryFilter={setCategoryFilter}
            manufacturerFilter={manufacturerFilter}
            onManufacturerFilter={setManufacturerFilter}
            compareIds={compareIds}
            maxCompare={MAX_COMPARE}
            onToggleCompare={toggleCompare}
            onOpenCompare={() => setCompareOpen(true)}
            onClearCompare={() => setCompareIds([])}
          />
        ) : (
          <>
            {/* Filters */}
            <VehicleFilters
              search={search}
              onSearchChange={setSearch}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              categories={categories}
              manufacturers={manufacturers}
              manufacturerFilter={manufacturerFilter}
              onManufacturerFilterChange={setManufacturerFilter}
              compareOptions={vehicles.map(v => ({ id: v.id, name: v.name }))}
              compareIds={compareIds}
              maxCompare={MAX_COMPARE}
              onToggleCompare={toggleCompare}
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
                  />
                ))}
              </div>
            )}
          </>
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
