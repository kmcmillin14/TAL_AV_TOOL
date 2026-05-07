// TAL Design System — Design Tokens
// Toyota Automated Logistics | April 2026

export const colors = {
  // Brand
  talRed: '#EB0A1E',
  talBlack: '#000000',
  talDarkGrey: '#8A8B8E',
  talWhite: '#FFFFFF',

  // Secondary
  talBrickRed: '#7D1819',
  talYellowGreen: '#A2D729',
  talClassicBlue: '#2274A5',
  talGoldenOrange: '#E59500',
  talDustGray: '#E5DADA',

  // Dark theme surface tokens
  dark: {
    bgBase: '#14141a',
    bgSurface: '#1c1c23',
    bgSurface2: '#24242c',
    bgSurface3: '#2c2c35',
    bgInput: '#18181f',
    bgHover: '#2a2a33',
    border: '#34343f',
    borderStrong: '#45454f',
    textPrimary: '#f8f8fa',
    textSecondary: '#b8b8c0',
    textTertiary: '#8a8a94',
    textDisabled: '#5a5a64',
    good: '#5eea90',
    warn: '#f5b341',
    bad: '#f56565',
    info: '#5fa8e0',
  },

  // Light theme surface tokens
  light: {
    bgBase: '#f4f4f5',
    bgSurface: '#ffffff',
    bgSurface2: '#fafafa',
    bgSurface3: '#f4f4f5',
    bgInput: '#ffffff',
    bgHover: '#f4f4f5',
    border: '#e4e4e7',
    borderStrong: '#d4d4d8',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
    textTertiary: '#71717a',
    textDisabled: '#a1a1aa',
    good: '#16a34a',
    warn: '#b45309',
    bad: '#b91c1c',
    info: '#2274A5',
  },
} as const

export const typography = {
  fontFamily: "'Toyota Type', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontNumeric: "'JetBrains Mono', 'IBM Plex Mono', 'Roboto Mono', monospace",
  sizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
} as const

export const spacing = {
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const

export const radius = {
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
} as const
