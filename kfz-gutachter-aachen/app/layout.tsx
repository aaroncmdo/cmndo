import type { Metadata, Viewport } from 'next'
import './globals.css'
import { inter, notoSans, spaceMono, spaceGrotesk } from './fonts/fonts'
import { SITE } from '@/lib/site'
import { CLUSTER } from '@/lib/cluster'
import { CookieConsentBanner } from '@/components/CookieConsent'
import { ProSealWidget } from '@/components/ProSealWidget'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  // Default-Title (Hub). Pages setzen ihren eigenen, vollstaendigen Title
  // (kein Template-Wrapping → metadataForCity liefert den finalen String).
  title: `${SITE.name} · bei Unschuld 0 €`,
  description: `${SITE.name} — gerichtsfestes Gutachten nach BVSK-Standard. Bei Unschuld 0 €. Anwalt & Mietwagen inklusive. Jetzt anrufen!`,
  applicationName: SITE.name,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: SITE.locale, siteName: SITE.name },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  // BRIEF 08g: Favicon via Next-File-Convention app/favicon.ico (Tag identisch
  // zum Live-Pattern kfzgutachter.claimondo.de: rel=icon sizes=256x256). Kein
  // metadata.icons mehr (wuerde einen zweiten Tag erzeugen). apple-touch-icon.png
  // liegt tag-los in public/ (iOS-Konvention), Manifest traegt icon-192/512.
}

export const viewport: Viewport = {
  // Browser-Theme-Color = Cluster-Petrol. Literal noetig (Meta-Tag, kein CSS-var).
  themeColor: CLUSTER.themeColor,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={SITE.lang}
      className={`${inter.variable} ${notoSans.variable} ${spaceMono.variable} ${spaceGrotesk.variable} antialiased`}
    >
      <body>
        {children}
        <CookieConsentBanner />
        <ProSealWidget />
      </body>
    </html>
  )
}
