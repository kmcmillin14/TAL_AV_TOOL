// Pure builders that turn project data into [placeholder, value] replacements
// for the branded ROM deck. P0 covers the cover (S1) + contact (S34) brackets.
// Later phases add money/step tokens here.
import type { StoredProject } from '@/src/lib/storage'

type Replacement = [search: string, value: string]

/** Cover (S1) + contact (S34) bracket placeholders. Only emits a replacement
 *  when the field has a value, so blank fields keep the template's editable
 *  `[bracket]` rather than becoming empty. */
export function buildCoverTokens(p: StoredProject): Replacement[] {
  const oppPrefix = p.opportunityType === 'lead' ? 'LEAD' : 'OPP'
  const projectLine = [
    p.projectName?.trim(),
    p.versionNumber?.trim() && `Rev ${p.versionNumber.trim()}`,
    p.opportunityNumber?.trim() && `${oppPrefix} ${p.opportunityNumber.trim()}`,
  ].filter(Boolean).join('  ·  ')
  // Customer name only — the facility field often holds a full street address,
  // which doesn't belong on a title page (location still shows on S18).
  const customerLine = p.customerName?.trim() ?? ''
  const rep = p.bastianRep?.trim()

  const out: Replacement[] = []
  if (rep) out.push(['[TAL Representative]', rep], ['[TAL Representative Name]', rep])
  if (projectLine) out.push(['[Project Name + Rev + OPP #]', projectLine])
  if (customerLine) out.push(['[Customer and Location]', customerLine])
  return out
}
