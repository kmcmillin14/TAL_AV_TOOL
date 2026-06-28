// Copies the version-matched pdf.js worker into public/ so the browser can load
// it from a stable path (/pdf.worker.min.mjs). pdf.js v5 needs a real worker;
// the default workerSrc 404s under the bundler, and bare-specifier `new URL(...)`
// resolution is inconsistent across dev/prod — a copied static asset is
// deterministic and version-locked (re-copied on every dev/build via the
// predev/prebuild hooks, so it never drifts from the installed pdfjs-dist).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')
const dest = resolve(root, 'public/pdf.worker.min.mjs')

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`✓ pdf.js worker → public/pdf.worker.min.mjs`)
