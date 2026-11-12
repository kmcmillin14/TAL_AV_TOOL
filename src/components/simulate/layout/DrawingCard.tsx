'use client'

// Drawing & scale (spec v2 §5.1): an optional PDF page or image under the layout, scaled by two
// clicks and a typed length. The image is held in memory and travels in the exported project file
// (D-4); after a reload the engineer re-selects the same file and its scale is kept.

import { useRef, useState } from 'react'
import { loadDrawing, type LoadedDrawing } from '@/src/lib/drawingImport'
import { lengthFromDisplay, lengthToDisplay, units, type UnitSystem } from '@/src/lib/utils/units'
import type { EditorLayout } from './useLayoutEditor'

type Background = NonNullable<EditorLayout['background']>

interface Props {
  background: Background | undefined
  hasImage: boolean
  unitSystem: UnitSystem
  /** Scale marks placed on the drawing (0–2), and whether the canvas is collecting them. */
  marks: number
  scaling: boolean
  onLoaded: (d: LoadedDrawing) => void
  onStartScale: () => void
  onApplyScale: (lengthFt: number) => void
  onCancelScale: () => void
  onRemove: () => void
  /** Extents of the scaled drawing, ft. */
  extentsFt: { w: number; h: number } | null
}

export default function DrawingCard(p: Props) {
  const input = useRef<HTMLInputElement>(null)
  /** Re-selecting after a reload opens the stored page, so the same file keeps its scale. */
  const reselect = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [length, setLength] = useState('')
  /** The file picked this session — lets the engineer switch PDF pages without picking it again. */
  const [file, setFile] = useState<{ file: File; pageCount: number } | null>(null)
  const label = units.distance.label(p.unitSystem)
  const show = (ft: number) => lengthToDisplay(ft, p.unitSystem).toFixed(1)

  const pick = async (file: File | undefined, page?: number) => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const d = await loadDrawing(file, page)
      setFile(d.pageCount && d.pageCount > 1 ? { file, pageCount: d.pageCount } : null)
      p.onLoaded(d)
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read the file.") }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  const apply = () => {
    const v = Number(length)
    if (!(v > 0)) return
    p.onApplyScale(lengthFromDisplay(v, p.unitSystem))
    setLength('')
  }

  const fileInput = (
    <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" hidden
      onChange={e => { const page = reselect.current ? p.background?.page : undefined; reselect.current = false; pick(e.target.files?.[0], page) }} />
  )

  if (!p.background) {
    return (
      <section className="sim-card" aria-label="Drawing">
        <p className="sim-card-note">Optional — PDF page, PNG or JPG.</p>
        <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Reading…' : 'Load PDF or image'}
        </button>
        {error && <p className="sim-card-error" role="alert">{error}</p>}
        {fileInput}
      </section>
    )
  }

  const bg = p.background
  return (
    <section className="sim-card" aria-label="Drawing">
      <p className="sim-card-file" title={bg.fileName}>
        {bg.fileName}
        {file ? (
          <select className="sim-page" aria-label="PDF page" value={bg.page ?? 1} disabled={busy}
            onChange={e => pick(file.file, Number(e.target.value))}>
            {Array.from({ length: file.pageCount }, (_, i) => <option key={i} value={i + 1}>page {i + 1} of {file.pageCount}</option>)}
          </select>
        ) : bg.page ? ` · page ${bg.page}` : ''}
      </p>
      {!p.hasImage && (
        <p className="sim-card-note">
          The image is not loaded in this browser. <button type="button" className="link-btn" onClick={() => { reselect.current = true; input.current?.click() }}>Re-select the file</button>
        </p>
      )}

      {p.scaling ? (
        p.marks < 2 ? (
          <p className="sim-card-step">Click {p.marks === 0 ? 'one end' : 'the other end'} of a known dimension on the drawing. <button type="button" className="link-btn" onClick={p.onCancelScale}>Cancel</button></p>
        ) : (
          <div className="sim-card-row">
            <label className="sim-field">
              <span>Length between the marks</span>
              <span className="sim-input-unit">
                <input type="number" min={0} step="any" autoFocus value={length} onChange={e => setLength(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') apply() }} />
                <span>{label}</span>
              </span>
            </label>
            <button type="button" className="btn primary btn-sm" disabled={!(Number(length) > 0)} onClick={apply}>Set scale</button>
            <button type="button" className="link-btn" onClick={p.onCancelScale}>Cancel</button>
          </div>
        )
      ) : bg.scale ? (
        <p className="sim-card-ok">
          Scaled{p.extentsFt ? ` · ${show(p.extentsFt.w)} × ${show(p.extentsFt.h)} ${label}` : ''}
          <button type="button" className="link-btn" onClick={p.onStartScale}>Rescale</button>
        </p>
      ) : (
        <p className="sim-card-warn">
          Not scaled — Run waits for it. <button type="button" className="btn ghost btn-sm" onClick={p.onStartScale}>Set scale</button>
        </p>
      )}

      <div className="sim-card-actions">
        <button type="button" className="link-btn" disabled={busy} onClick={() => input.current?.click()}>Replace</button>
        <button type="button" className="link-btn" onClick={p.onRemove}>Remove</button>
      </div>
      {error && <p className="sim-card-error" role="alert">{error}</p>}
      {fileInput}
    </section>
  )
}
