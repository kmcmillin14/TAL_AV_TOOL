#!/usr/bin/env node
/**
 * Architecture invariant checks (ARCHITECTURE.md §6 audit checklist).
 * Pure greps over the source tree — no deps. Exit 1 on any violation.
 * Run by the pre-commit hook and available as `npm run check:arch` (for CI).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const violations = []
const fail = (rule, detail) => violations.push({ rule, detail })

/** Recursively collect files under `dir` matching the extension allowlist. */
function walk(dir, exts, out = []) {
  let entries
  try { entries = readdirSync(join(ROOT, dir)) } catch { return out }
  for (const name of entries) {
    const rel = join(dir, name)
    const abs = join(ROOT, rel)
    const st = statSync(abs)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === '__tests__') continue
      walk(rel, exts, out)
    } else if (exts.some(e => name.endsWith(e))) {
      out.push(rel)
    }
  }
  return out
}

const read = f => { try { return readFileSync(join(ROOT, f), 'utf8') } catch { return '' } }

/** Strip block and line comments so doc text ("no localStorage") isn't flagged. */
const stripComments = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// ── 1. Calc engine purity: src/calc/* must not import React / fs / next / use localStorage.
for (const f of walk('src/calc', ['.ts', '.tsx'])) {
  const src = stripComments(read(f))
  for (const [pat, label] of [
    [/from ['"]react['"]/, 'imports react'],
    [/from ['"]fs['"]|from ['"]node:fs['"]/, 'imports fs'],
    [/from ['"]next[/'"]/, 'imports next'],
    [/localStorage\s*[.[]/, 'uses localStorage'],
  ]) {
    if (pat.test(src)) fail('calc-purity', `${f} ${label} (src/calc must stay pure)`)
  }
}

// ── 2. Module boundaries: a step's components must not import another step's internals.
//      Exception (ARCHITECTURE.md §3): the Fleet Engine reuses step3 components.
const stepDirs = walk('src/components', ['.ts', '.tsx']).filter(f => /src\/components\/step\d/.test(f))
for (const f of stepDirs) {
  const owning = f.match(/src\/components\/(step\d)/)[1]
  const src = read(f)
  const imports = [...src.matchAll(/from ['"][^'"]*components\/(step\d)[^'"]*['"]/g)]
  for (const m of imports) {
    if (m[1] !== owning) fail('module-boundary', `${f} imports ${m[1]} (cross-step import)`)
  }
}
// app step pages: may import their own stepN components + shared, not other steps.
for (const f of walk('app', ['.tsx'])) {
  const pageMatch = f.match(/projects\/\[id\]\/(step\d)\/page\.tsx$/)
  if (!pageMatch) continue
  const owning = pageMatch[1]
  const src = read(f)
  for (const m of src.matchAll(/from ['"][^'"]*components\/(step\d)[^'"]*['"]/g)) {
    if (m[1] !== owning) fail('module-boundary', `${f} imports ${m[1]} (page should only use its own step's components)`)
  }
}

// ── 3. Typography: no forbidden fonts as a font-family value (fallback chains in
//      the CSS-variable definitions are allowed; flagged names never appear there).
for (const f of walk('app', ['.css']).concat(walk('src', ['.ts', '.tsx', '.css']))) {
  for (const line of read(f).split('\n')) {
    if (/font-family/i.test(line) && /\b(Inter|Roboto)\b/.test(line)) {
      fail('typography', `${f}: forbidden font in "${line.trim()}" (Toyota Type only)`)
    }
  }
}

// ── 4. Vehicle data lives in JSON only — no vehicle records hardcoded in components/lib.
//      Heuristic: a maxWeightLbs literal outside the JSON library or tests.
for (const f of walk('src', ['.ts', '.tsx'])) {
  if (f.includes('content/vehicles')) continue
  const src = read(f)
  if (/maxWeightLbs\s*:\s*\d{3,}/.test(src)) {
    fail('vehicle-data', `${f}: looks like hardcoded vehicle data (maxWeightLbs literal) — keep it in src/content/vehicles/*.json`)
  }
}

if (violations.length) {
  console.error('\n✗ Architecture check failed:\n')
  for (const v of violations) console.error(`  [${v.rule}] ${v.detail}`)
  console.error(`\n${violations.length} violation(s). See ARCHITECTURE.md §3/§6.\n`)
  process.exit(1)
}
console.log('✓ Architecture checks passed (calc purity · module boundaries · fonts · vehicle data)')
