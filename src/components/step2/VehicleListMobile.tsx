'use client'

import { useState } from 'react'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import Icon from '@/src/design-system/components/Icon'
import BottomSheet from '@/src/components/mobile/BottomSheet'
import VehicleSheet from './VehicleSheet'
import type { StatusFilter } from './VehicleFilters'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'

export interface QualifiedEntry { vehicle: Vehicle; result: QualificationResult }

interface Props {
  entries: QualifiedEntry[]           // already filtered
  unitSystem: UnitSystem
  counts: { green: number; yellow: number; red: number; incomplete: number }
  categories: string[]
  manufacturers: string[]
  search: string
  onSearch: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilter: (v: StatusFilter) => void
  categoryFilter: string
  onCategoryFilter: (v: string) => void
  manufacturerFilter: string
  onManufacturerFilter: (v: string) => void
  compareIds: string[]
  maxCompare: number
  onToggleCompare: (id: string) => void
  onOpenCompare: () => void
  onClearCompare: () => void
}

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'GREEN+YELLOW', label: 'Fit' },
  { id: 'GREEN', label: 'Best' },
]

/** Phone-native Step 2: a scannable vehicle list; tapping a row opens VehicleSheet. */
export default function VehicleListMobile(props: Props) {
  const {
    entries, unitSystem, counts, categories, manufacturers,
    search, onSearch, statusFilter, onStatusFilter,
    categoryFilter, onCategoryFilter, manufacturerFilter, onManufacturerFilter,
    compareIds, maxCompare, onToggleCompare, onOpenCompare, onClearCompare,
  } = props

  const [openId, setOpenId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const active = openId ? entries.find(e => e.vehicle.id === openId) : undefined
  const extraFilters = (categoryFilter ? 1 : 0) + (manufacturerFilter ? 1 : 0)

  return (
    <div className="m-vehlist">
      {/* Filter bar */}
      <div className="m-vehfilter">
        <div className="m-search">
          <Icon name="search" size={14} />
          <input
            className="m-search-in"
            value={search}
            placeholder="Search vehicles"
            onChange={e => onSearch(e.target.value)}
          />
          {search && <button type="button" className="m-search-x" onClick={() => onSearch('')} aria-label="Clear search"><Icon name="x" size={13} /></button>}
        </div>
        <button type="button" className={`m-filterbtn${extraFilters ? ' is-on' : ''}`} onClick={() => setFiltersOpen(true)}>
          <Icon name="settings" size={13} /> Filter{extraFilters ? ` · ${extraFilters}` : ''}
        </button>
      </div>

      <div className="m-segbar" role="tablist" aria-label="Status filter">
        {STATUS_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={statusFilter === t.id}
            className={`m-seg${statusFilter === t.id ? ' is-sel' : ''}`}
            onClick={() => onStatusFilter(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="m-segbar-counts mono">
          <span className="good">{counts.green}</span>·<span className="warn">{counts.yellow}</span>·<span className="bad">{counts.red}</span>
        </span>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="m-empty">No vehicles match your filters.</div>
      ) : (
        <div className="m-vehrows">
          {entries.map(({ vehicle, result }) => {
            const barGates = [...result.hardGates, ...result.softPreferences.filter(g => !g.skipped)]
            const passed = barGates.filter(g => !g.skipped && g.passed).length
            const wip = result.status !== 'RED' && result.hardGates.some(g => g.skipped)
            return (
              <button key={vehicle.id} type="button" className="m-vrow" onClick={() => setOpenId(vehicle.id)}>
                <span className="m-vrow-thumb">
                  {vehicle.display.heroImage
                    // eslint-disable-next-line @next/next/no-img-element -- small list thumbnail sized by CSS
                    ? <img src={vehicle.display.heroImage} alt="" />
                    : <span className="m-vrow-noimg">{vehicle.display.category.slice(0, 3)}</span>}
                </span>
                <span className="m-vrow-main">
                  <span className="m-vrow-name">{vehicle.name}</span>
                  <span className="m-vrow-sub">{vehicle.display.manufacturer} · {passed}/{barGates.length} checks</span>
                </span>
                {compareIds.includes(vehicle.id) && <span className="m-vrow-cmp" aria-label="In comparison">⇄</span>}
                {wip ? <Icon name="warn" size={15} /> : <TrafficLight status={result.status} />}
                <span className="m-vrow-chev" aria-hidden>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Compare bar */}
      {compareIds.length > 0 && (
        <div className="m-comparebar">
          <span className="m-comparebar-count">{compareIds.length} selected</span>
          <button type="button" className="btn ghost" onClick={onClearCompare}>Clear</button>
          <button type="button" className="btn primary" disabled={compareIds.length < 2} onClick={onOpenCompare}>
            Compare
          </button>
        </div>
      )}

      {/* Extra filters sheet */}
      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter vehicles">
        <div className="m-sheet-fields">
          <div className="m-field">
            <label className="m-field-label">Category</label>
            <select className="m-input" value={categoryFilter} onChange={e => onCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="m-field">
            <label className="m-field-label">Manufacturer</label>
            <select className="m-input" value={manufacturerFilter} onChange={e => onManufacturerFilter(e.target.value)}>
              <option value="">All manufacturers</option>
              {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="m-sheet-actions">
          <button type="button" className="btn ghost" onClick={() => { onCategoryFilter(''); onManufacturerFilter('') }}>Reset</button>
          <button type="button" className="btn primary" onClick={() => setFiltersOpen(false)}>Show {entries.length}</button>
        </div>
      </BottomSheet>

      {active && (
        <VehicleSheet
          vehicle={active.vehicle}
          result={active.result}
          unitSystem={unitSystem}
          compared={compareIds.includes(active.vehicle.id)}
          compareDisabled={compareIds.length >= maxCompare}
          onToggleCompare={() => onToggleCompare(active.vehicle.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
