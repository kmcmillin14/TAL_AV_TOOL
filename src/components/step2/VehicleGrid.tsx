'use client'

import { useState, useMemo } from 'react'
import VehicleCard from './VehicleCard'
import VehicleFilters, { type StatusFilter } from './VehicleFilters'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'

interface QualifiedVehicle {
  vehicle: Vehicle
  result: QualificationResult
}

interface VehicleGridProps {
  qualifiedVehicles: QualifiedVehicle[]
  unitSystem: UnitSystem
}

export default function VehicleGrid({ qualifiedVehicles, unitSystem }: VehicleGridProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('GREEN')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [manufacturerFilter, setManufacturerFilter] = useState('')

  const categories = useMemo(
    () => [...new Set(qualifiedVehicles.map(qv => qv.vehicle.display.category))].sort(),
    [qualifiedVehicles]
  )
  const manufacturers = useMemo(
    () => [...new Set(qualifiedVehicles.map(qv => qv.vehicle.display.manufacturer))].sort(),
    [qualifiedVehicles]
  )

  const counts = useMemo(() => ({
    green:  qualifiedVehicles.filter(qv => qv.result.status === 'GREEN').length,
    yellow: qualifiedVehicles.filter(qv => qv.result.status === 'YELLOW').length,
    red:    qualifiedVehicles.filter(qv => qv.result.status === 'RED').length,
  }), [qualifiedVehicles])

  const filtered = useMemo(() => {
    return qualifiedVehicles.filter(qv => {
      const { vehicle, result } = qv

      // Status filter
      if (statusFilter === 'GREEN' && result.status !== 'GREEN') return false
      if (statusFilter === 'GREEN+YELLOW' && result.status === 'RED') return false

      // Search
      if (search) {
        const q = search.toLowerCase()
        if (
          !vehicle.name.toLowerCase().includes(q) &&
          !vehicle.display.manufacturer.toLowerCase().includes(q) &&
          !vehicle.display.category.toLowerCase().includes(q)
        ) return false
      }

      // Category
      if (categoryFilter && vehicle.display.category !== categoryFilter) return false

      // Manufacturer
      if (manufacturerFilter && vehicle.display.manufacturer !== manufacturerFilter) return false

      return true
    })
  }, [qualifiedVehicles, statusFilter, search, categoryFilter, manufacturerFilter])

  return (
    <>
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
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              result={result}
              unitSystem={unitSystem}
            />
          ))}
        </div>
      )}
    </>
  )
}
