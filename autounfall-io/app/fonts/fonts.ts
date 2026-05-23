import localFont from 'next/font/local'

// Lokale Fonts (next/font/local) — KEIN Google-CDN (Footprint + Privacy).
// Quelle: au-fonts.css aus dem Prototyp-Bundle. Wir laden je Familie das
// latin-Subset als Variable-woff2 (deckt Deutsch inkl. Umlauten U+0000-00FF
// und Typo-Glyphen „ " – € U+2000-206F). Cyrillic/Greek/Vietnamese-Subsets
// sind fuer eine deutsche Property bewusst weggelassen.

export const fraunces = localFont({
  src: './fraunces.woff2',
  weight: '400 800', // Variable: Display 400–800 (Headlines nutzen 700/800)
  style: 'normal',
  display: 'swap',
  variable: '--font-fraunces',
  fallback: ['Georgia', 'serif'],
})

export const inter = localFont({
  src: './inter.woff2',
  weight: '400 700', // Variable: Body 400–700
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', 'sans-serif'],
})

export const jetbrainsMono = localFont({
  src: './jetbrains-mono.woff2',
  weight: '400 500',
  style: 'normal',
  display: 'swap',
  variable: '--font-jetbrains-mono',
  fallback: ['ui-monospace', 'monospace'],
})
