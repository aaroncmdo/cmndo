// Claimondo Design System — Regel 16
//
// AAR-460 F2: Diese Hex-Constants NUR für Stellen nutzen wo
// CSS-Variablen nicht funktionieren (SVG inline-fill, Chart-Configs,
// dynamisches inline-Style). Für Tailwind-Components IMMER
// `bg-claimondo-navy` / `text-claimondo-ondo` / `border-claimondo-border`
// nutzen — die laufen über die CSS-Variablen in globals.css.
export const colors = {
  navy: '#0D1B3E',
  ondoBlue: '#4573A2',
  shieldBlue: '#1E3A5F',
  background: '#f8f9fb',
  card: '#ffffff',
  lightBlue: '#7BA3CC',
  border: '#e4e7ef',
} as const

/**
 * Alias-Map für Tailwind-Utility-Klassen — Single-Source-of-Truth
 * für alle Claimondo-Components. Nutzt die über `@theme inline` in
 * `globals.css` registrierten CSS-Variablen.
 */
export const claimondoTailwind = {
  bg: {
    navy: 'bg-claimondo-navy',
    ondo: 'bg-claimondo-ondo',
    shield: 'bg-claimondo-shield',
    app: 'bg-claimondo-bg',
    card: 'bg-claimondo-card',
  },
  text: {
    navy: 'text-claimondo-navy',
    ondo: 'text-claimondo-ondo',
    white: 'text-white',
    muted: 'text-claimondo-ondo',
  },
  border: {
    default: 'border-claimondo-border',
    ondo: 'border-claimondo-ondo',
  },
  shadow: {
    sm: 'shadow-[var(--shadow-claimondo-sm)]',
    md: 'shadow-[var(--shadow-claimondo-md)]',
    lg: 'shadow-[var(--shadow-claimondo-lg)]',
  },
} as const
