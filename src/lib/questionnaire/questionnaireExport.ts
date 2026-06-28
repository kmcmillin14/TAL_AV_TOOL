// Standalone questionnaire export. Imports ONLY the shared schema (split-ready):
// no storage, no step internals. Produces the same wrapped envelope Step 00 imports.
import { SCHEMA_VERSION, type PartialProjectFormData } from '@/src/lib/validations/schemas'

export interface QuestionnaireEnvelope {
  schemaVersion: number
  exportedAt: string
  project: PartialProjectFormData
}

/** Wrap questionnaire answers in the envelope `importProjectFromJson` understands. */
export function buildQuestionnaireEnvelope(answers: PartialProjectFormData): QuestionnaireEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: answers,
  }
}

/** Plain-JSON download fallback (the same envelope, pretty-printed). */
export function questionnaireJsonBlob(answers: PartialProjectFormData): Blob {
  return new Blob([JSON.stringify(buildQuestionnaireEnvelope(answers), null, 2)], {
    type: 'application/json',
  })
}
