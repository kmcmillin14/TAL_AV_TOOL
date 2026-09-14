/** Pallet construction for the Pallet Entry soft gate.
 *
 *  The questionnaire used to ask this as two Yes/No questions — "Stringer
 *  pallet?" and "Bottom board present?" — which described one thing and fed
 *  nothing, because the gate has always read `palletEntryType`. Both were
 *  replaced by a single entry-type select on 2026-09-14.
 *
 *  Projects answered before then still carry `palletHasStringer`, so read it as
 *  a fallback: stringer and block are the two pallet constructions, so "not a
 *  stringer" is a block pallet. `palletHasBottomBoard` is deliberately NOT
 *  consulted — bottom boards occur on both constructions, so it can't identify
 *  one. An explicit `palletEntryType` always wins.
 *
 *  Lives in its own module with no imports so the standalone questionnaire PDF
 *  can share it without pulling in storage or calc (see the header note in
 *  src/lib/questionnaire/pdfQuestionnaire.ts).
 */
export type PalletEntryType = 'stringer' | 'block' | 'not_sure'

export function effectivePalletEntryType(
  p: { palletEntryType?: PalletEntryType; palletHasStringer?: boolean }
): PalletEntryType | undefined {
  if (p.palletEntryType) return p.palletEntryType
  if (p.palletHasStringer === true) return 'stringer'
  if (p.palletHasStringer === false) return 'block'
  return undefined
}

export const PALLET_ENTRY_LABELS: Record<PalletEntryType, string> = {
  stringer: 'Stringer (2-way)',
  block: 'Block (4-way)',
  not_sure: 'Not sure',
}
