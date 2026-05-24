'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'

import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

// AAR-462 F4 → AAR-466 L3: 4-spaltiger Footer auf Navy.
// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — Schild-Logo + Wortmarke
// statt Text-Logo, atmosphärische Spotlights für Tiefe, sanfte Hover-States
// statt nur Color-Change. Subdomain-Hinweis "Gutachter werden" ergänzt.
//
// 13.05.2026 Fix Sentry-Issue JAVASCRIPT-NEXTJS-1: Component war zuvor
// Server-Component (`async` + `getTranslations`) und wurde von FaqClient
// (Client) als JSX-Child gerendert — Next.js wirft zur Runtime
// „`getTranslations` is not supported in Client Components". Pattern auf
// 'use client' + synchrones `useTranslations` umgestellt. Die 12 Server-
// Page-Konsumenten dürfen Client-Components weiter rendern (Server-→Client-
// Richtung ist erlaubt, nur umgekehrt geht's nicht).

export function LandingFooter() {
  const t = useTranslations('landing.footer')
  const year = new Date().getFullYear()

  return (
    <footer className="relative isolate overflow-hidden bg-claimondo-navy py-14 text-white">
      {/* Atmosphärische Spotlights — gleiche Sprache wie Hero und CTA-Sections */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.22), transparent 55%)',
            'radial-gradient(circle at 85% 80%, rgba(123,163,204,0.14), transparent 55%)',
          ].join(', '),
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Spalte 1: Brand mit Schild + Wortmarke */}
          <div>
            <div className="text-xl font-bold">
              <span>Claim</span>
              <span className="text-claimondo-light-blue">ondo</span>
            </div>
            <p className="mt-2 text-sm text-white/70">{t('tagline')}</p>
          </div>

          {/* Spalte 2: Produkt */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
              {t('product.heading')}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="/gutachter-finden" className="transition-colors hover:text-white">
                  Gutachter finden
                </Link>
              </li>
              <li>
                <Link href="/schaden-melden" className="transition-colors hover:text-white">
                  {t('product.melden')}
                </Link>
              </li>
              <li>
                <Link href="/ersteinschaetzung" className="transition-colors hover:text-white">
                  {t('product.einschaetzung')}
                </Link>
              </li>
              <li>
                <Link href="/beratung-anfragen" className="transition-colors hover:text-white">
                  {t('product.beratung')}
                </Link>
              </li>
              <li>
                <Link href="/schadensreport-2026" className="transition-colors hover:text-white">
                  Schadensreport 2026
                </Link>
              </li>
              <li>
                <Link href="/kfz-haftpflicht-schaden" className="transition-colors hover:text-white">
                  Kfz-Haftpflichtschaden
                </Link>
              </li>
              <li>
                <Link href="/ratgeber" className="transition-colors hover:text-white">
                  Ratgeber
                </Link>
              </li>
              {/* Doc 35 Fix 3: Pillar-C entwaisen — /sachverstaendige hatte null
                  eingehende interne Links. */}
              <li>
                <Link href="/sachverstaendige" className="transition-colors hover:text-white">
                  Sachverständige &amp; Verbände
                </Link>
              </li>
              {/* Doc 35: aus dem Header gewandert (Platz für „Ratgeber"), hier
                  weiter erreichbar. */}
              <li>
                <Link href="/vorteile" className="transition-colors hover:text-white">
                  Vorteile
                </Link>
              </li>
              <li>
                <Link href="/faq" className="transition-colors hover:text-white">
                  Häufige Fragen
                </Link>
              </li>
            </ul>
          </div>

          {/* Spalte 3: Partner */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
              {t('partner.heading')}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="https://gutachter.claimondo.de" className="transition-colors hover:text-white">
                  Gutachter werden
                </Link>
              </li>
              <li>
                <Link href="https://makler.claimondo.de" className="transition-colors hover:text-white">
                  {t('partner.makler')}
                </Link>
              </li>
              <li>
                <Link href="https://app.claimondo.de/login" className="transition-colors hover:text-white">
                  {t('partner.login')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Spalte 4: Legal */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
              {t('legal.heading')}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>
                <Link href="/impressum" className="transition-colors hover:text-white">
                  Impressum
                </Link>
              </li>
              <li>
                <Link href="/datenschutz" className="transition-colors hover:text-white">
                  {t('legal.datenschutz')}
                </Link>
              </li>
              <li>
                <Link href="/agb" className="transition-colors hover:text-white">
                  AGB
                </Link>
              </li>
              <li>
                <Link href="/nutzungsbedingungen" className="transition-colors hover:text-white">
                  Nutzungsbedingungen
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm text-claimondo-ondo/70">
            © {year} Claimondo GmbH. {t('rights')}
          </p>
          <div className="flex gap-4 text-sm text-white/70">
            <a href={`tel:${PHONE_E164}`} className="hover:text-white">
              {PHONE_DISPLAY}
            </a>
            <a
              href="mailto:hallo@claimondo.de"
              className="rounded-full px-2 py-1 transition-colors hover:bg-white/5 hover:text-white"
            >
              hallo@claimondo.de
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
