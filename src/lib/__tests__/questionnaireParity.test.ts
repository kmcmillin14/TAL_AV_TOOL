import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectSchema } from '@/src/lib/validations/schemas'

const SRC = readFileSync(
  resolve(__dirname, '../../components/questionnaire/QuestionnaireForm.tsx'),
  'utf8',
)

describe('questionnaire ↔ schema parity', () => {
  const schemaKeys = new Set(Object.keys(projectSchema.shape))

  it('every form-field key is a real projectSchema key', () => {
    const keys = new Set<string>()
    // register('field') and the field-control components that bind a name
    // (Controller / the local Chips + YesNo helpers). Scoped to those tags so
    // non-field name= props (e.g. <Icon name="check">) aren't counted.
    for (const m of SRC.matchAll(/register\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) keys.add(m[1])
    for (const m of SRC.matchAll(/<(?:Controller|Chips|YesNo)\b[^>]*\bname="([a-zA-Z0-9_]+)"/g)) keys.add(m[1])
    expect(keys.size).toBeGreaterThan(10)
    const orphans = [...keys].filter(k => !schemaKeys.has(k))
    expect(orphans).toEqual([])
  })
})
