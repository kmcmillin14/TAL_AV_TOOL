'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

// If a Google Maps key is present (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY), use Google
// Places Autocomplete (New) for exact addresses; otherwise fall back to the free
// OpenStreetMap / Nominatim service. No key, no setup needed for the fallback.
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

async function fetchGoogle(input: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY as string },
    body: JSON.stringify({ input }),
  })
  if (!res.ok) throw new Error('google autocomplete failed')
  const data = await res.json() as { suggestions?: { placePrediction?: { text?: { text?: string } } }[] }
  return (data.suggestions ?? [])
    .map(s => s.placePrediction?.text?.text)
    .filter((t): t is string => !!t)
    .slice(0, 5)
}

async function fetchOsm(input: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&q=${encodeURIComponent(input)}`,
    { signal, headers: { 'Accept-Language': 'en' } },
  )
  if (!res.ok) throw new Error('osm search failed')
  const data = await res.json() as { display_name: string }[]
  return (Array.isArray(data) ? data : []).map(d => d.display_name).slice(0, 5)
}

/** Address finder with type-ahead suggestions. Uses Google Places when a key is
 *  configured (most exact), else OpenStreetMap. Debounced; degrades to a plain
 *  text field if the lookup fails or the customer just types. */
export default function AddressInput({ value, onChange, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const justPicked = useRef(false)

  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return }
    const q = value.trim()
    if (q.length < 4) { setSuggestions([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const results = GOOGLE_KEY
          ? await fetchGoogle(q, ctrl.signal).catch(() => fetchOsm(q, ctrl.signal))
          : await fetchOsm(q, ctrl.signal)
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch { /* network/abort — silently fall back to plain input */ }
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [value])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (s: string) => {
    justPicked.current = true
    onChange(s)
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
              <button type="button" onClick={() => pick(s)}>{s}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
