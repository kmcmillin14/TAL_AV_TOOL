'use client'

import { useEffect } from 'react'
import Icon from '@/src/design-system/components/Icon'
import TrafficLight from '@/src/design-system/components/TrafficLight'
import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { QualificationResult } from '@/src/calc/types'
import type { UnitSystem } from '@/src/lib/utils/units'
import { vehicleSpecSections } from '@/src/lib/vehicleDisplay'

export interface CompareEntry {
  vehicle: Vehicle
  result: QualificationResult
}

interface Props {
  entries: CompareEntry[]
  unitSystem: UnitSystem
  onClose: () => void
  onRemove: (id: string) => void
}

export default function ComparisonModal({ entries, unitSystem, onClose, onRemove }: Props) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Every vehicle yields identical section/row labels, so the first entry
  // defines the canonical layout; values are pulled per column by index.
  const sections = entries.map(e => vehicleSpecSections(e.vehicle, unitSystem))
  const layout = sections[0] ?? []

  return (
    <div className="cmp-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Compare vehicles">
      <div className="cmp-modal" onClick={e => e.stopPropagation()}>
        <div className="cmp-head">
          <h2>Compare {entries.length} vehicle{entries.length === 1 ? '' : 's'}</h2>
          <button type="button" className="cmp-close" aria-label="Close comparison" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="cmp-scroll">
          <table className="cmp-table">
            <thead>
              <tr>
                <th className="cmp-rowhead" />
                {entries.map(({ vehicle }) => (
                  <th key={vehicle.id} className="cmp-vehhead">
                    <div className="cmp-veh-img">
                      {vehicle.display.heroImage
                        // eslint-disable-next-line @next/next/no-img-element -- small compare thumbnail
                        ? <img src={vehicle.display.heroImage} alt={vehicle.name} />
                        : <div className="cmp-veh-noimg">{vehicle.display.category}</div>}
                    </div>
                    <div className="cmp-veh-name">{vehicle.name}</div>
                    <div className="cmp-veh-mfr">{vehicle.display.manufacturer}</div>
                    <button
                      type="button"
                      className="cmp-veh-remove"
                      aria-label={`Remove ${vehicle.name} from comparison`}
                      onClick={() => onRemove(vehicle.id)}
                    >
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Status row */}
              <tr>
                <td className="cmp-rowhead">Status</td>
                {entries.map(({ vehicle, result }) => (
                  <td key={vehicle.id} className="cmp-cell">
                    <TrafficLight status={result.status} />
                  </td>
                ))}
              </tr>

              {/* Full spec sheet, grouped by section */}
              {layout.map((section, si) => (
                <SectionRows
                  key={section.title}
                  section={section}
                  sectionIndex={si}
                  sections={sections}
                  entries={entries}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="cmp-foot">
          <span className="cmp-foot-note">
            Rows that differ are emphasized · <span className="cmp-best-mark">★</span> marks the best in rows with a clear better direction.
          </span>
        </div>
      </div>
    </div>
  )
}

function SectionRows({
  section, sectionIndex, sections, entries,
}: {
  section: ReturnType<typeof vehicleSpecSections>[number]
  sectionIndex: number
  sections: ReturnType<typeof vehicleSpecSections>[]
  entries: CompareEntry[]
}) {
  return (
    <>
      <tr className="cmp-section-row">
        <td className="cmp-section" colSpan={entries.length + 1}>{section.title}</td>
      </tr>
      {section.rows.map((row, ri) => {
        const cells = sections.map(s => s[sectionIndex]?.rows[ri])
        const values = cells.map(c => c?.value ?? '—')
        const allSame = values.every(v => v === values[0])

        // Best-value: rank rows that declare a direction, when ≥2 vehicles have a
        // numeric magnitude and they aren't all equal (no winner if undifferentiated).
        const nums = cells.map(c => c?.compare?.num)
        const finite = nums.filter((n): n is number => n != null && Number.isFinite(n))
        const better = cells.find(c => c?.compare)?.compare?.better
        let best: number | null = null
        if (better && finite.length >= 2 && new Set(finite).size > 1) {
          best = better === 'higher' ? Math.max(...finite) : Math.min(...finite)
        }

        return (
          <tr key={row.label} className={allSame ? '' : 'cmp-row-diff'}>
            <td className="cmp-rowhead">{row.label}</td>
            {values.map((val, ci) => {
              const isBest = best != null && nums[ci] === best
              return (
                <td
                  key={entries[ci].vehicle.id}
                  className={`cmp-cell${allSame ? '' : ' diff'}${isBest ? ' best' : ''}`}
                >
                  {isBest && <span className="cmp-best-mark" aria-label="best">★</span>}
                  {val}
                </td>
              )
            })}
          </tr>
        )
      })}
    </>
  )
}
