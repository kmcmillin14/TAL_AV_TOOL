'use client'

import { useState } from 'react'
import type { StoredProject } from '@/src/lib/storage'
import { downloadProjectPdf, projectJsonBlob } from '@/src/lib/pdfExport'
import Icon from '@/src/design-system/components/Icon'

interface Props { project: StoredProject }

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Proposal export: PDF (embedded JSON) + raw project JSON. */
export default function RomExportBar({ project }: Props) {
  const [busy, setBusy] = useState(false)
  const base = (project.projectName || 'project').replace(/[^a-z0-9-_]+/gi, '_')

  return (
    <div className="rom-export">
      <button
        type="button" className="rom-export-btn rom-export-primary"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await downloadProjectPdf(project) } finally { setBusy(false) } }}
      >
        <Icon name="download" size={14} />
        {busy ? 'Building PDF…' : 'Download proposal PDF'}
      </button>
      <button
        type="button" className="rom-export-btn"
        onClick={() => download(projectJsonBlob(project), `${base}.json`)}
      >
        <Icon name="download" size={14} />
        Export JSON
      </button>
    </div>
  )
}
