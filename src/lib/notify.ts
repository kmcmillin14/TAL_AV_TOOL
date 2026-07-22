// Centralized client error reporting. ONE place that (a) logs full detail to the
// console + a pluggable telemetry sink, and (b) shows the user a SAFE message —
// never the raw error text, which can leak xlsx/pdf-lib/internal details.
//
// Telemetry seam: call `setErrorReporter()` once at app boot (e.g. with an
// Application Insights `trackException`) to forward captured errors. Until then
// it's a no-op, so nothing here depends on a hosting/telemetry decision. See
// docs/DEPLOYMENT-AZURE.md §4 (telemetry is a pre-GA hardening item).

type ErrorReporter = (context: string, err: unknown) => void
let reporter: ErrorReporter | null = null

/** Install a telemetry sink (App Insights `trackException`, etc.). Optional. */
export function setErrorReporter(fn: ErrorReporter): void {
  reporter = fn
}

/** Capture an error to console + telemetry (private detail) — NO user-facing UI.
 *  Use from error boundaries that render their own recovery UI. */
export function captureError(context: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, err)
  try { reporter?.(context, err) } catch { /* a broken reporter must never mask the original error */ }
}

/**
 * Report a caught error: full detail captured privately, a SAFE message to the
 * user (public). `userMessage` must not interpolate `err`.
 */
export function reportError(context: string, err: unknown, userMessage: string): void {
  captureError(context, err)
  if (typeof window !== 'undefined') window.alert(userMessage)
}
