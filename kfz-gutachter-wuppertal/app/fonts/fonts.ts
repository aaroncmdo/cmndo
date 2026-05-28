import { Inter, Space_Grotesk, Space_Mono } from 'next/font/google'

// next/font/google self-hostet die Fonts beim Build (lokale /_next/static/media/
// -woff2, KEINE Runtime-Anfrage an fonts.googleapis.com). Subset latin deckt
// Deutsch inkl. Umlauten. Variablen werden in app/globals.css @theme gebunden.

export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
})
