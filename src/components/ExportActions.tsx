'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { downloadProject, getProject, type StoredProject } from '@/src/lib/storage'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import PptxSectionPicker from './rom/PptxSectionPicker'

/**
 * Compact Save (project .json) + Export menu (PPTX customer deck · PDF proposal ·
 * XLSX workbook), rendered in the ROM Dashboard page header. The hero bar keeps
 * its own compact icon menu on every step; these are the low-key page actions.
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
    <div className="eh-actions eh-actions-compact">
      <button
        type="button"
        className="btn ghost btn-sm"
        title="Save the re-importable project file (.json)"
        onClick={saveJson}
      >
        <Icon name="save" size={13} /> Save
      </button>

      <div className="header-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          className="btn primary btn-sm"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Export a deliverable (PPTX customer deck · XLSX internal model)"
          onClick={() => setMenuOpen(o => !o)}
        >
          <Icon name="export" size={13} /> Export <Icon name="chevronD" size={11} />
        </button>
        {menuOpen && (
          <div className="header-menu-popover" role="menu">
            <div className="header-menu-cap">One format per audience</div>
            <button type="button" className="header-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); exportPptx() }}>
              <span>Customer deck</span>
              <span className="hint">.pptx</span>
            </button>
            <button type="button" className="header-menu-item" role="menuitem" onClick={saveXlsx}>
              <span>Internal model</span>
              <span className="hint">.xlsx</span>
            </button>
          </div>
        )}
      </div>

      {pptxProject && <PptxSectionPicker project={pptxProject} onClose={() => setPptxProject(null)} />}
    </div>
  )
}
