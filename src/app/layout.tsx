import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { Montserrat, Noto_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import SidebarModeApplier from "@/components/branding/SidebarModeApplier";
import { ClarityInit } from "@/components/analytics/ClarityInit";
import { PhoneClickTracker } from "@/components/analytics/PhoneClickTracker";
import { isTrackingHost, isMarketingHost } from "@/lib/analytics/consent";
import { ConsentManager } from "@/components/analytics/ConsentManager";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import OfflineBanner from "@/components/offline/OfflineBanner";
import ServiceWorkerBoot from "@/components/offline/ServiceWorkerBoot";
import PersistStorageToast from "@/components/offline/PersistStorageToast";
import {
  organizationSchema, websiteSchema, localBusinessSchema,
  jsonLdScript, SITE_URL,
} from "@/lib/seo/jsonld";
// potentialActionSchema wird HIER gemergt (nicht in jsonld.ts) — conversion-handoff
// importiert aus jsonld, ein Re-Import waere zirkulaer (Doc 31 §Stream-C-Gotcha).
import { potentialActionSchema } from "@/lib/seo/conversion-handoff";
import { buildLanguageAlternates } from "@/lib/seo/alternates";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
  variable: "--font-montserrat",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-noto-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Claimondo — Ihr Kfz-Schaden, digital geregelt",
    template: "%s | Claimondo",
  },
  description:
    "Claimondo regelt Kfz-Unfallschäden komplett: unabhängiges Gutachten, Anwalt, Werkstatt und Auszahlung. 0 € für unverschuldet Geschädigte (§249 BGB). Bundesweit.",
  applicationName: "Claimondo",
  keywords: [
    "Kfz-Gutachter",
    "Unfallgutachten",
    "Schadensregulierung",
    "Kfz-Schaden",
    "unverschuldeter Unfall",
    "Sachverständiger",
    "Verkehrsunfall Anwalt",
    "Wertminderung",
    "§249 BGB",
    "Haftpflicht Schadenersatz",
    "Gutachter finden",
    "Kfz-Sachverständiger Köln",
    "Gutachter Düsseldorf",
    "Unfall NRW",
  ],
  authors: [{ name: "Claimondo" }],
  creator: "Claimondo",
  publisher: "Claimondo",
  formatDetection: {
    email: false,
    address: false,
    telephone: true,
  },
  alternates: {
    canonical: SITE_URL,
    ...buildLanguageAlternates('/'),
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "Claimondo",
    url: SITE_URL,
    title: "Claimondo — Ihr Kfz-Schaden, digital geregelt",
    description:
      "Unabhängige Schadensregulierung nach Kfz-Unfällen. Gutachten, Anwalt, Werkstatt und Auszahlung — kostenlos für unverschuldet Geschädigte.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "Claimondo — Ihr Kfz-Schaden, digital geregelt",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Claimondo — Ihr Kfz-Schaden, digital geregelt",
    description:
      "Unabhängige Schadensregulierung nach Kfz-Unfällen. 0 € für unverschuldet Geschädigte.",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Claimondo",
  },
  other: {
    // GEO-Tags für lokale Suche
    "geo.region": "DE-NW",
    "geo.placename": "Köln",
    "geo.position": "50.9413;6.9583",
    ICBM: "50.9413, 6.9583",
  },
};

// Next.js 15+: themeColor gehört in den separaten viewport-Export.
// 2026-05-08: aus metadata raus migriert (Deprecation-Warning Sweep).
export const viewport = {
  themeColor: "#0D1B3E",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // AAR-459 F1: Locale + Messages aus next-intl/server holen.
  // Locale stammt aus src/i18n/request.ts, das das Cookie `claimondo-locale`
  // liest und auf 'de' fällt-backt. `dir` wird für Arabisch auf 'rtl'
  // gesetzt — weitere Sprachen bleiben 'ltr'.
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  // GA4 + Google-Ads-Tracking. Consent fuehrt ConsentManager (vanilla-cookieconsent,
  // Google Consent Mode v2) — ConsentManager setzt die consent-update-Signale. Wir
  // behalten einen denied-Fallback-Default als Sicherheitsnetz.
  // Host-gated: gtag nur auf der Marketing-Hauptdomain; ConsentManager auf allen
  // Public-Marketing-Hosts inkl. LP, NICHT auf Portalen.
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
  const gadsId = process.env.NEXT_PUBLIC_GADS_ID;
  const primaryGtagId = ga4Id ?? gadsId;

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const shouldLoadGtag = isTrackingHost(host) && Boolean(primaryGtagId);
  const shouldShowConsent = isMarketingHost(host);
  // Ahrefs Web Analytics: cookielos + DSGVO-konform ohne Einwilligung (setzt kein
  // Cookie / kein localStorage) -> always-on auf Marketing-Hosts, NICHT consent-gated
  // (sonst wuerde nur Post-Consent-Traffic gemessen). Key = Ahrefs-Projekt 9843372.
  const shouldLoadAhrefs = isMarketingHost(host);

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${montserrat.variable} ${notoSans.variable} h-full antialiased`}
    >
      <head>
        {/* Performance: Preconnect zu externen Origins die bereits im LCP-
            Fenster geladen werden. Spart 100-300ms TTFB beim ersten Asset-
            Request. dns-prefetch als Fallback fuer aeltere Browser. */}
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="" />
        <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.imagin.studio" crossOrigin="" />
        <link rel="dns-prefetch" href="https://api.mapbox.com" />
        <link rel="dns-prefetch" href="https://cdn.imagin.studio" />
        {/* RSS-/JSON-Feed-Discovery (GEO: Feed-Reader, News-Aggregatoren, LLM-Update-Signal).
            Roh als <link> statt via metadata.alternates.types, damit sie auf JEDER Seite
            erscheinen — ein per-Page alternates-Objekt wuerde das geerbte sonst ersetzen. */}
        <link rel="alternate" type="application/rss+xml" title="Claimondo — Aktuelle Wissens-Updates" href="/feed.xml" />
        <link rel="alternate" type="application/feed+json" title="Claimondo — Aktuelle Wissens-Updates (JSON Feed)" href="/feed.json" />
        <link rel="alternate" type="application/rss+xml" title="Claimondo — Wissens-Katalog" href="/feed/katalog.xml" />
        <link rel="alternate" type="application/feed+json" title="Claimondo — Wissens-Katalog (JSON Feed)" href="/feed/katalog.json" />
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
            // Org-Schema + PotentialAction (SearchAction Karte primaer, Doc 30 §13.4)
            { ...organizationSchema(), ...potentialActionSchema() },
            localBusinessSchema(),
            websiteSchema(),
          ])}
        />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-ios-lg focus:shadow-lg focus:text-sm focus:font-medium focus:text-claimondo-shield focus:ring-2 focus:ring-claimondo-ondo">
          Zum Hauptinhalt springen
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {shouldShowConsent && <ConsentManager />}
          <ClarityInit />
          <PhoneClickTracker />
          <SidebarModeApplier />
          {children}
          <Toaster position="top-right" richColors closeButton />
          <PwaInstallBanner />
          <OfflineBanner />
          <ServiceWorkerBoot />
          <PersistStorageToast />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
