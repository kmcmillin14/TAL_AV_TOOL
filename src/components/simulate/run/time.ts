// Time as the run view shows it: the day's clock, the run's day and clock, and a short duration.

/** The clock for a time of day, "14:20" (any number of seconds; the day wraps). */
export const hhmm = (sec: number) => {
  const t = ((sec % 86400) + 86400) % 86400
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`
}

/** The run's clock, "Day 2 · 07:45". */
export const clock = (t: number) => `Day ${Math.floor(t / 86400) + 1} · ${hhmm(t)}`

/** "1 min 40 s", "45 s", "2 h 5 min". */
export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60), h = Math.floor(m / 60)
  return h ? `${h} h ${m % 60} min` : s % 60 && m < 10 ? `${m} min ${s % 60} s` : `${m} min`
}
