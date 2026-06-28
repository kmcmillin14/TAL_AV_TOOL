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

  it('every register()/name= field is a real projectSchema key', () => {
    const keys = new Set<string>()
    for (const m of SRC.matchAll(/register\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) keys.add(m[1])
    for (const m of SRC.matchAll(/name=["']([a-zA-Z0-9_]+)["']/g)) keys.add(m[1])
    expect(keys.size).toBeGreaterThan(10)
    const orphans = [...keys].filter(k => !schemaKeys.has(k))
    expect(orphans).toEqual([])
  })
})
