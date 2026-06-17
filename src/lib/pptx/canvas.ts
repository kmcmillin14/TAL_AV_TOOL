// Shared offscreen-canvas helpers for the PPTX graphic renderers (flow diagram,
// fleet-engine charts). Browser-only — every entry point returns null in a
// non-DOM context so the exporter falls back to text/tables.

/** TAL palette mirrored from the app's dark theme (app/globals.css). */
export const C = {
  red: '#EB0A1E',
  surface: '#1c1c23',
  surface2: '#24242c',
  border: '#34343f',
  textPrimary: '#f8f8fa',
  textTertiary: '#8a8a94',
  textDisabled: '#5a5a64',
  redSoft: 'rgba(235,10,30,0.16)',
  white: '#ffffff',
} as const

/** Toyota Type (body) + monospace (numeric), matching the app's two families. */
export const font = (weight: number, px: number, numeric = false) =>
  `${weight} ${px}px ${numeric
    ? "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace"
    : "'Toyota Type',-apple-system,'Segoe UI',sans-serif"}`

export function newCanvas(w: number, h: number):
  { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  return ctx ? { canvas, ctx } : null
}

export function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** PNG bytes from a canvas data URL (browser `atob`). */
export function toPngBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/png')
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
