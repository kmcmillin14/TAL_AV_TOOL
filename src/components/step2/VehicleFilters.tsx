'use client'

import { type TrafficLightStatus } from '@/src/calc/types'

export type StatusFilter = 'GREEN' | 'GREEN+YELLOW' | 'ALL'

interface VehicleFiltersProps {
  search: string
  onSearchChange: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (v: StatusFilter) => void
  categoryFilter: string
  onCategoryFilterChange: (v: string) => void
  categories: string[]
  manufacturers: string[]
  manufacturerFilter: string
  onManufacturerFilterChange: (v: string) => void
  counts: { green: number; yellow: number; red: number }
}

export default function VehicleFilters({
  search, onSearchChange,
  statusFilter, onStatusFilterChange,
  categoryFilter, onCategoryFilterChange,
  categories,
  manufacturers, manufacturerFilter, onManufacturerFilterChange,
  counts,
}: VehicleFiltersProps) {
  return (
    <div className="veh-filter-toolbar">
      <input
        className="vf-search"
        placeholder="Search by name or manufacturer…"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />

      <select
        className="vf-select"
        value={statusFilter}
        onChange={e => onStatusFilterChange(e.target.value as StatusFilter)}
      >
        <option value="GREEN">🟢 Compatible only ({counts.green})</option>
        <option value="GREEN+YELLOW">🟢🟡 Review included ({counts.green + counts.yellow})</option>
        <option value="ALL">All vehicles ({counts.green + counts.yellow + counts.red})</option>
      </select>

      <select
        className="vf-select"
        value={categoryFilter}
        onChange={e => onCategoryFilterChange(e.target.value)}
      >
        <option value="">All Types</option>
        {categories.map(c => <option key={c}>{c}</option>)}
      </select>

      <select
        className="vf-select"
        value={manufacturerFilter}
        onChange={e => onManufacturerFilterChange(e.target.value)}
      >
        <option value="">All Manufacturers</option>
        {manufacturers.map(m => <option key={m}>{m}</option>)}
      </select>

      <span className="pill neutral" style={{ marginLeft: 'auto', flexShrink: 0 }}>
        <span className="dot" style={{ background: 'var(--good)' }} />
        {counts.green}
        <span className="dot" style={{ background: 'var(--warn)', marginLeft: 6 }} />
        {counts.yellow}
        <span className="dot" style={{ background: 'var(--bad)', marginLeft: 6 }} />
        {counts.red}
      </span>
    </div>
  )
}
