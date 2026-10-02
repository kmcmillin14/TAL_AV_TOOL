'use client'

import { useState } from 'react'
import { downloadProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import Icon from '@/src/design-system/components/Icon'
import PptxSectionPicker from './PptxSectionPicker'
import { reportError } from '@/src/lib/notify'
import { pricingGate } from '@/src/lib/romComplexityFromProject'

interface Props { project: StoredProject }

/** ROM export — one format per audience: customer deck (PPTX), internal model
 *  (XLSX), save revision (JSON). Mirrors the PersistentHeader export menu. */
export default function RomExportBar({ project }: Props) {
  const [pptxOpen, setPptxOpen] = useState(false)
  // The deck is the one artifact that leaves the building, and its pricing
  // slides read the ungated resolver — so while Step 4 is withholding a price,
  // the deck would print the very numbers the screen refuses to state. Blocked
  // here until the gate is moved into the resolver itself (see SPECIFICATION).
  const gate = pricingGate(project)

  const handleXlsx = async () => {
    try {
      const [{ downloadProjectXlsx }, vehicles] = await Promise.all([
        import('@/src/lib/xlsxExport'),
        fetchVehiclesCached(),
      ])
      await downloadProjectXlsx(project, vehicles)
    } catch (err) {
      reportError('export:xlsx', err, 'Could not generate the workbook. Please retry; if it persists, export a JSON backup.')
    }
  }

  return (
    <div className="rom-export">
      <button
        type="button" className="rom-export-btn rom-export-primary"
        onClick={() => setPptxOpen(true)}
        disabled={gate.blocked}
        title={gate.blocked
          ? `Not available until the project can be priced — answer on Step 1: ${gate.missingAll.join(', ')}`
          : 'Customer-facing ROM proposal deck'}
      >
        <Icon name="export" size={18} />
        Customer deck (PowerPoint)
      </button>
      {gate.blocked && (
        <p className="rom-export-blocked">
          <Icon name="warn" size={14} />
          <span>
            The customer deck is unavailable while {gate.blockedLabels.join(' and ')}{' '}
            {gate.blockedLabels.length === 1 ? 'is' : 'are'} unpriced — it would print a total the
            app is withholding. The internal model and JSON revision are unaffected.
          </span>
        </p>
      )}
      <button
        type="button" className="rom-export-btn rom-export-secondary"
        onClick={handleXlsx}
        title="Live-formula workbook for internal review"
      >
        <Icon name="export" size={16} />
        Internal model (Excel)
      </button>
      <button
        type="button" className="rom-export-btn rom-export-secondary"
        onClick={() => downloadProject(project.id)}
        title="Download a .json you can re-import later (Step 00 → Import previous revision)"
      >
        <Icon name="save" size={16} />
        Save revision (.json)
      </button>
      {pptxOpen && <PptxSectionPicker project={project} onClose={() => setPptxOpen(false)} />}
    </div>
  )
}
