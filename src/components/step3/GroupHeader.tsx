'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/src/design-system/components/Icon'

interface Props {
  name: string
  color: string
  count: number
  colSpan: number
  autoFocus?: boolean
  isDragOver?: boolean
  onRename: (next: string) => void
  onAddFlow: () => void
  onDelete: () => void
  /** Present only while a flow is being dragged — makes the header a drop
   *  target that moves the dropped flow into this group. */
  onDragOverGroup?: () => void
  onDropGroup?: () => void
}

/**
 * Full-width group (zone) header row. The name is edited inline — a real text
 * input committed on blur/Enter (no browser prompt). Its own "Add flow" button
 * drops a new flow straight into this group. Groups only render once created,
 * so this header never appears for an implicit/ungrouped bucket.
 */
export default function GroupHeader({
  name,
  color,
  count,
  colSpan,
  autoFocus,
  isDragOver,
  onRename,
  onAddFlow,
  onDelete,
  onDragOverGroup,
  onDropGroup,
}: Props) {
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(name), [name])
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [autoFocus])

  const commit = () => {
    const v = draft.trim()
    if (v && v !== name) onRename(v)
    else setDraft(name)
  }

  return (
    <tr
      className={`flow-group-header${isDragOver ? ' drag-over' : ''}`}
      style={{ ['--group-color' as string]: color }}
      onDragOver={onDragOverGroup ? e => { e.preventDefault(); onDragOverGroup() } : undefined}
      onDrop={onDropGroup ? e => { e.preventDefault(); onDropGroup() } : undefined}
    >
      <td colSpan={colSpan}>
        <div className="fg-head">
          <span className="fg-swatch" aria-hidden="true" />
          <input
            ref={inputRef}
            className="fg-name"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setDraft(name)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-label="Group name"
          />
          <span className="fg-count">{count} {count === 1 ? 'flow' : 'flows'}</span>
          <button type="button" className="fg-add" onClick={onAddFlow}>
            <Icon name="plus" size={12} /> Add flow
          </button>
          <button
            type="button"
            className="fg-del"
            onClick={onDelete}
            aria-label={`Delete group ${name}`}
            title="Delete group (keeps its flows, ungrouped)"
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  )
}
