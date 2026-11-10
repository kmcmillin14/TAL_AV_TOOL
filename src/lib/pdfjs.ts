/**
 * pdf.js, loaded on first use — keeps pdfjs-dist (~700KB) out of the default bundle until a PDF is
 * actually opened. Shared by project import (`pdfImport.ts`) and the Simulate drawing
 * (`drawingImport.ts`).
 *
 * pdf.js needs a worker in the browser. v5 dropped the old `disableWorker` option, and the default
 * workerSrc ("./pdf.worker.mjs") 404s under the app bundler — so point it at the version-matched
 * worker copied into public/ by scripts/copy-pdf-worker.mjs (predev/prebuild). Only in the browser:
 * in Node/tests there's no `window` and pdf.js uses an in-process worker.
 */
export async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  }
  return pdfjsLib
}

/** Reject oversized uploads before pdf.js loads the whole file into memory and parses it on the
 *  main thread (a giant/malformed PDF could freeze the tab). */
export const MAX_PDF_BYTES = 25 * 1024 * 1024
