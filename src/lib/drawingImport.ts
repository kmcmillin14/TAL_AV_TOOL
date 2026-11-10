// Background drawing for the Simulate layout (spec v2 §5.1, D-4): a PDF page or a PNG/JPG, turned
// into one image held in memory (never in browser storage — see storage.ts). The fingerprint lets
// the engineer re-select the same file after a reload and keep its scale.

import { loadPdfjs, MAX_PDF_BYTES } from './pdfjs'

export interface LoadedDrawing {
  kind: 'pdf' | 'image'
  fileName: string
  /** PDF page shown (1-based) and how many the file has. */
  page?: number
  pageCount?: number
  fingerprint: string
  widthPx: number
  heightPx: number
  /** data: URL of the rendered page or image. */
  data: string
}

/** Longest side of a rendered PDF page, px — sharp enough to place points on a site plan. */
const RENDER_PX = 4000
/** The project file keeps images up to this many characters (simSchemas.ts) — under the 8 M
 *  characters a project file may have on import, so an exported drawing always imports again. */
const MAX_DATA_CHARS = 7_000_000

/** SHA-256 of the file, hex — recognises the same drawing when it is selected again. */
async function fingerprint(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const isPdf = (file: File) => file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')

/** Read a PDF page (default the first) or an image. Throws a plain-words message on failure. */
export async function loadDrawing(file: File, page = 1): Promise<LoadedDrawing> {
  if (file.size > MAX_PDF_BYTES) throw new Error('This file is too large (max 25 MB).')
  const bytes = await file.arrayBuffer()                       // read once: hashed, then rendered
  const fp = await fingerprint(bytes)
  if (isPdf(file)) return { ...(await renderPdfPage(new Uint8Array(bytes), page)), fileName: file.name, fingerprint: fp }
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Choose a PDF, PNG or JPG file.')
  const data = `data:${file.type};base64,${toBase64(new Uint8Array(bytes))}`
  if (data.length > MAX_DATA_CHARS) throw new Error('This image is too large to keep with the project (about 5 MB).')
  const { width, height } = await imageSize(data)
  return { kind: 'image', fileName: file.name, fingerprint: fp, widthPx: width, heightPx: height, data }
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("Couldn't read the image."))
    img.src = src
  })
}

async function renderPdfPage(bytes: Uint8Array, pageNo: number): Promise<Omit<LoadedDrawing, 'fileName' | 'fingerprint'>> {
  const pdfjsLib = await loadPdfjs()
  let doc
  try {
    doc = await pdfjsLib.getDocument({ data: bytes } as Parameters<typeof pdfjsLib.getDocument>[0]).promise
  } catch {
    throw new Error("Couldn't open the PDF — the file may be corrupt or password-protected.")
  }
  try {
    return await renderPage(doc, pageNo)
  } finally {
    void doc.destroy()                                         // release the worker's copy of the file
  }
}

async function renderPage(doc: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>, pageNo: number): Promise<Omit<LoadedDrawing, 'fileName' | 'fingerprint'>> {
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages))
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: RENDER_PX / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise
  // JPEG keeps a large plan within what the project file holds; step the quality down if needed.
  let data = ''
  for (const q of [0.85, 0.7, 0.5, 0.35]) { data = canvas.toDataURL('image/jpeg', q); if (data.length <= MAX_DATA_CHARS) break }
  if (data.length > MAX_DATA_CHARS) throw new Error('This page is too detailed to keep with the project.')
  return { kind: 'pdf', page: page.pageNumber, pageCount: doc.numPages, widthPx: canvas.width, heightPx: canvas.height, data }
}
