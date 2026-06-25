'use client'

import { useState } from 'react'
import { downloadProject, type StoredProject } from '@/src/lib/storage'
import Icon from '@/src/design-system/components/Icon'
import PptxSectionPicker from './PptxSectionPicker'

interface Props { project: StoredProject }

/** Proposal export — branded PowerPoint deck, plus a re-importable save file. */
export default function RomExportBar({ project }: Props) {
  const [pptxOpen, setPptxOpen] = useState(false)

  return (
    <div className="rom-export">
      <button
        type="button" className="rom-export-btn rom-export-primary"
        onClick={() => setPptxOpen(true)}
      >
        <Icon name="export" size={18} />
        Export proposal (PowerPoint)
      </button>
      <button
        type="button" className="rom-export-btn rom-export-secondary"
        onClick={() => downloadProject(project.id)}
        title="Download a .json you can re-import later (Step 00 → Import previous revision)"
      >
        <Icon name="save" size={16} />
        Save project file (.json)
      </button>
      {pptxOpen && <PptxSectionPicker project={project} onClose={() => setPptxOpen(false)} />}
    </div>
  )
}
