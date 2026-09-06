import type { Metadata, Viewport } from 'next'
import { Montserrat, Noto_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { pickClientMessages } from '@/i18n/client-namespaces'
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
import { OaiqInit } from '@/components/analytics/OaiqInit'
import { PhoneClickTracker } from '@/components/analytics/PhoneClickTracker'
import { ProSealWidget } from '@/components/shared/ProSealWidget'
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
// ⚠ `cyrillic` MUSS mit in die Subsets. `next/font` laedt AUSSCHLIESSLICH die hier
// deklarierten Subsets — beide Familien tragen Kyrillisch, ohne die Angabe kommt es aber
// nie beim Browser an. Auf prod gemessen (06.09., document.fonts.check gegen die
// deklarierte Familie): latein JA · arabisch JA · tuerkisch JA · **kyrillisch NEIN**.
// Russischer Text war dadurch lesbar, aber in der System-Schrift (Segoe UI, SF Pro,
// Roboto tragen alle Kyrillisch) — kein Funktionsfehler, ein Markenfehler.
//
// Bei drei russischen Seiten sah das niemand. Mit den 92 uebersetzten Fachtexten
// (Content-i18n, 06.09.) ist es sichtbare Flaeche.
//
// KOSTET NICHTS auf den uebrigen Seiten: Google Fonts liefert je Subset eine eigene
// Datei mit `unicode-range`; der Browser holt das kyrillische Paket nur, wenn auf der
// Seite auch kyrillische Zeichen stehen. Deutsche und englische Seiten laden unveraendert.
const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-montserrat',
})

const notoSans = Noto_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-noto-sans',
})

