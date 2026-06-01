import type { Metadata, Viewport } from 'next'
import { Montserrat, Noto_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import {
  organizationSchema,
  websiteSchema,
  localBusinessSchema,
  jsonLdScript,
  SITE_URL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { getGoogleReviews } from '@/lib/reviews/google-places'
import Script from 'next/script'
import { headers } from 'next/headers'
import { isTrackingHost, isMarketingHost } from '@/lib/analytics/consent'
import { ConsentManager } from '@/components/analytics/ConsentManager'
import { ClarityInit } from '@/components/analytics/ClarityInit'
import { PhoneClickTracker } from '@/components/analytics/PhoneClickTracker'
import { isLocale } from '@/i18n/locales'
import '../globals.css'

// Standalone-Marketing-Layout (claimondo.de) — jetzt als Root-Layout unter dem
// [locale]-Segment (Next 16 erlaubt das Root-Layout im dynamischen Segment,
// siehe node_modules/next/dist/docs/.../internationalization.md + layout.md:146).
// Die Locale kommt aus der URL ([locale]-Param) statt aus dem Cookie -> Crawler
// bekommen pro /en /tr ... die korrekte Sprache. Fonts (Montserrat + Noto Sans),
// next-intl-Provider, JSON-LD-Schema, Skip-Link.
// Stream 6: Tracking/Consent (host-gated ueber lib/analytics/consent) — GA4/gtag
// mit Google Consent Mode v2 (Default 'denied'), Ahrefs (cookielos),
// ConsentManager, ClarityInit, PhoneClickTracker.
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

// KEIN generateStaticParams: die Routen rendern ohnehin dynamisch (ƒ) — das
// host-gated Tracking nutzt headers(). Eine Locale×Route-Prerender-Expansion
// (~1332 Seiten) braechte nichts ausser Build-OOM auf dem 2GB-VPS. Die Locale
// kommt aus dem [locale]-Param; ungueltige Werte faengt der isLocale-Guard.
export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const messages = await getMessages()
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  // E1-Followup: echtes aggregateRating fuer organizationSchema (SEO-Sterne in
  // Suchergebnissen). Cached (revalidate 24h) + Next-Fetch-Dedupe -> max. 1
  // Places-Call/Tag site-weit. null (kein Key / Fehler) -> kein Rating (UWG-safe).
  const googleReviews = await getGoogleReviews()

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
            organizationSchema(
              googleReviews
                ? { aggregateRating: { ratingValue: googleReviews.rating, reviewCount: googleReviews.count } }
                : undefined,
            ),
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
