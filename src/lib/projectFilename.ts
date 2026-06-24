import type { StoredProject } from './storage'

/** Shared export filename convention: "Rev# Opp# Customer Project.<ext>".
 *  Empty parts are skipped; only filesystem-illegal characters are stripped
 *  (spaces kept). Used by the PPTX, Excel, and JSON exports so every file from a
 *  project shares one name. */
export function projectFilename(p: Pick<StoredProject,
  'versionNumber' | 'opportunityNumber' | 'opportunityType' | 'customerName' | 'projectName'>,
  ext: string,
): string {
  const oppPrefix = p.opportunityType === 'lead' ? 'LEAD' : 'OPP'
  const opp = p.opportunityNumber?.trim() ? `${oppPrefix}${p.opportunityNumber.trim()}` : ''
  const parts = [p.versionNumber?.trim(), opp, p.customerName?.trim(), p.projectName?.trim()]
    .filter(Boolean) as string[]
  const base = parts.length ? parts.join(' ') : 'TAL ROM Proposal'
  return `${base.replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()}.${ext}`
}
