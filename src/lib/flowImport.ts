// Pure spreadsheet-paste parser for Step 3 flow import. No React, no storage.
// Input: raw clipboard/CSV text. Output: typed rows + per-line skip reasons —
// never guesses on unparseable data (spec 2026-07-18-workflow-friction-fixes).

export interface ParsedFlowRow {
  origin: string
  destination: string
  distanceFt: number
  thruPerHr: number
  liftHeightFt: number
}

export interface FlowImportResult {
  rows: ParsedFlowRow[]
  skipped: { line: number; reason: string }[]
  headerDetected: boolean
  metersConverted: boolean
}

type Col = 'origin' | 'destination' | 'distance' | 'thru' | 'lift'

const SYNONYMS: Record<Col, RegExp> = {
  origin: /^(origin|from|start)/i,
  destination: /^(dest|to$|to\b|end)/i,
  distance: /(distance|dist\b|length)/i,
  thru: /(moves|thru|throughput|rate|trips|cycles)/i,
  lift: /(lift|height)/i,
}
const DEFAULT_ORDER: Col[] = ['origin', 'destination', 'distance', 'thru', 'lift']
const M_TO_FT = 3.28084

/** Split one line on the delimiter, honoring double-quoted cells ("a, b"). */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === delim && !inQuotes) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

function toNum(cell: string): number | null {
  if (cell === '') return 0
  const n = Number(cell.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseFlowImport(text: string): FlowImportResult {
  const allLines = text.split(/\r?\n/)
  const delim = text.includes('\t') ? '\t' : ','

  // Header detect on the first non-empty line: ≥2 synonym hits AND no
  // identified numeric column (distance or thru) parses as a number — else
  // it is a data row that happens to start with From/To location names.
  let colMap: Partial<Record<Col, number>> = {}
  let headerDetected = false
  let metersConverted = false
  let headerLineIdx = -1
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].trim() === '') continue
    const cells = splitLine(allLines[i], delim)
    const found: Partial<Record<Col, number>> = {}
    for (const [col, re] of Object.entries(SYNONYMS) as [Col, RegExp][]) {
      const idx = cells.findIndex(c => re.test(c))
      if (idx !== -1 && found[col] === undefined) found[col] = idx
    }
    if (Object.keys(found).length >= 2) {
      // Guard: a true header must have ≥1 synonym hit in a numeric column
      // (distance, thru, or lift). If only origin/destination matched, the
      // row could be a data row whose location names start with "From"/"To".
      // Additionally, if a numeric column was identified but its cell parses
      // as an actual number, that also means it is a data row — not a header.
      const hasNumericCol = (['distance', 'thru', 'lift'] as const).some(c => found[c] !== undefined)
      const looksLikeData = (['distance', 'thru', 'lift'] as const).some(c => {
        const idx = found[c]
        if (idx === undefined) return false
        const cell = cells[idx] ?? ''
        return cell !== '' && toNum(cell) !== null
      })
      if (hasNumericCol && !looksLikeData) {
        headerDetected = true
        colMap = found
        headerLineIdx = i
        const distCell = found.distance !== undefined ? cells[found.distance] : ''
        metersConverted = /\(m\)|meter/i.test(distCell)
      }
    }
    break // only the first non-empty line is a header candidate
  }
  if (!headerDetected) DEFAULT_ORDER.forEach((c, i) => { colMap[c] = i })

  const rows: ParsedFlowRow[] = []
  const skipped: { line: number; reason: string }[] = []
  for (let i = 0; i < allLines.length; i++) {
    if (i === headerLineIdx || allLines[i].trim() === '') continue
    const lineNo = i + 1
    const cells = splitLine(allLines[i], delim)
    const cell = (c: Col) => (colMap[c] !== undefined ? (cells[colMap[c]!] ?? '') : '')
    const origin = cell('origin')
    const destination = cell('destination')
    if (!origin && !destination) { skipped.push({ line: lineNo, reason: 'no origin or destination' }); continue }
    const dist = toNum(cell('distance'))
    if (dist === null) { skipped.push({ line: lineNo, reason: 'distance is not a number' }); continue }
    const thru = toNum(cell('thru'))
    if (thru === null) { skipped.push({ line: lineNo, reason: 'throughput is not a number' }); continue }
    const lift = toNum(cell('lift'))
    if (lift === null) { skipped.push({ line: lineNo, reason: 'lift height is not a number' }); continue }
    rows.push({
      origin, destination,
      distanceFt: metersConverted ? Math.round(dist * M_TO_FT * 10) / 10 : dist,
      thruPerHr: thru,
      liftHeightFt: metersConverted ? Math.round(lift * M_TO_FT * 10) / 10 : lift,
    })
  }
  return { rows, skipped, headerDetected, metersConverted }
}
