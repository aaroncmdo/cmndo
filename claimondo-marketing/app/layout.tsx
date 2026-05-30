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
import Script from 'next/script'
import { headers } from 'next/headers'
import { isTrackingHost, isMarketingHost } from '@/lib/analytics/consent'
import { ConsentManager } from '@/components/analytics/ConsentManager'
import { ClarityInit } from '@/components/analytics/ClarityInit'
import { PhoneClickTracker } from '@/components/analytics/PhoneClickTracker'
import './globals.css'

// Standalone-Marketing-Layout (claimondo.de). Fonts (Montserrat + Noto Sans),
// next-intl-Provider (Cookie-Locale), JSON-LD-Schema, Skip-Link.
// Stream 6: Tracking/Consent gespiegelt aus der App — GA4/gtag mit Google
// Consent Mode v2 (Default 'denied'), Ahrefs (cookielos), ConsentManager
// (vanilla-cookieconsent), ClarityInit, PhoneClickTracker — host-gated über
// lib/analytics/consent. Offline/PWA/Toaster bleiben App-only.
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

  // Stream 6 — Tracking/Consent (host-gated, claimondo.de greift). gtag nur wenn
  // GA4/Ads-ID gesetzt; ConsentManager nur auf Marketing-Hosts; Ahrefs cookielos.
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID
  const gadsId = process.env.NEXT_PUBLIC_GADS_ID
  const primaryGtagId = ga4Id ?? gadsId
  const host = (await headers()).get('host')
  const shouldLoadGtag = isTrackingHost(host) && Boolean(primaryGtagId)
  const shouldShowConsent = isMarketingHost(host)
  const shouldLoadAhrefs =
    isMarketingHost(host) || host === 'gutachter.claimondo.de' || host === 'makler.claimondo.de'

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${montserrat.variable} ${notoSans.variable} h-full antialiased`}
    >
      <head>
        {/* Perf: Preconnect zu Mapbox (gutachter-finden/-partner-Karten). */}
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="" />
        <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="" />
        {shouldLoadGtag && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${primaryGtagId}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'default', {
                  ad_storage: 'denied',
                  ad_user_data: 'denied',
                  ad_personalization: 'denied',
                  analytics_storage: 'denied',
                  functionality_storage: 'denied',
                  personalization_storage: 'denied',
                  security_storage: 'granted',
                  wait_for_update: 500
                });
                gtag('js', new Date());
                ${ga4Id ? `gtag('config', ${JSON.stringify(ga4Id)});` : ''}
                ${gadsId ? `gtag('config', ${JSON.stringify(gadsId)});` : ''}
              `}
            </Script>
          </>
        )}
        {shouldLoadAhrefs && (
          <Script
            src="https://analytics.ahrefs.com/analytics.js"
            data-key="dAlmdP9YYzm/PCnWOBTPzw"
            strategy="afterInteractive"
          />
        )}
      </head>
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
          {shouldShowConsent && <ConsentManager />}
          <ClarityInit />
          <PhoneClickTracker />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
