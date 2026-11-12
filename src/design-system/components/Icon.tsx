'use client'

// SVG icon library — matches the design file exactly

interface IconProps {
  name: keyof typeof paths
  size?: number
  className?: string
}

const paths = {
  save:     <><path d="M5 3h11l3 3v14H5z"/><path d="M8 3v5h8V3"/><rect x="8" y="13" width="8" height="7"/></>,
  export:   <><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M6 14v5h12v-5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  sun:      <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
  moon:     <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
  search:   <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
  plus:     <><path d="M12 5v14M5 12h14"/></>,
  expand:   <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></>,
  collapse: <><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></>,
  copy:     <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  grip:     <g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>,
  trash:    <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></>,
  check:    <path d="M20 6L9 17l-5-5"/>,
  chevron:  <path d="M9 18l6-6-6-6"/>,
  chevronD: <path d="M6 9l6 6 6-6"/>,
  arrowR:   <><path d="M5 12h14M13 5l7 7-7 7"/></>,
  arrowL:   <><path d="M19 12H5M11 19l-7-7 7-7"/></>,
  info:     <><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></>,
  help:     <><path d="M7 8.2a5 5 0 1 1 7.4 4.4c-1.6.9-2.4 1.7-2.4 3.4"/><path d="M12 20h.01"/></>,
  warn:     <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></>,
  edit:     <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  x:        <><path d="M18 6L6 18M6 6l12 12"/></>,
  clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  formula:  <path d="M16 5H8l5 7-5 7h8"/>,
  mail:     <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  // Fleet Simulation point icons — approved set (owner prompt §3.2, spec v2 §5.2)
  pick:     <><path d="M12 12V3"/><path d="M8 7l4-4 4 4"/><path d="M3 16h18M5 16v5M12 16v5M19 16v5"/></>,
  drop:     <><path d="M12 3v9"/><path d="M8 8l4 4 4-4"/><path d="M3 16h18M5 16v5M12 16v5M19 16v5"/></>,
  pickDrop: <><path d="M7 3v9"/><path d="M4 9l3 3 3-3"/><path d="M17 12V3"/><path d="M14 6l3-3 3 3"/><path d="M3 16h18M5 16v5M12 16v5M19 16v5"/></>,
  stand:    <><path d="M3 9h18"/><path d="M5 9v11M19 9v11"/><path d="M5 15h14"/></>,
  conveyor: <><path d="M2 8h20M2 16h20"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></>,
  machine:  <><path d="M3 20h18"/><path d="M4 20v-9l5 3v-3l5 3v-3l5 3V5h2v15"/></>,
  racking:  <><path d="M4 3v18M20 3v18"/><path d="M4 8h16M4 13.5h16M4 19h16"/><path d="M12 8v11"/></>,
  lanes:    <><path d="M3 3v18M12 3v18M21 3v18"/><path d="M5.5 5h4v4h-4zM5.5 11h4v4h-4zM14.5 5h4v4h-4z"/></>,
  dock:     <><path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-9h10v9"/><path d="M7 15.5h10"/></>,
  charger:  <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M13 7l-3 5h4l-3 5"/></>,
  parking:  <><circle cx="12" cy="12" r="9"/><path d="M10 17V8h3.5a2.5 2.5 0 0 1 0 5H10"/></>,
} as const

export default function Icon({ name, size = 14, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  )
}
