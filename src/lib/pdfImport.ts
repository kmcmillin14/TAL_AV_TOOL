import { importProjectFromJson, type StoredProject } from './storage'

const ATTACHMENT_NAME = 'project.json'

interface PdfAttachment {
  content: Uint8Array
  filename: string
}

/**
 * Extract project.json from an uploaded PDF and turn it into a new
 * StoredProject (saved to localStorage with a fresh id + timestamps).
 *
 * Throws user-facing error strings for each failure mode so the caller
 * can surface them as-is.
 */
export async function parseProjectPdf(file: File): Promise<StoredProject> {
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Selected file is not a PDF.')
  }

  const buf = new Uint8Array(await file.arrayBuffer())

  // Lazy import — keeps pdfjs-dist (~700KB) out of the default bundle
  // until a user actually imports a PDF.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // pdf.js needs a worker in the browser. v5 dropped the old `disableWorker`
  // option, and the default workerSrc ("./pdf.worker.mjs") 404s under the app
  // bundler — so point it at the version-matched worker copied into public/ by
  // scripts/copy-pdf-worker.mjs (predev/prebuild). Only in the browser: in
  // Node/tests there's no `window` and pdf.js uses an in-process worker.
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  }

  let doc: { getAttachments(): Promise<Record<string, PdfAttachment> | undefined | null> }
  try {
    const params = { data: buf } as Parameters<typeof pdfjsLib.getDocument>[0]
    doc = await pdfjsLib.getDocument(params).promise
  } catch {
    throw new Error("Couldn't open the PDF — the file may be corrupt or password-protected.")
  }

  let attachments: Record<string, PdfAttachment> = {}
  try {
    attachments = (await doc.getAttachments()) ?? {}
  } catch {
    attachments = {}
  }

  const att = attachments[ATTACHMENT_NAME]
  if (!att) {
    throw new Error(
      "This PDF doesn't contain TAL project data. Try exporting it again from this app, or use Import JSON.",
    )
  }

  let jsonText: string
  try {
    jsonText = new TextDecoder().decode(att.content)
  } catch {
    throw new Error('The embedded project data is unreadable — the file may be damaged.')
  }

  try {
    return importProjectFromJson(jsonText)
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error('The embedded project data failed validation.')
  }
}
