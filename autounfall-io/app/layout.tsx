import type { Metadata, Viewport } from 'next'
import './globals.css'
import { fraunces, inter, jetbrainsMono } from './fonts/fonts'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Plausible } from '@/components/analytics/Plausible'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph } from '@/lib/jsonld'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: 'autounfall.io — Unfall-Assistance: Ratgeber, Decoder & Rechner',
    template: '%s · autounfall.io',
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher.shortName }],
  creator: SITE.publisher.shortName,
  publisher: SITE.publisher.shortName,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    siteName: SITE.name,
    url: SITE.url,
    title: 'autounfall.io — Unfall-Assistance',
    description: SITE.description,
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'autounfall.io' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'autounfall.io — Unfall-Assistance',
    description: SITE.description,
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
  },
}

export const viewport: Viewport = {
  // au-ink (#1E293B) — Browser-Theme-Color. Literal noetig (meta-Tag, kein CSS-var).
  themeColor: '#1E293B',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={SITE.lang}
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Site-weites JSON-LD (Organization #publisher = Kitta & Sprafke UG,
            #legal-reviewer = LexDrive UG, WebSite) — STANDALONE, kein Claimondo. */}
        <JsonLd data={siteGraph()} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-ios-md focus:bg-au-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-au-ink focus:shadow-au-lg"
        >
          Zum Hauptinhalt springen
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
        <Plausible />
      </body>
    </html>
  )
}
