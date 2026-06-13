'use client'

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
  /** Comparison controls (rendered right-aligned in the toolbar). */
  compareCount: number
  maxCompare: number
  onClearCompare: () => void
  onOpenCompare: () => void
}

export default function VehicleFilters({
  search, onSearchChange,
  statusFilter, onStatusFilterChange,
  categoryFilter, onCategoryFilterChange,
  categories,
  manufacturers, manufacturerFilter, onManufacturerFilterChange,
  counts,
  compareCount, maxCompare, onClearCompare, onOpenCompare,
}: VehicleFiltersProps) {
  return (
    <div className="veh-filter-toolbar">
      <input
        className="vf-search"
        placeholder="Search vehicles..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />

      <select
        className="vf-select"
        value={statusFilter}
        onChange={e => onStatusFilterChange(e.target.value as StatusFilter)}
      >
        <option value="ALL">All vehicles ({counts.green + counts.yellow + counts.red})</option>
        <option value="GREEN">Compatible only ({counts.green})</option>
        <option value="GREEN+YELLOW">Compatible + Review ({counts.green + counts.yellow})</option>
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

      <div className="vf-compare">
        <span className="vf-compare-count">
          {compareCount > 0
            ? `${compareCount} to compare${compareCount >= maxCompare ? ` (max ${maxCompare})` : ''}`
            : `Select up to ${maxCompare} to compare`}
        </span>
        {compareCount > 0 && (
          <button type="button" className="btn ghost sm" onClick={onClearCompare}>
            Clear
          </button>
        )}
        <button
          type="button"
          className="btn primary sm"
          disabled={compareCount < 2}
          onClick={onOpenCompare}
        >
          Compare specs
        </button>
      </div>
    </div>
  )
}
