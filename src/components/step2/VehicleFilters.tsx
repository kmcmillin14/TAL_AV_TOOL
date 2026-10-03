'use client'

import { useEffect, useRef, useState } from 'react'

/** Set by the status pills in the page header — they report the counts and act
 *  as the filter, so the numbers appear once rather than in a pill and again in
 *  a dropdown option. 'GREEN+YELLOW' now means YELLOW only (the pill it sits on). */
export type StatusFilter = 'GREEN' | 'GREEN+YELLOW' | 'RED' | 'INCOMPLETE' | 'ALL'

export interface CompareOption {
  id: string
  name: string
}

interface VehicleFiltersProps {
  search: string
  onSearchChange: (v: string) => void
  categoryFilter: string
  onCategoryFilterChange: (v: string) => void
  categories: string[]
  manufacturers: string[]
  manufacturerFilter: string
  onManufacturerFilterChange: (v: string) => void
  /** Comparison controls (rendered right-aligned in the toolbar). */
  compareOptions: CompareOption[]
  compareIds: string[]
  maxCompare: number
  onToggleCompare: (id: string) => void
  onClearCompare: () => void
  onOpenCompare: () => void
}

export default function VehicleFilters({
  search, onSearchChange,
  categoryFilter, onCategoryFilterChange,
  categories,
  manufacturers, manufacturerFilter, onManufacturerFilterChange,
  compareOptions, compareIds, maxCompare, onToggleCompare, onClearCompare, onOpenCompare,
}: VehicleFiltersProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const compareCount = compareIds.length

  // Close the picker on outside click or Escape.
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

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

      <div className="vf-compare" ref={pickerRef}>
        <button
          type="button"
          className={`vf-compare-toggle ${pickerOpen ? 'open' : ''}`}
          aria-expanded={pickerOpen}
          aria-haspopup="listbox"
          onClick={() => setPickerOpen(o => !o)}
        >
          {compareCount > 0 ? `Compare · ${compareCount}` : 'Compare vehicles'}
          <span className="vf-caret" aria-hidden>▾</span>
        </button>

        {pickerOpen && (
          <div className="vf-compare-pop" role="listbox" aria-label="Select vehicles to compare">
            <div className="vf-compare-pop-head">
              Select 2–{maxCompare} to compare
            </div>
            <div className="vf-compare-list">
              {compareOptions.map(opt => {
                const checked = compareIds.includes(opt.id)
                const atMax = compareCount >= maxCompare && !checked
                return (
                  <label key={opt.id} className={`vf-compare-item ${atMax ? 'disabled' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atMax}
                      onChange={() => onToggleCompare(opt.id)}
                    />
                    <span className="vf-compare-box" aria-hidden>{checked ? '✓' : ''}</span>
                    <span className="vf-compare-name">{opt.name}</span>
                  </label>
                )
              })}
            </div>
            <div className="vf-compare-actions">
              <button
                type="button"
                className="btn ghost sm"
                disabled={compareCount === 0}
                onClick={onClearCompare}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn primary sm"
                disabled={compareCount < 2}
                onClick={() => { setPickerOpen(false); onOpenCompare() }}
              >
                Compare specs
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
