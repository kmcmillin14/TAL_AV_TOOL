'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  currentSection?: string
  allSections: string[]
  onChange: (next: string | undefined) => void
}

/**
 * Per-row section indicator + popover for changing a flow's section.
 *
 * - Closed state: a small pill showing the current section name (or "—"
 *   for ungrouped). Clicking opens the popover.
 * - Popover: list of existing sections to choose from, an "Ungroup"
 *   option, and a "New section…" inline text input. Choosing one writes
 *   the section name and closes.
 *
 * Closes on outside-click and Escape.
 */
export default function SectionPicker({ currentSection, allSections, onChange }: Props) {
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
    onChange(next)
    setOpen(false)
    setNewName('')
  }

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault()
    const v = newName.trim()
    if (v) handlePick(v)
  }

  const label = currentSection ?? '—'
  const isUngrouped = !currentSection

  return (
    <div className="flow-section-picker" ref={wrapRef}>
      <button
        type="button"
        className={`flow-section-pill ${isUngrouped ? 'ungrouped' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={isUngrouped ? 'No section — click to set' : `Section: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="flow-section-popover" role="menu">
          <div className="flow-section-popover-head">Move to section</div>
          {allSections.length > 0 && (
            <ul className="flow-section-list">
              {allSections.map(s => (
                <li key={s}>
                  <button
                    type="button"
                    className={`flow-section-option ${s === currentSection ? 'active' : ''}`}
                    onClick={() => handlePick(s)}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className={`flow-section-option ${isUngrouped ? 'active' : ''}`}
            onClick={() => handlePick(undefined)}
          >
            Ungroup
          </button>
          <form className="flow-section-new" onSubmit={handleSubmitNew}>
            <input
              className="flow-section-new-input"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New section…"
              aria-label="New section name"
              autoFocus
            />
            <button
              type="submit"
              className="flow-section-new-submit"
              disabled={!newName.trim()}
            >
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
