import { importProjectFromJson, type StoredProject } from './storage'
import { loadPdfjs, MAX_PDF_BYTES } from './pdfjs'

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
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('This PDF is too large to import (max 25 MB).')
  }

  const buf = new Uint8Array(await file.arrayBuffer())

  const pdfjsLib = await loadPdfjs()

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
