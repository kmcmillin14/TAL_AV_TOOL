// App release history — shown when the app version in the header is clicked.
// This is the APPLICATION's version log (not a project revision). Curated content;
// add a new entry at the TOP each release. The displayed header version is the
// first entry's `version`.

export interface AppVersion {
  version: string
  date: string          // ISO yyyy-mm-dd
  author: string
  summary: string[]     // bullet points
}

export const APP_VERSIONS: AppVersion[] = [
  {
    version: 'v1.0',
    date: '2026-06-23',
    author: 'Kyle McMillin',
    summary: ['Initial release.'],
  },
]

/** The current app version (header label). */
export const APP_VERSION = APP_VERSIONS[0]?.version ?? 'v1.0'
