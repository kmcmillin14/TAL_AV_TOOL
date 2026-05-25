'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  selectedCount: number
  existingSections: string[]
  onAssign: (sectionName: string | undefined) => void
  onDelete: () => void
  onClear: () => void
}

/**
 * Contextual toolbar rendered above the FlowsTable when ≥ 1 row is selected.
 * Bulk-assigns sectionName to all selected flows, ungroups, deletes, or
 * clears the selection. No per-row affordances for sections any more —
 * this is the only place sections are managed.
 */
export default function FlowsBulkToolbar({
  selectedCount,
  existingSections,
  onAssign,
  onDelete,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handlePick = (next: string | undefined) => {
    onAssign(next)
    setOpen(false)
    setNewName('')
  }

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault()
    const v = newName.trim()
    if (v) handlePick(v)
  }

  if (selectedCount === 0) return null

  return (
    <div className="flow-bulk-toolbar">
      <span className="flow-bulk-count">
        <strong>{selectedCount}</strong> selected
      </span>

      <div className="flow-bulk-group" ref={wrapRef}>
        <button
          type="button"
          className="flow-bulk-btn primary"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          Group as ▾
        </button>
        {open && (
          <div className="flow-bulk-popover" role="menu">
            <div className="flow-bulk-popover-head">Assign section</div>
            {existingSections.length > 0 && (
              <ul className="flow-bulk-section-list">
                {existingSections.map(s => (
                  <li key={s}>
                    <button
                      type="button"
                      className="flow-bulk-section-option"
                      onClick={() => handlePick(s)}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="flow-bulk-new" onSubmit={handleSubmitNew}>
              <input
                className="flow-bulk-new-input"
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="New section…"
                aria-label="New section name"
                autoFocus
              />
              <button
                type="submit"
                className="flow-bulk-new-submit"
                disabled={!newName.trim()}
              >
                Add
              </button>
            </form>
          </div>
        )}
      </div>

      <button type="button" className="flow-bulk-btn" onClick={() => onAssign(undefined)}>
        Ungroup
      </button>
      <button type="button" className="flow-bulk-btn danger" onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="flow-bulk-btn ghost" onClick={onClear}>
        Clear selection
      </button>
    </div>
  )
}
