import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

// Standalone-Marketing-Layout (claimondo.de). Header/Footer + Landing-Komponenten
// kommen in Stream 2 (Shared-Code-Duplikation). Vorerst nur Fonts + Brand-Meta.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://claimondo.de'),
  title: {
    default: 'Claimondo — Vollständige Schadensregulierung auf Augenhöhe',
    template: '%s · Claimondo',
  },
  description:
    'Claimondo — unabhängige Kfz-Schadensregulierung: Gutachten, Anwalt & Mietwagen aus einer Hand. Bei unverschuldetem Unfall 0 €.',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
}

export const viewport: Viewport = {
  // Claimondo-Navy (#0D1B3E) — Browser-Theme-Color (meta-Tag, kein CSS-var möglich).
  themeColor: '#0D1B3E',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${inter.variable} ${spaceGrotesk.variable} antialiased`}>
      <body className="min-h-screen bg-claimondo-bg font-sans text-claimondo-navy">{children}</body>
    </html>
  )
}
