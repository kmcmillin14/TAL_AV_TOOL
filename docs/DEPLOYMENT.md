# Deployment — Vercel

The app is a single Next.js project. The customer **AV Questionnaire** (`/questionnaire`) is
"split-ready": it shares only the Zod schema + enums and the public `/api/vehicles` endpoint, so it
can be served on its own URL without forking the codebase.

## Quick testing (no setup) — preview deployments

Every push / PR to GitHub gets a Vercel **Preview** URL automatically. To test the questionnaire,
open `https://<preview-url>/questionnaire`. Share that link for review. Nothing else needed.

## Standalone questionnaire deployment (its own URL)

A `proxy.ts` gate (Next 16's middleware) restricts a deployment to **only** the questionnaire when
the env var `QUESTIONNAIRE_ONLY` is set. Everything else 307-redirects to `/questionnaire`; the
vehicle-data API (`/api/vehicles`) and static assets stay available. With the flag **unset**, the
proxy is a no-op and the full app deploys normally.

Set up two Vercel projects from the **same** GitHub repo:

| Project | `QUESTIONNAIRE_ONLY` | Serves |
|---|---|---|
| Main app | _unset_ | full app (all steps) — later behind company SSO |
| Questionnaire | `1` | only `/questionnaire` (+ `/api/vehicles`, assets) |

### Steps (questionnaire project)
1. Vercel → **Add New… → Project** → import the same repo (`kmcmillin14/TAL_AV_TOOL`).
2. **Settings → Environment Variables** (Production **and** Preview):
   - `QUESTIONNAIRE_ONLY = 1`  (required — turns on the gate)
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = <key>`  (optional — exact address autocomplete; falls back
     to free OpenStreetMap when absent). If set, **restrict the key by HTTP referrer** to this
     deployment's domain in the Google Cloud console.
3. **Build settings:** default Next.js preset — Build `next build`, Install `npm install`, Node 20+.
   (The `prebuild` step copies the pdf.js worker; harmless here.)
4. (Optional) **Domains:** add e.g. `questionnaire.<yourdomain>`.
5. Deploy. Visit the root — it lands on the questionnaire; any other path redirects there.

The main-app project needs no change: leave `QUESTIONNAIRE_ONLY` unset.

### How customers use it
Customer opens the questionnaire URL → fills it in → **Export** downloads a TAL-branded PDF (with the
project JSON embedded). They send the PDF to the TAL engineer, who imports it on the main app via
**Step 00 → Import Customer Questionnaire** (PDF or JSON). No shared backend or login is involved.

## Notes & limits
- **No backend/database.** Each browser keeps its own state in `localStorage`; cross-device transfer
  is only via the exported PDF/JSON. The questionnaire's draft autosaves to its own
  `tal:questionnaire-draft` key, never the app's projects.
- **External calls from the questionnaire:** OpenStreetMap/Nominatim (default address autocomplete)
  or Google Places (if keyed). Under heavy public load, prefer a keyed Google project — Nominatim
  rate-limits a shared origin.
- **True repo split (later):** when the main app goes behind SSO, either keep the questionnaire
  project public as-is, or lift `src/lib/validations/schemas.ts` + enums into a shared package and
  extract `app/questionnaire` + `src/components/questionnaire` + `src/lib/questionnaire` into their
  own Next app. The gate above is the no-extraction option for now.
