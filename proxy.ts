import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Standalone "questionnaire-only" deployment gate.
//
// When the env var QUESTIONNAIRE_ONLY is set (only on the separate Vercel
// project), this deployment exposes ONLY the customer questionnaire and the
// vehicle data it needs — every other route redirects to /questionnaire. On the
// full-app deployment the flag is unset and this is a no-op passthrough.
//
// Self-contained per the proxy contract (no shared modules/globals): it reads
// one env var + the request path.
export function proxy(request: NextRequest) {
  if (!process.env.QUESTIONNAIRE_ONLY) return NextResponse.next()

  const { pathname } = request.nextUrl
  const allowed =
    pathname === '/questionnaire' ||
    pathname.startsWith('/questionnaire/') ||
    pathname.startsWith('/api/vehicles') // the vehicle picker fetches this

  if (allowed) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = '/questionnaire'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  // Run on app routes only; skip Next internals + public static assets so they
  // always serve (and so the proxy isn't invoked on every asset request).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets|fonts|images|cutsheets|templates|pdf.worker.min.mjs).*)'],
}
