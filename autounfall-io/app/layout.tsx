import type { Metadata, Viewport } from 'next'
import './globals.css'
import { fraunces, inter, jetbrainsMono } from './fonts/fonts'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Plausible } from '@/components/analytics/Plausible'
import { ClarityAnalytics } from '@/components/analytics/Clarity'
import { ScrollDepth } from '@/components/analytics/ScrollDepth'
import { MonikaEmbedSlot } from '@/components/MonikaEmbedSlot'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph } from '@/lib/jsonld'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    // 62 Zeichen und damit abgeschnitten. `default` durchlaeuft das `template`
    // unten NICHT — hier steht also der fertig angezeigte Titel, Ziel <= 60.
    // Er gilt fuer die Startseite und jede Seite ohne eigenen Titel (auch 404).
    default: 'autounfall.io — Unfall-Assistance: Ratgeber & Rechner',
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
  verification: {
    google: 'M4ETfqi3R-Mwpf7r9yiiPzBMUbKC-o9awrKGBrErp1o',
    other: {
      'msvalidate.01': '0F96BC6374ACAA551D0151E1EEDF77C0',
      'ahrefs-site-verification': 'f246283242d6908182b41a4f97e61a5be3d4eed80eb3f1e0ee5bc274a4c7c6b7',
    },
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
        {/* WP-1b: RSS-Auto-Discovery. Via React-19-Hoisting (link/meta werden in
            den <head> gehoben) statt metadata.alternates.types — letzteres wird
            von Page-Level-alternates (canonical) ueberschrieben und rendert daher
            auf den Content-Seiten NICHT. Dieser <link> greift site-weit. */}
        <link rel="alternate" type="application/rss+xml" title="autounfall.io — Unfall-Ratgeber" href="/feed.xml" />
        {/* Site-weites JSON-LD (Organization #publisher = Kitta & Sprafke UG,
            #legal-reviewer = Verkehrsrechts-Partnerkanzlei (unbenannt), WebSite) — STANDALONE, kein Claimondo. */}
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
        <ClarityAnalytics />
        <ScrollDepth />
        <MonikaEmbedSlot />
      </body>
    </html>
  )
}
