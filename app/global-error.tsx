'use client'

// Top-level error boundary. Next renders this in place of the whole app when an
// uncaught error escapes a route. It replaces <html>/<body>, so it can't rely on
// the design system — inline the minimum. NEVER render `error.message` to the
// user (it can carry internal detail); forward it to telemetry instead.

import { useEffect } from 'react'
import { captureError } from '@/src/lib/notify'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Detail → console + telemetry sink only; the recovery UI below is the
    // user-facing message (no raw error text).
    captureError('global-error', error)
  }, [error])

  return (
    <html lang="en" data-theme="light">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <div style={{ maxWidth: 520, margin: '15vh auto', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#555', lineHeight: 1.5 }}>
            Your work autosaves to this browser, so it isn’t lost. Reload to continue —
            and if this keeps happening, export a JSON revision as a backup.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16, padding: '10px 20px', borderRadius: 8, border: 0,
              background: '#EB0A1E', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 12, color: '#999' }}>Ref: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  )
}
