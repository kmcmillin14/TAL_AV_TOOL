'use client'

import { useState } from 'react'
import type { StoredProject } from '@/src/lib/storage'
import Icon from '@/src/design-system/components/Icon'
import PptxSectionPicker from './PptxSectionPicker'

interface Props { project: StoredProject }

/** Proposal export — branded PowerPoint deck. */
export default function RomExportBar({ project }: Props) {
  const [pptxOpen, setPptxOpen] = useState(false)

  return (
    <div className="rom-export">
      <button
        type="button" className="rom-export-btn rom-export-primary"
        onClick={() => setPptxOpen(true)}
      >
        <Icon name="download" size={14} />
        Branded PowerPoint
      </button>
      {pptxOpen && <PptxSectionPicker project={project} onClose={() => setPptxOpen(false)} />}
    </div>
  )
}
