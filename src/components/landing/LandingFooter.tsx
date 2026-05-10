import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

// AAR-462 F4 → AAR-466 L3: 4-spaltiger Footer auf Navy.
// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — Schild-Logo + Wortmarke
// statt Text-Logo, atmosphärische Spotlights für Tiefe, sanfte Hover-States
// statt nur Color-Change. Subdomain-Hinweis "Gutachter werden" ergänzt.

export async function LandingFooter() {
  const t = await getTranslations('landing.footer')
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
            <Link href="/" aria-label="Claimondo Startseite" className="group inline-flex items-center gap-2.5">
              <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-[10px] shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-transform duration-200 group-hover:scale-[1.04]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/claimondo-shield.svg" alt="" width={36} height={36} className="h-9 w-9" />
              </span>
              <span
                className="text-xl font-bold tracking-tight"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              >
                claim<span className="text-claimondo-light-blue">ondo</span>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-white/70">{t('tagline')}</p>
          </div>

          {/* Spalte 2: Produkt */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
              {t('product.heading')}
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/75">
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
            </ul>
          </div>

          {/* Spalte 3: Partner */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-claimondo-light-blue">
              {t('partner.heading')}
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-white/75">
              <li>
                <Link href="/gutachter-partner" className="transition-colors hover:text-white">
                  Gutachter werden
                </Link>
              </li>
              <li>
                <Link href="/makler/partner-werden" className="transition-colors hover:text-white">
                  {t('partner.makler')}
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-white">
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
            <ul className="mt-4 space-y-2.5 text-sm text-white/75">
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

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-xs text-claimondo-ondo/70 sm:text-sm">
            © {year} Claimondo GmbH · Hansaring 10, 50670 Köln · {t('rights')}
          </p>
          <div className="flex gap-5 text-sm text-white/75">
            <a
              href="tel:+4922125906530"
              className="rounded-full px-2 py-1 transition-colors hover:bg-white/5 hover:text-white"
            >
              0221 25906530
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
