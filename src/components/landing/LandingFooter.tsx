import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

// AAR-462 F4 → AAR-466 L3: Vollwertiger 4-spaltiger Landing-Footer mit
// Claim/Produkt/Partner/Legal-Spalten + unterer Kontakt-Leiste. Löst
// den F4-Skeleton ab. Partner-Spalte enthält Makler-CTA als
// Conversion-Einstieg.

export async function LandingFooter() {
  const t = await getTranslations('landing.footer')
  const year = new Date().getFullYear()

  return (
    <footer className="bg-claimondo-navy py-12 text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Spalte 1: Brand */}
          <div>
            <div className="text-xl font-bold">
              <span>Claim</span>
              <span className="text-claimondo-light-blue">ondo</span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{t('tagline')}</p>
          </div>

          {/* Spalte 2: Produkt */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider">
              {t('product.heading')}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>
                <Link href="/schaden-melden" className="hover:text-white">
                  {t('product.melden')}
                </Link>
              </li>
              <li>
                <Link href="/ersteinschaetzung" className="hover:text-white">
                  {t('product.einschaetzung')}
                </Link>
              </li>
              <li>
                <Link href="/beratung-anfragen" className="hover:text-white">
                  {t('product.beratung')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Spalte 3: Partner */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider">
              {t('partner.heading')}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>
                <Link href="/makler/partner-werden" className="hover:text-white">
                  {t('partner.makler')}
                </Link>
              </li>
              <li>
                <Link href="/gutachter/partner-werden" className="hover:text-white">
                  {t('partner.gutachter')}
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white">
                  {t('partner.login')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Spalte 4: Legal */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider">
              {t('legal.heading')}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>
                <Link href="/impressum" className="hover:text-white">
                  Impressum
                </Link>
              </li>
              <li>
                <Link href="/datenschutz" className="hover:text-white">
                  {t('legal.datenschutz')}
                </Link>
              </li>
              <li>
                <Link href="/nutzungsbedingungen" className="hover:text-white">
                  AGB
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm text-slate-400">
            © {year} Claimondo GmbH. {t('rights')}
          </p>
          <div className="flex gap-4 text-sm text-slate-300">
            <a href="tel:+4922112345678" className="hover:text-white">
              0221 123 456 78
            </a>
            <a href="mailto:hallo@claimondo.de" className="hover:text-white">
              hallo@claimondo.de
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
