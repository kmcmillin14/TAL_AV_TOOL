'use client'

import type { Vehicle } from '@/src/lib/vehicleLibrary'
import type { UnitSystem } from '@/src/lib/utils/units'
import { vehicleSpecSections } from '@/src/lib/vehicleDisplay'

interface Props {
  vehicle: Vehicle
  unitSystem: UnitSystem
}

export default function VehicleSpecSheet({ vehicle, unitSystem }: Props) {
  const sections = vehicleSpecSections(vehicle, unitSystem)

  return (
    <div className="spec-sheet">
      {sections.map(section => (
        <div key={section.title} className="spec-sheet-section">
          <div className="spec-sheet-title">{section.title}</div>
          <div className="spec-sheet-rows">
            {section.rows.map(row => (
              <div key={row.label} className="spec-sheet-row">
                <span className="spec-sheet-k">{row.label}</span>
                <span className="spec-sheet-v">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
