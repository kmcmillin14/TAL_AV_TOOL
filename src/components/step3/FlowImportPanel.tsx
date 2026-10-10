'use client'

import { useMemo, useRef, useState } from 'react'
import { parseFlowImport, type ParsedFlowRow } from '@/src/lib/flowImport'

interface Props {
  onAdd: (rows: ParsedFlowRow[]) => void
  /** Open state is OWNED BY THE PARENT (2026-10-09): the trigger button moved
   *  up into the header's actions row beside "+ Group", while the panel itself
   *  must still render full-width BELOW the header. One component rendering
   *  both would have put the paste area inside a flex row of buttons. */
  open: boolean
  onClose: () => void
}

const PLACEHOLDER =
  'Paste rows from Excel/Sheets — columns: Origin, Destination, Distance (ft, one-way), Moves/hr, Lift height (optional).\nA header row is detected automatically.'

/** Inline paste-import panel (no modal — app convention is inline editing).
 *  Pure parsing lives in src/lib/flowImport.ts; this only previews + confirms. */
export default function FlowImportPanel({ onAdd, open, onClose }: Props) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => (text.trim() ? parseFlowImport(text) : null), [text])

  const close = () => { setText(''); onClose() }
  const readFile = async (f: File | undefined) => {
    if (!f) return
    setText(await f.text())
  }

  if (!open) return null
  return (
    <>
      {open && (
        <div className="flow-import-panel">
          <textarea
            className="flow-import-text mono"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={5}
            aria-label="Paste flow rows"
          />
          <div className="flow-import-foot">
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
              or choose a .csv
            </button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" hidden
              onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }} />
            {parsed && parsed.skipped.length > 0 && (
              <span className="flow-import-skips" title={parsed.skipped.map(s => `line ${s.line}: ${s.reason}`).join('\n')}>
                {parsed.skipped.length} row{parsed.skipped.length === 1 ? '' : 's'} skipped
              </span>
            )}
            <span className="flow-import-spacer" />
            <button type="button" className="btn ghost" onClick={close}>Cancel</button>
            <button
              type="button"
              className="btn primary"
              disabled={!parsed || parsed.rows.length === 0}
              onClick={() => { if (parsed) { onAdd(parsed.rows); close() } }}
            >
              Add {parsed?.rows.length ?? 0} flow{(parsed?.rows.length ?? 0) === 1 ? '' : 's'}
            </button>
          </div>
          {parsed && parsed.rows.length > 0 && (
            <table className="flow-import-preview mono">
              <tbody>
                {parsed.rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{r.origin || '—'}</td><td>→ {r.destination || '—'}</td>
                    <td className="num">{r.distanceFt} ft</td>
                    <td className="num">{r.thruPerHr}/hr</td>
                    <td className="num">{r.liftHeightFt > 0 ? `${r.liftHeightFt} ft lift` : ''}</td>
                  </tr>
                ))}
                {parsed.rows.length > 8 && (
                  <tr><td colSpan={5}>… +{parsed.rows.length - 8} more</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}
