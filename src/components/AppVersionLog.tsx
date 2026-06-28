'use client'

import { useEffect } from 'react'
import Icon from '@/src/design-system/components/Icon'
import { APP_VERSIONS } from '@/src/content/appVersions'

interface Props { onClose: () => void }

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** App release history (not project-specific) — opened from the header app version. */
export default function AppVersionLog({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="avl-overlay" onClick={onClose}>
      <div className="avl-modal" role="dialog" aria-modal="true" aria-label="App version history" onClick={e => e.stopPropagation()}>
        <div className="avl-head">
          <div className="avl-head-text">
            <div className="avl-title">Version history</div>
            <div className="avl-sub">Fleet Calculator — application releases</div>
          </div>
          <button type="button" className="tbtn-icon avl-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <ol className="avl-body">
          {APP_VERSIONS.map((v, i) => (
            <li key={v.version} className={`avl-entry${i === 0 ? ' is-current' : ''}`}>
              <span className="avl-marker" aria-hidden />
              <div className="avl-entry-main">
                <div className="avl-entry-head">
                  <span className="avl-ver mono">{v.version}</span>
                  {i === 0 && <span className="avl-current-tag">Current</span>}
                  <span className="avl-date">{fmtDate(v.date)}</span>
                  <span className="avl-author">{v.author}</span>
                </div>
                <ul className="avl-summary">
                  {v.summary.map((s, j) => <li key={j}>{s}</li>)}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
