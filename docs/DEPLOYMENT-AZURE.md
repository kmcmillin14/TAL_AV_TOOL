# Deployment — Azure / Entra SSO (enterprise readiness)

Risk register + hardening backlog for putting the TAL Fleet Calculator behind Azure
hosting and Entra ID SSO. Grounded in the app's actual architecture: a **client-side
Next.js 16 app**, **no backend database** (state in the browser's `localStorage`), one
`proxy.ts` middleware, one API route (`/api/vehicles`, static JSON), and export/import
via downloaded files. Hosting is IT's choice — this covers the candidate architectures.

> **The single most important fact for IT:** there is no server-side user data. Every
> engineer's projects live only in *their browser profile's* localStorage. This makes
> hosting/SSO trivial for compute and data-governance — and makes **browser-profile
> durability the #1 enterprise risk** (see §3).

---

## 1. Hosting / runtime

| Risk | Detail | Mitigation |
|---|---|---|
| **SWA middleware gap** | Azure **Static Web Apps'** Next.js support historically lags on middleware/App Router edge features; `proxy.ts` (the `QUESTIONNAIRE_ONLY` gate) and SSR routing may not run as on Vercel. | **Recommend App Service (Node 20) or Container Apps** running `next start`, not SWA. If SWA is mandated, validate `proxy.ts` + `/api/vehicles` on a preview slot first. |
| **prebuild step** | `npm run prebuild` copies the pdf.js worker into `public/` — required for PDF import. Azure build pipelines that skip lifecycle scripts will ship a broken import. | Ensure the build runs `npm run build` (which triggers `prebuild`), or add an explicit copy step. |
| **Static assets behind auth** | Fonts (`ToyotaType-*.otf`), vehicle images, and the pdf worker are served from `/public`. Behind Easy Auth everything requires a token — a CDN split without auth headers 401s. | Serve assets from the same authenticated origin, or configure the CDN/Front Door to forward auth. Verify the Toyota Type fallback chain renders if fonts 401 (it exists in `globals.css`). |
| **Node/runtime drift** | Next 16 + React 19 need Node 20+. | Pin the App Service Node version to 20 LTS. |

**Recommendation for IT:** **App Service (Linux, Node 20) + Easy Auth (Entra)**, or Container
Apps if they prefer images. Front Door optional for WAF/custom domain. Avoid SWA unless a
preview slot proves middleware + API route work.

## 2. SSO (Entra ID)

| Risk | Detail | Mitigation |
|---|---|---|
| **Deep-link return path** | Engineers share `/projects/[id]/step3` links. The Easy Auth login redirect must return to the *original* path, not `/`. | Set Easy Auth `post_login_redirect` to honor the requested URL; test a cold deep link while logged out. |
| **Silent token expiry mid-session** | Data is safe (autosave is local), but an expired token can 401 an export (PPTX/XLSX generation, `/api/vehicles` fetch) with a confusing failure. | Test export + vehicle-fetch after token expiry; surface a "session expired — reload" message instead of a silent no-op. |
| **Teams / webview embedding** | If opened inside a Teams tab or webview, third-party auth cookies are blocked → login loop. | Document "open in browser"; if Teams embedding is required, use the Teams SSO/MSAL flow, not cookie redirect. |
| **App Proxy header/cookie limits** | Behind Entra Application Proxy, large Easy Auth cookies can exceed header size limits. | Test through the actual App Proxy; consider token-store trimming. |
| **Conditional Access / device compliance** | CA policies (managed-device-only, MFA) can block contractors/partners who are legitimate users. | Confirm the intended audience is in scope; add a guest/contractor access path if needed. |

## 3. localStorage durability — the highest-severity risk class

State lives in `localStorage`. In an enterprise browser fleet this is fragile:

| Risk | Severity | Detail |
|---|---|---|
| **VDI / Citrix non-persistent profiles** | **BLOCKER for VDI users** | Non-persistent virtual desktops wipe the profile every logoff — every unsaved quote vanishes. Common in enterprise. |
| **"Clear browsing data on exit" GPO** | High | Group Policy that clears site data on close wipes projects nightly. |
| **Edge profile roaming** | Medium | Enterprise Edge sync does **not** roam localStorage — an engineer on a second machine sees nothing. |
| **Shared / kiosk profiles** | Medium | Multiple engineers on one Windows profile bleed projects into one localStorage. |
| **DLP / SmartScreen on downloads** | Medium | Exported `.json` / `.xlsx` / `.pptx` may be quarantined or blocked by DLP, breaking the save/transfer path. |

**Mitigations (drives the backlog):**
- `navigator.storage.persist()` on load (asks the browser to protect the origin's storage) + a **storage-health banner** when persistence is denied or quota is low.
- An **unexported-changes nag** ("this project hasn't been saved to a file in N days").
- **Fast-track the auto-backup / project-list feature** (already parked) — for VDI users a File System Access API mirror or a lightweight server-side save is the only real fix. *This elevates the parked "project workspace" trio from nice-to-have to launch-blocking for any VDI cohort.*
- **Documented VDI guidance**: "export a JSON after every working session."

## 4. Scale / operations

| Risk | Detail | Mitigation |
|---|---|---|
| **"Too many users"** | **Non-issue for compute** — the app is client-side; the one API route serves a tiny static JSON. Horizontal scale is trivial. | No action; App Service basic tier handles a large org. |
| **Address autocomplete rate limits** | The questionnaire calls **Nominatim (OpenStreetMap)** by default and **Google Places** if keyed (`src/components/questionnaire/AddressInput.tsx`). Behind a shared corporate egress IP, Nominatim rate-limits the whole org to one bucket. | **Key Google Places** (referrer-restricted) for any real volume, or disable autocomplete on the internal deployment (address is free-text anyway). |
| **No telemetry** | There is **zero** client telemetry today — a user reporting "it's broken" is undebuggable. | Add **Application Insights** web SDK (page views, JS errors, export failures). Small, high-leverage. |
| **Corporate proxy stripping fonts** | Proxies that block `.otf` would drop Toyota Type. | The `var(--tal-font-family)` fallback chain exists — verify it renders acceptably; whitelist the font path if needed. |

## 5. Governance / security review (one paragraph for InfoSec)

No backend database and no server-side PII at rest — customer/application data lives only in
the engineer's browser and in files they explicitly export. The **data egress points** are:
(a) file exports (PPTX/XLSX/JSON) the engineer downloads, and (b) the questionnaire's outbound
address-autocomplete calls to Nominatim/Google. There is no telemetry or analytics beacon today.
Behind Entra SSO the app is a single-tenant internal tool; the customer questionnaire (if
deployed publicly via `QUESTIONNAIRE_ONLY`) is anonymous and stores only its own draft in the
visitor's browser.

## 6. Hardening backlog (ranked)

**Launch blockers**
1. Decide hosting (recommend App Service + Easy Auth) and validate `proxy.ts` + `/api/vehicles` + `prebuild` on it.
2. VDI/non-persistent-profile cohort: either exclude from launch or ship the auto-backup path first. **Confirm whether any launch users are on VDI** — this decides scope.
3. Deep-link-through-login return path verified.

**Pre-GA**
4. `navigator.storage.persist()` + storage-health banner + unexported-changes nag.
5. Application Insights web SDK (errors + export-failure events).
6. Key Google Places (referrer-restricted) or disable autocomplete internally.
7. Export after token-expiry surfaces a clear reload prompt, not a silent failure.

**Fast-follow**
8. The parked **project list + duplicate-as-revision + backup** workspace feature (also the real VDI fix).
9. Teams-embedding SSO path if that surface is wanted.

## 7. What I need from IT to finalize

- Hosting decision (App Service vs SWA vs Container Apps vs behind App Proxy).
- **Are any launch users on VDI / non-persistent desktops?** (decides blocker #2)
- Is the app opened standalone in a browser, or embedded in Teams?
- Google Places API key availability for the questionnaire, if it's deployed publicly.
