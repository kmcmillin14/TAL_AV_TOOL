'use client'

interface Props {
  value: string | undefined          // current group (flow.sectionName)
  groups: string[]                    // effective group names, in order
  onAssign: (group: string | undefined) => void
  onCreateGroup: (name: string) => void
}

const NEW = '__new__'
const UNGROUPED = '__ungrouped__'

/**
 * Compact per-row group selector. Lets the engineer move a flow into an
 * existing group, ungroup it, or spin up a new group inline. Group is stored
 * on the flow as `sectionName`; creating a new group also registers the name
 * at the project level (so empty groups persist) via `onCreateGroup`.
 */
export default function GroupSelect({ value, groups, onAssign, onCreateGroup }: Props) {
  const handle = (raw: string) => {
    if (raw === NEW) {
      const name = window.prompt('New group name')?.trim()
      if (name) onCreateGroup(name)
      return
    }
    onAssign(raw === UNGROUPED ? undefined : raw)
  }

  return (
    <select
      className="flow-group-select"
      value={value ?? UNGROUPED}
      onChange={e => handle(e.target.value)}
      aria-label="Flow group"
      title="Group (zone) this flow belongs to"
    >
      {groups.map(g => (
        <option key={g} value={g}>{g}</option>
      ))}
      <option value={UNGROUPED}>Ungrouped</option>
      <option value={NEW}>+ New group…</option>
    </select>
  )
}
