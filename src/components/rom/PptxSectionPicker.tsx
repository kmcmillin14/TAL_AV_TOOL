'use client'

import { useEffect, useMemo, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { fetchVehiclesCached } from '@/src/lib/vehicleCache'
import type { StoredProject } from '@/src/lib/storage'
import { PPTX_SECTIONS } from '@/src/lib/pptx/sections'
import {
  exportBrandedRomPptx, fleetVehicleIds, defaultSelection,
} from '@/src/lib/pptxTemplateExport'

interface Props {
  project: StoredProject
  onClose: () => void
}

/** Pre-build picker: choose which sections (and which fleet-vehicle overview
 *  slides) the branded ROM deck includes, then build + download it. */
export default function PptxSectionPicker({ project, onClose }: Props) {
  const [sel, setSel] = useState(() => defaultSelection(project))
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vehIds = useMemo(() => fleetVehicleIds(project), [project])

  useEffect(() => {
    fetchVehiclesCached()
      .then(vs => setNames(Object.fromEntries(vs.map(v => [v.id, v.name]))))
      .catch(() => { /* fall back to ids */ })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const toggleSection = (k: string) =>
    setSel(s => ({ ...s, sections: { ...s.sections, [k]: !s.sections[k] } }))
  const toggleVehicle = (id: string) =>
    setSel(s => ({ ...s, vehicles: { ...s.vehicles, [id]: !s.vehicles[id] } }))

  const build = async () => {
    setBusy(true); setError(null)
    try {
      await exportBrandedRomPptx(project, sel)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
      setBusy(false)
    }
  }

  const Row = ({ on, label, onToggle, disabled }: { on: boolean; label: string; onToggle?: () => void; disabled?: boolean }) => (
    <label className={`chk pptx-pick-row${on ? ' on' : ''}${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={onToggle} />
      <span className="box">{on && <Icon name="check" size={10} />}</span>
      <span>{label}{disabled && <span className="pptx-pick-always"> · always</span>}</span>
    </label>
  )

  return (
    <div className="cmp-overlay" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="Choose PowerPoint sections">
      <div className="cmp-modal pptx-pick-modal" onClick={e => e.stopPropagation()}>
        <div className="cmp-head">
          <h2>Build branded PowerPoint</h2>
          <button type="button" className="cmp-close" aria-label="Close" onClick={onClose} disabled={busy}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="cmp-scroll pptx-pick-body">
          <div className="pptx-pick-hint">Choose the sections to include. The TAL template’s theme and layout are preserved.</div>
          <div className="pptx-pick-grid">
            {PPTX_SECTIONS.map(s => (
              <Row key={s.key} label={s.label} on={s.always || !!sel.sections[s.key]} disabled={s.always} onToggle={() => toggleSection(s.key)} />
            ))}
          </div>

          <div className="pptx-pick-subhead">Product Overviews <span className="pptx-pick-always">· fleet chassis only</span></div>
          {vehIds.length === 0 ? (
            <div className="pptx-pick-hint">No vehicles assigned to flows yet — no product slides will be included.</div>
          ) : (
            <div className="pptx-pick-grid">
              {vehIds.map(id => (
                <Row key={id} label={names[id] ?? id} on={!!sel.vehicles[id]} onToggle={() => toggleVehicle(id)} />
              ))}
            </div>
          )}
        </div>

        <div className="cmp-foot pptx-pick-foot">
          {error && <span className="pptx-pick-error">{error}</span>}
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary sm" onClick={build} disabled={busy}>
            {busy ? 'Building…' : 'Build PPTX'}
          </button>
        </div>
      </div>
    </div>
  )
}
