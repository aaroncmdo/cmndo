import type { Metadata, Viewport } from 'next'
import { Montserrat, Noto_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import {
  organizationSchema,
  websiteSchema,
  localBusinessSchema,
  jsonLdScript,
  SITE_URL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import './globals.css'

// Standalone-Marketing-Layout (claimondo.de). Stream 2: Fonts (Montserrat + Noto Sans,
// passend zu globals.css-Tokens), next-intl-Provider (Cookie-Locale), JSON-LD-Schema,
// Skip-Link. Analytics/Consent/Offline (App-spezifisch) bewusst NICHT hier — kommen in
// Stream 6 (Tracking) bzw. bleiben App-only.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-montserrat',
})

const notoSans = Noto_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-noto-sans',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Claimondo — Ihr Kfz-Schaden, digital geregelt',
    template: '%s | Claimondo',
  },
  description:
    'Claimondo regelt Kfz-Unfallschäden komplett: unabhängiges Gutachten, Anwalt, Werkstatt und Auszahlung. 0 € für unverschuldet Geschädigte (§249 BGB). Bundesweit.',
  applicationName: 'Claimondo',
  authors: [{ name: 'Claimondo' }],
  creator: 'Claimondo',
  publisher: 'Claimondo',
  alternates: {
    canonical: SITE_URL,
    ...buildLanguageAlternates('/'),
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: SITE_URL,
    title: 'Claimondo — Ihr Kfz-Schaden, digital geregelt',
    description:
      'Unabhängige Schadensregulierung nach Kfz-Unfällen. Gutachten, Anwalt, Werkstatt und Auszahlung — kostenlos für unverschuldet Geschädigte.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Claimondo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Claimondo — Ihr Kfz-Schaden, digital geregelt',
    description: 'Unabhängige Schadensregulierung nach Kfz-Unfällen. 0 € für unverschuldet Geschädigte.',
    images: ['/og-default.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
}

export const viewport: Viewport = {
  themeColor: '#0D1B3E',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale()
  const messages = await getMessages()
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${montserrat.variable} ${notoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col glass-bg">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript([
            organizationSchema(),
            localBusinessSchema(),
            websiteSchema(),
          ])}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sm focus:font-medium focus:text-claimondo-shield focus:ring-2 focus:ring-claimondo-ondo"
        >
          Zum Hauptinhalt springen
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
