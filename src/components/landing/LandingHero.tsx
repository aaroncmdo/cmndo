import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Phone, ChevronRight, Shield, Zap, Users } from 'lucide-react'
import { LandingCta } from '@/components/shared/LandingCta'
import type { AuthenticatedUser } from './LandingTopbar'

// AAR-464 L1: Landing-Hero. Server-Component, Texte via next-intl.
// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — atmosphärischer Hintergrund
// (3 Spotlights + Grain-Overlay), Live-Trust-Badge mit Pulse-Dot,
// 3 Glass-Stat-Pills, refinierte Hierarchie ohne i18n-Bruch.

type Props = {
  authenticatedUser: AuthenticatedUser | null
}

const PHONE_DISPLAY = '0221 25906530'
const PHONE_TEL = '+4922125906530'

const STATS = [
  { icon: Users, wert: '89+', label: 'DAT-Partner-Gutachter' },
  { icon: Zap, wert: '< 48 h', label: 'Termin in unter 48 Stunden' },
  { icon: Shield, wert: '0 €', label: 'Kostenfrei nach §249 BGB' },
] as const

export async function LandingHero({ authenticatedUser }: Props) {
  const t = await getTranslations('landing.hero')

  return (
    <section
      className="relative isolate overflow-hidden"
      aria-labelledby="hero-heading"
      style={{ background: '#f8f9fb' }}
    >
      {/* Atmosphärische Hintergrund-Spotlights — 3 radiale Gradients,
          asymmetrisch verteilt, geben dem Glass-Look Tiefe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(circle at 18% 12%, rgba(123,163,204,0.28), transparent 50%)',
            'radial-gradient(circle at 88% 28%, rgba(69,115,162,0.18), transparent 45%)',
            'radial-gradient(circle at 50% 110%, rgba(13,27,62,0.10), transparent 55%)',
          ].join(', '),
        }}
      />

      {/* Subtiles Grain-Overlay — gibt Glass-Surfaces Material-Charakter */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\' opacity=\'0.5\'/></svg>")',
        }}
      />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pb-16 pt-12 text-center sm:px-6 sm:pb-24 sm:pt-20">
        {/* Live-Trust-Badge: Glass-Pill mit pulsierendem Dot */}
        <div
          className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/60 bg-white/65 px-4 py-1.5 text-xs font-semibold text-claimondo-navy shadow-[0_2px_12px_rgba(13,27,62,0.06)] backdrop-blur-md sm:text-sm"
          style={{ WebkitBackdropFilter: 'blur(12px)' }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
              style={{ background: '#22A06B' }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: '#22A06B' }}
            />
          </span>
          {t('trust_badge')}
        </div>

        <h1
          id="hero-heading"
          className="max-w-3xl text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
          style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
        >
          {t('headline')}
        </h1>

        <p className="mt-5 max-w-2xl text-balance text-base leading-relaxed text-claimondo-ondo sm:mt-6 sm:text-lg">
          {t('subheadline')}
        </p>

        {/* CTAs — primary navy + secondary ghost.
            Wir nutzen die shared LandingCta, ergänzen aber den Telefon-Direktlink
            als zusätzliche Tertiär-Option für mobile Conversion. */}
        <div className="mt-10 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          {authenticatedUser ? (
            <Link
              href={authenticatedUser.portalPath}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-navy px-7 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_rgba(13,27,62,0.25)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_12px_32px_rgba(13,27,62,0.32)] active:scale-[0.98]"
            >
              {t('cta_authenticated')}
              <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <LandingCta
                href="/schaden-melden"
                variant="primary"
                className="rounded-full px-7 py-3.5 shadow-[0_8px_24px_rgba(13,27,62,0.22)] hover:shadow-[0_12px_32px_rgba(13,27,62,0.30)] active:scale-[0.98]"
              >
                {t('cta_primary')}
                <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
              </LandingCta>
              <LandingCta
                href="/beratung-anfragen"
                variant="secondary"
                className="rounded-full border-white/60 bg-white/70 px-7 py-3.5 backdrop-blur-md hover:bg-white"
              >
                {t('cta_secondary')}
              </LandingCta>
            </>
          )}
        </div>

        <a
          href={`tel:${PHONE_TEL}`}
          aria-label={t('phone_aria')}
          className="mt-8 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-claimondo-ondo transition-colors hover:bg-claimondo-navy/5 hover:text-claimondo-navy"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          <span>{t('phone_label')}</span>
          <span className="font-semibold">{PHONE_DISPLAY}</span>
        </a>

        {/* 3 Stat-Pills als Glass-Cards. Schwebend, nicht aufgereiht — gibt
            Asymmetrie ohne den Hero-Center-Look zu zerstören. */}
        <div className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-3 sm:mt-16 sm:grid-cols-3 sm:gap-4">
          {STATS.map(({ icon: Icon, wert, label }, i) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-white/55 bg-white/55 px-4 py-3.5 text-left shadow-[0_4px_18px_rgba(13,27,62,0.06)] backdrop-blur-lg sm:flex-col sm:items-start sm:gap-1 sm:px-5 sm:py-5"
              style={{
                WebkitBackdropFilter: 'blur(16px)',
                // sanfter Tilt der mittleren Card für visuelle Asymmetrie
                transform: i === 1 ? 'translateY(-6px)' : undefined,
              }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                style={{ background: 'rgba(69,115,162,0.12)' }}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: '#4573A2' }} />
              </div>
              <div className="flex flex-1 items-baseline gap-2 sm:mt-2 sm:flex-col sm:items-start sm:gap-0">
                <span
                  className="text-xl font-bold tracking-tight text-claimondo-navy sm:text-2xl"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {wert}
                </span>
                <span className="text-xs font-medium text-claimondo-ondo sm:mt-0.5">
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
