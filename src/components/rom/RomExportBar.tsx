'use client'

import { useState } from 'react'
import { downloadProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import Icon from '@/src/design-system/components/Icon'
import PptxSectionPicker from './PptxSectionPicker'
import { reportError } from '@/src/lib/notify'

interface Props { project: StoredProject }

/** ROM export — one format per audience: customer deck (PPTX), internal model
 *  (XLSX), save revision (JSON). Mirrors the PersistentHeader export menu. */
export default function RomExportBar({ project }: Props) {
  const [pptxOpen, setPptxOpen] = useState(false)

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
        title="Customer-facing ROM proposal deck"
      >
        <Icon name="export" size={18} />
        Customer deck (PowerPoint)
      </button>
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
