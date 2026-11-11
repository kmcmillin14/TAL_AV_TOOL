'use client'

// One table of run results with "Copy CSV" (acceptance 16). The cells the screen shows are the rows the
// CSV copies — one source. A cell can carry a class (`band`, `bad`, `dim`) for the screen only.

import { useState } from 'react'
import { toCsv, type CsvCell } from '@/src/lib/utils/csv'

export type Cell = CsvCell | { v: CsvCell; cls?: string }
export interface Col { label: string; left?: boolean; band?: boolean }

const value = (c: Cell): CsvCell => (c != null && typeof c === 'object' ? c.v : c)
const cls = (c: Cell): string => (c != null && typeof c === 'object' ? c.cls ?? '' : '')

export default function DataTable({ cols, rows, foot, label }: { cols: Col[]; rows: Cell[][]; foot?: Cell[]; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const csv = toCsv([cols.map(c => c.label), ...rows.map(r => r.map(value)), ...(foot ? [foot.map(value)] : [])])
    try { await navigator.clipboard.writeText(csv); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked: nothing to do */ }
  }
  const td = (c: Cell, i: number) => {
    const k = [cols[i]?.left ? 'l' : '', cols[i]?.band ? 'band' : '', cls(c)].filter(Boolean).join(' ')
    return <td key={i} className={k || undefined}>{value(c) ?? '—'}</td>
  }
  return (
    <div className="sim-tbl-block">
      <div className="sim-tbl-wrap">
        <table className="sim-tbl" aria-label={label}>
          <thead><tr>{cols.map((c, i) => <th key={i} className={[c.left ? 'l' : '', c.band ? 'band' : ''].filter(Boolean).join(' ') || undefined}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map(td)}</tr>)}</tbody>
          {foot && <tfoot><tr>{foot.map(td)}</tr></tfoot>}
        </table>
      </div>
      <button type="button" className="link-btn sim-csv" onClick={copy}>{copied ? 'Copied ✓' : 'Copy CSV'}</button>
    </div>
  )
}