/** GEO-Feeds fuer die Autodiscovery im <head>. */
const FEEDS = [
  { type: 'application/rss+xml', url: '/feed.xml', title: 'Claimondo – Aktuelle Wissens-Updates' },
  { type: 'application/rss+xml', url: '/feed/katalog.xml', title: 'Claimondo – Wissens-Katalog' },
  {
    type: 'application/feed+json',
    url: '/feed.json',
    title: 'Claimondo – Aktuelle Wissens-Updates (JSON Feed)',
  },
  {
    type: 'application/feed+json',
    url: '/feed/katalog.json',
    title: 'Claimondo – Wissens-Katalog (JSON Feed)',
  },
]

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Claimondo – Ihr Kfz-Schaden, digital geregelt',
    template: '%s | Claimondo',
  },
  description:
    'Claimondo regelt Kfz-Unfallschäden komplett: unabhängiges Gutachten, Anwalt, Werkstatt und Auszahlung. 0 € für unverschuldet Geschädigte (§249 BGB). Bundesweit.',
  applicationName: 'Claimondo',
  authors: [{ name: 'Claimondo' }],
  creator: 'Claimondo',
  publisher: 'Claimondo',
  alternates: {
    // KEIN `canonical` hier. Next.js vererbt Layout-`alternates` an jede Seite,
    // die selbst keines setzt — ein absolutes SITE_URL-Canonical machte daraus
    // eine erklaerte Kopie der Startseite. Real getroffen hat das /impressum,
    // /datenschutz, /agb und /nutzungsbedingungen: alle vier standen in der
    // Sitemap und nahmen sich per Canonical selbst aus dem Index. Jede Seite
    // setzt ihr Canonical jetzt selbst (die uebrigen 338 taten das ohnehin).
    ...buildLanguageAlternates('/'),
    // Feed-Autodiscovery steht NICHT hier, sondern als <link> im <head> unten.
    // Grund: `alternates` wird nur FLACH gemerged (Next-Doku "Merging") — ein
    // eigenes `alternates` einer Page ersetzt den ganzen Block samt `types`.
    // Ueber Metadata erreichten die Feeds daher nur die 10 Seiten ohne eigenes
    // `alternates` (Impressum/AGB/noindex), nicht die Startseite und keine
    // Content-Seite. Im JSX erbt sie jede Seite.
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: SITE_URL,
    title: 'Claimondo – Ihr Kfz-Schaden, digital geregelt',
    description:
      'Unabhängige Schadensregulierung nach Kfz-Unfällen. Gutachten, Anwalt, Werkstatt und Auszahlung – kostenlos für unverschuldet Geschädigte.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Claimondo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Claimondo – Ihr Kfz-Schaden, digital geregelt',
    description: 'Unabhängige Schadensregulierung nach Kfz-Unfällen. 0 € für unverschuldet Geschädigte.',
    images: ['/opengraph-image'],
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
  // Consent-Default 'granted' — Anwalts-Freigabe + GF-Entscheid (26.06.2026, von
  // Aaron bestaetigt). Consent Mode v2 Advanced (Modeling, url_passthrough) bleibt
  // aktiv; das CMP (ConsentManager) dient als Opt-out. Rollback-Valve:
  // NEXT_PUBLIC_CONSENT_DEFAULT=denied erzwingt denied ohne Redeploy.
  // docs/conversion-tracking-attribution-runbook.md (A2/B6).
  const consentDefault =
    process.env.NEXT_PUBLIC_CONSENT_DEFAULT === 'denied' ? 'denied' : 'granted'
  const host = (await headers()).get('host')
  const shouldLoadGtag = isTrackingHost(host) && Boolean(primaryGtagId)
  const shouldShowConsent = isMarketingHost(host)
  // gutachter/makler standen hier frueher einzeln, weil MARKETING_HOSTS sie nicht kannte.
  // Seit 13.08.2026 sind sie Teil der Menge (Siegel braucht ueberall ein Opt-out) — die
  // Sonderfaelle waeren also nur noch Rauschen. schaden.claimondo.de bekommt Ahrefs damit
  // neu; das ist gewollt: cookielos, und die Marketing-Hosts sollen vergleichbar messen.
  const shouldLoadAhrefs = isMarketingHost(host)

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
        {/* Feed-Autodiscovery (geo-feeds-spec §9): macht die GEO-Feeds fuer
            Browser, RSS-Reader (Feedly) + Crawler auffindbar. Bewusst hier statt
            in `metadata.alternates.types` — siehe Kommentar am metadata-Export. */}
        {FEEDS.map((feed) => (
          <link
            key={feed.url}
            rel="alternate"
            type={feed.type}
            href={`${SITE_URL}${feed.url}`}
            title={feed.title}
          />
        ))}
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
                  ad_storage: '${consentDefault}',
                  ad_user_data: '${consentDefault}',
                  ad_personalization: '${consentDefault}',
                  analytics_storage: '${consentDefault}',
                  functionality_storage: '${consentDefault}',
                  personalization_storage: '${consentDefault}',
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
        {/* Nur die client-seitig genutzten Namespaces serialisieren (12 statt 51).
            Alles hier landet im RSC-Flight-Payload und damit im HTML JEDER Seite —
            vorher 280 KB, also 46 % des ausgelieferten HTML, fuer Uebersetzungen,
            die zu drei Vierteln nur Server-Komponenten brauchen. Server-Rendering
            ist unberuehrt: getTranslations() liest die vollen Messages weiter.
            Begruendung + Pflege-Pflicht: i18n/client-namespaces.ts. */}
        <NextIntlClientProvider locale={locale} messages={pickClientMessages(messages)}>
          {shouldShowConsent && <ConsentManager />}
          <ClarityInit />
          {/* OAIQ-Pixel (OpenAI Ads): sammelt das `oppref` aus dem Anzeigenklick ein.
              Bewusst im Root-Layout statt seitenweise — welche Landingpage eine Anzeige
              morgen anspricht, weiss heute niemand, und eine seitenweise Einbindung
              braeche in dem Moment still. Gate ist die CMP-Kategorie `ads` (nicht
              `analytics` wie bei Clarity); ohne NEXT_PUBLIC_OAIQ_PIXEL_ID bleibt die
              Komponente still. Conversions gehen NICHT von hier raus, sondern
              serverseitig — siehe lib/analytics/oaiq-capi.ts. */}
          <OaiqInit />
          {/* ProSeal laedt s.provenexpert.net im Besucher-Browser -> nur dort, wo auch
              ein CMP laeuft. Ohne CMP haette der Besucher keinen Weg zu widersprechen.
              Seit 13.08.2026 laeuft das CMP auf allen sechs Marketing-Hosts, das Siegel
              also auch. Das Consent-Gate selbst sitzt in der Komponente, die vertikale
              Position in globals.css (.pe-pro-seal). */}
          {shouldShowConsent && <ProSealWidget />}
          <PhoneClickTracker />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
