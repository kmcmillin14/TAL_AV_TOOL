// CSV text for a table (RFC 4180): a cell with a comma, quote or line break is quoted, quotes doubled.
// Used by Simulate's "Copy CSV" — the same rows the screen shows, so the two never drift.

export type CsvCell = string | number | null | undefined

export function toCsv(rows: CsvCell[][]): string {
  const cell = (c: CsvCell) => {
    const s = c == null ? '' : String(c)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map(r => r.map(cell).join(',')).join('\r\n')
}
