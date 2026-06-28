'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

interface Suggestion { display_name: string }

/** Address finder with type-ahead suggestions (OpenStreetMap / Nominatim — free,
 *  no API key). Debounced; degrades to a plain text field if the lookup fails or
 *  the customer just types. Self-contained — no app internals. */
export default function AddressInput({ value, onChange, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const justPicked = useRef(false)

  // Debounced lookup as the user types (skip right after a pick).
  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return }
    const q = value.trim()
    if (q.length < 4) { setSuggestions([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal, headers: { 'Accept-Language': 'en' } },
        )
        if (!res.ok) return
        const data = (await res.json()) as Suggestion[]
        setSuggestions(Array.isArray(data) ? data.slice(0, 5) : [])
        setOpen(true)
      } catch { /* network/abort — silently fall back to plain input */ }
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [value])

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (s: Suggestion) => {
    justPicked.current = true
    onChange(s.display_name)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div className="addr-finder" ref={boxRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder ?? 'Start typing an address…'}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length) setOpen(true) }}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="addr-finder-list">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => pick(s)}>{s.display_name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
