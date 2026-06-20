// TAL extended brand palette for ROM data-viz series (categorical). A deliberate,
// on-brand color deviation from the red-only chrome — every entry is a Toyota/TAL
// brand token already defined in app/globals.css. Shared by the KPI tiles and the
// dashboard charts so series colors stay consistent.
export const SERIES = [
  'var(--accent)',            // TAL red
  'var(--tal-classic-blue)',  // #2274A5
  'var(--tal-golden-orange)', // #E59500
  'var(--good)',              // green
  'var(--tal-dark-grey)',     // slate
]

export const seriesColor = (i: number): string => SERIES[i % SERIES.length]
