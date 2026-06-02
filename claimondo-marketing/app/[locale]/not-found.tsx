import Link from 'next/link'
import { Phone, ChevronRight, ShieldCheck, Search } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

// Marketing-404 als Lead-Rettung statt Sackgasse: Eine nicht (mehr) existente
// Seite wird zur Anspruchs-Prüfung umgelenkt — "Seite weg, aber Ihr Anspruch
// zählt". Voraussetzung, dass diese 404 ueberhaupt erscheint: nginx faengt den
// :3006-404 NICHT mehr global ab (error_page 404 = @monolith nur fuer eine
// Whitelist echter Legacy-Pfade) — sonst landete der Nutzer am App-Login.

const POPULAR = [
  { href: '/', key: 'link_home' },
  { href: '/kfz-gutachter', key: 'link_kfz_gutachter' },
  { href: '/gutachter-finden', key: 'link_finder' },
  { href: '/ratgeber', key: 'link_ratgeber' },
  { href: '/faq', key: 'link_faq' },
] as const

export default async function NotFound() {
  const t = await getTranslations('not_found')

  return (
    <div className="flex min-h-screen flex-col bg-claimondo-bg">
      <LandingTopbar authenticatedUser={null} />
      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:py-24">
        <div className="mx-auto w-full max-w-xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-claimondo-ondo">404</p>
          <h1
            className="mt-3 text-balance text-3xl font-bold leading-tight text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('heading')}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-balance text-base leading-relaxed text-claimondo-shield">
            {t('text')}
          </p>

          {/* Primärer Rettungs-CTA: Anspruchs-Prüfung */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/check"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-7 py-3.5 text-base font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield active:scale-[0.98]"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden />
              {t('cta_check')}
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-claimondo-border bg-white px-7 py-3.5 text-base font-semibold text-claimondo-navy transition-all hover:border-claimondo-ondo"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {PHONE_DISPLAY}
            </a>
          </div>
          <Link
            href="/schaden-melden"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-claimondo-ondo underline-offset-2 hover:underline"
          >
            {t('cta_melden')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>

          {/* Beliebte Seiten */}
          <div className="mt-12 border-t border-claimondo-border pt-8">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-claimondo-shield/70">
              <Search className="h-3.5 w-3.5" aria-hidden />
              {t('popular_heading')}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {POPULAR.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo transition hover:border-claimondo-ondo hover:text-claimondo-navy"
                >
                  {t(l.key)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  )
}
