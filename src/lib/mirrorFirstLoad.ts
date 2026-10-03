import type { ProjectFormData } from '@/src/lib/validations/schemas'

/** Mirror loads[0] into the legacy singular load fields so every consumer that
 *  still reads them keeps working: the Step 1 readiness meter and section
 *  badges, the PDF rows, and old-app parsers of new exports. The gate engine
 *  itself reads the loads array.
 *
 *  This lives outside the form because BOTH sides need it. It was previously
 *  applied only on the way to storage, so the live form state the badges and
 *  the "N of 8" meter read never carried these fields — the meter sat at 3 of 8
 *  and section 01 could not reach 'complete' however much of the load table was
 *  filled in (audit 2026-10-03). One mapping, used by both paths. */
export function mirrorFirstLoad(data: Partial<ProjectFormData>): Partial<ProjectFormData> {
  const l0 = data.loads?.[0]
  if (!l0) return data
  return {
    ...data,
    typicalUnitType: l0.unitType || undefined,
    loadLengthIn: l0.lengthIn,
    loadWidthIn: l0.widthIn,
    loadHeightIn: l0.heightIn,
    maxLoadWeightLbs: l0.weightLbs ?? undefined,
    palletBottomBoard: l0.palletSubtype,
    customPalletDescription: l0.customDescription,
    otherUnitTypeDescription: l0.otherDescription,
  }
}
