// Standalone questionnaire export. Imports ONLY the shared schema (split-ready):
// no storage, no step internals. Produces the same wrapped envelope Step 00 imports.
import { SCHEMA_VERSION, type PartialProjectFormData } from '@/src/lib/validations/schemas'

export interface QuestionnaireEnvelope {
  schemaVersion: number
  exportedAt: string
  project: PartialProjectFormData
}

/** Map questionnaire-specific fields onto the canonical Step-1 fields so an
 *  imported project surfaces them in the main app (which reads bastianRep as the
 *  "TAL engineer" and desiredInstallDate as the install date). Non-destructive:
 *  only fills a canonical field when it's empty. */
function normalizeForPort(a: PartialProjectFormData): PartialProjectFormData {
  return {
    ...a,
    bastianRep: a.bastianRep || a.talRepName,
    desiredInstallDate: a.desiredInstallDate || a.targetGoLiveDate,
  }
}

/** Wrap questionnaire answers in the envelope `importProjectFromJson` understands. */
export function buildQuestionnaireEnvelope(answers: PartialProjectFormData): QuestionnaireEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: normalizeForPort(answers),
  }
}

/** Plain-JSON download fallback (the same envelope, pretty-printed). */
export function questionnaireJsonBlob(answers: PartialProjectFormData): Blob {
  return new Blob([JSON.stringify(buildQuestionnaireEnvelope(answers), null, 2)], {
    type: 'application/json',
  })
}
