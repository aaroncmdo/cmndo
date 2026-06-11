import { Inter, Noto_Sans, Space_Mono, Space_Grotesk } from 'next/font/google'

// next/font/google self-hostet die Fonts beim Build (lokale /_next/static/media/
// -woff2, KEINE Runtime-Anfrage an fonts.googleapis.com). Subset latin deckt
// Deutsch inkl. Umlauten. Variablen werden in app/globals.css @theme gebunden.

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

// Headline-/Display-Font (AAR-965): Noto Sans ersetzt Space Grotesk.
export const notoSans = Noto_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans',
  display: 'swap',
})

export const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
})

// Display-Font fuer H1 + 0-EUR-Stat (Aaron 05.06.): Space Grotesk geraeteuebergreifend.
// Restliche Headlines bleiben Noto Sans (AAR-965) -> nur ueber font-grotesk-Token gezielt.
export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})
