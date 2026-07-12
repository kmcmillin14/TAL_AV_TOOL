'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { downloadProject, getProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import PptxSectionPicker from './rom/PptxSectionPicker'

/**
 * Save Revision (Working PDF · JSON · XLSX) + Export to Customer (branded PPTX
 * section picker), rendered inside a page header's blank space (Fleet Engine /
 * ROM Dashboard). The hero bar keeps its compact icon menu on every step.
 */
export default function ExportActions({ projectId }: { projectId: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pptxProject, setPptxProject] = useState<StoredProject | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const savePdf = async () => {
    setMenuOpen(false)
    const current = getProject(projectId)
    if (!current) return
    try {
      const { downloadProjectPdf } = await import('@/src/lib/pdfExport')
      await downloadProjectPdf(current)
    } catch (err) {
      alert(`Could not generate PDF: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const saveJson = () => {
    setMenuOpen(false)
    downloadProject(projectId)
  }

  const saveXlsx = async () => {
    setMenuOpen(false)
    const current = getProject(projectId)
    if (!current) return
    try {
      const [{ downloadProjectXlsx }, vehicles] = await Promise.all([
        import('@/src/lib/xlsxExport'),
        fetchVehiclesCached(),
      ])
      await downloadProjectXlsx(current, vehicles)
    } catch (err) {
      alert(`Could not generate workbook: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const exportPptx = () => {
    const current = getProject(projectId)
    if (current) setPptxProject(current)
  }

  return (
    <div className="eh-actions">
      <div className="header-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          className="btn ghost"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Save a re-importable revision file (PDF · JSON · XLSX)"
          onClick={() => setMenuOpen(o => !o)}
        >
          Save Revision <Icon name="chevronD" size={12} />
        </button>
        {menuOpen && (
          <div className="header-menu-popover" role="menu">
            <div className="header-menu-cap">Save this revision</div>
            <button type="button" className="header-menu-item" role="menuitem" onClick={savePdf}>
              <span>Working PDF (re-importable)</span>
              <span className="hint">.pdf</span>
            </button>
            <button type="button" className="header-menu-item" role="menuitem" onClick={saveJson}>
              <span>Project file</span>
              <span className="hint">.json</span>
            </button>
            <button type="button" className="header-menu-item" role="menuitem" onClick={saveXlsx}>
              <span>Excel workbook</span>
              <span className="hint">.xlsx</span>
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn primary"
        title="Build the branded customer deck (.pptx)"
        onClick={exportPptx}
      >
        Export to Customer
      </button>

      {pptxProject && <PptxSectionPicker project={pptxProject} onClose={() => setPptxProject(null)} />}
    </div>
  )
}
