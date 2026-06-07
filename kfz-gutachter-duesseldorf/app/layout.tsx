import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { inter, notoSans, spaceMono } from './fonts/fonts'
import { SITE } from '@/lib/site'
import { CLUSTER } from '@/lib/cluster'
import { CookieConsentBanner } from '@/components/CookieConsent'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  // Default-Title (Hub). Pages setzen ihren eigenen, vollstaendigen Title
  // (kein Template-Wrapping → metadataForCity liefert den finalen String).
  title: `${SITE.name} · bei Unschuld 0 € · DAT`,
  description: `${SITE.name} — gerichtsfestes Gutachten, DAT-zertifiziert. Bei Unschuld 0 €. Anwalt & Mietwagen inklusive. Jetzt anrufen!`,
  applicationName: SITE.name,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: SITE.locale, siteName: SITE.name },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  // Cluster-Favicons (PNG-Set in /assets/img/wuppertal/favicon/) kommen mit den
  // Assets dazu; bis dahin SVG-Fallback (public/favicon.svg) — keine 404.
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
}

export const viewport: Viewport = {
  // Browser-Theme-Color = Cluster-Petrol. Literal noetig (Meta-Tag, kein CSS-var).
  themeColor: CLUSTER.themeColor,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={SITE.lang}
      className={`${inter.variable} ${notoSans.variable} ${spaceMono.variable} antialiased`}
    >
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KZNCZB2Z"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* Google Tag Manager */}
        <Script id="gtm-base" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-KZNCZB2Z');`}
        </Script>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  )
}
