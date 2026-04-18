import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Phone } from 'lucide-react'
import { LandingCta } from '@/components/shared/LandingCta'
import type { AuthenticatedUser } from './LandingTopbar'

// AAR-464 L1: Landing-Hero. Server-Component, Texte via next-intl
// (getTranslations — `useTranslations` ist nur für Client-Components).
// Für eingeloggte User bleibt der Portal-CTA erhalten (kein Regressions-
// Bruch gegenüber dem F4-Skeleton), anonyme User bekommen die neuen 3
// CTAs (Schaden melden / Beraten lassen / Telefon).

type Props = {
  authenticatedUser: AuthenticatedUser | null
}

// +49 221 123 456 78 — zentrale Claimondo-Hotline (gleiche Nummer wie im
// Ticket-Spec; Quelle ist Platzhalter bis Service-Rufnummer gesetzt wird).
const PHONE_DISPLAY = '0221 123 456 78'
const PHONE_TEL = '+4922112345678'

export async function LandingHero({ authenticatedUser }: Props) {
  const t = await getTranslations('landing.hero')

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-claimondo-card to-claimondo-bg"
      aria-labelledby="hero-heading"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-claimondo-border bg-claimondo-card px-4 py-1.5 text-sm font-semibold text-claimondo-ondo">
          <span aria-hidden="true">✓</span>
          <span>{t('trust_badge')}</span>
        </div>

        <h1
          id="hero-heading"
          className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-claimondo-navy sm:text-5xl md:text-6xl"
        >
          {t('headline')}
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          {t('subheadline')}
        </p>

        <div className="mt-10 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          {authenticatedUser ? (
            <Link
              href={authenticatedUser.portalPath}
              className="inline-flex items-center justify-center rounded-xl bg-claimondo-navy px-6 py-3 text-base font-semibold text-white shadow-[var(--shadow-claimondo-md)] transition-colors hover:bg-claimondo-ondo"
            >
              {t('cta_authenticated')} →
            </Link>
          ) : (
            <>
              <LandingCta href="/schaden-melden" variant="primary">
                {t('cta_primary')} →
              </LandingCta>
              <LandingCta href="/beratung-anfragen" variant="secondary">
                {t('cta_secondary')}
              </LandingCta>
            </>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-slate-600">
          <Phone className="h-4 w-4" aria-hidden="true" />
          <span>{t('phone_label')}</span>
          <a
            href={`tel:${PHONE_TEL}`}
            className="rounded font-semibold text-claimondo-ondo hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo focus-visible:ring-offset-2"
            aria-label={t('phone_aria')}
          >
            {PHONE_DISPLAY}
          </a>
        </div>
      </div>
    </section>
  )
}
