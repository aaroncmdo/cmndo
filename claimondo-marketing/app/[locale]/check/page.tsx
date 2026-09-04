import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { TrustBlock } from '@/components/landing/TrustBlock'
import { CheckFunnelClient } from './CheckFunnelClient'
import { MaklerEmpfehlungHinweis } from '@/components/check/MaklerEmpfehlungHinweis'
import {
  serviceSchema,
  breadcrumbsSchema,
  jsonLdScript,
  SITE_URL,
  PHONE_DISPLAY,
  PHONE_E164,
} from '@/lib/seo/jsonld'
import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'
import { ClarityInitLP } from '@/components/analytics/ClarityInitLP'
import { CLARITY_ID_ANZEIGEN_ZIELE } from '@/components/analytics/clarity-ids'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  return {
    title: t('check.title'),
    description: t('check.description'),
    alternates: await localeAlternates('/check'),
    openGraph: {
      type: 'website',
      siteName: 'Claimondo',
      ...(await localeOpenGraph(`/check`)),
      title: t('check.title'),
      description: t('check.og_description'),
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Kostenlose Anspruchs-Prüfung – Claimondo' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('check.twitter_title'),
      description: t('check.twitter_description'),
      images: ['/opengraph-image'],
    },
  }
}

export default async function CheckPage() {
  const t = await getTranslations('check')
  const tb = await getTranslations('beratung_anfragen')
  const trustStats = tb.raw('trust_stats') as Array<{ wert: string; label: string }>

  return (
    <div className="min-h-screen bg-claimondo-bg">
      {/* Eigenes Clarity-Projekt fuer die Anzeigen-Ziele. ClarityInit ueberspringt
          diese Route via SKIP_ROUTES — sonst liefen zwei Projekte gleichzeitig. */}
      <ClarityInitLP projectId={CLARITY_ID_ANZEIGEN_ZIELE} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kostenlose Anspruchs-Prüfung nach Kfz-Unfall',
            description:
              'Unverbindliche Online-Ersteinschätzung: In drei Fragen ermittelt Claimondo, welche Ansprüche unverschuldet Geschädigte nach einem Kfz-Unfall haben (Schadensgutachten, Wertminderung, Nutzungsausfall, Anwaltskosten). Kostenlos, ohne Kostenrisiko.',
            url: `${SITE_URL}/check`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Anspruchs-Prüfung', url: '/check' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden py-14 text-center sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 20% 15%, rgba(123,163,204,0.22), transparent 50%)',
              'radial-gradient(circle at 85% 35%, rgba(69,115,162,0.14), transparent 45%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          {/* Makler-Empfehlung: wer ueber /m/<code> kam (URL ?m), sieht „Empfohlen von <Firma>"
              auch hier — schliesst die letzte neutrale Funnel-Stufe (LP->Check->Tool->Finder). */}
          <div><MaklerEmpfehlungHinweis /></div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {t('badge')}
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('h1')}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-claimondo-ondo sm:text-lg">
            {t('sub')}
          </p>
        </div>
      </section>

      {/* Interaktiver Check */}
      <section className="pb-14">
        <div className="mx-auto max-w-xl px-4 sm:px-6">
          <CheckFunnelClient />
        </div>
      </section>

      {/* Alternativ: direkt anrufen / melden */}
      <section className="pb-14">
        <div className="mx-auto max-w-xl px-4 sm:px-6">
          <div className="rounded-ios-lg border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6 text-center">
            <p className="text-sm text-claimondo-shield">{t('alternativ_text')}</p>
            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
              >
                <Phone className="h-4 w-4" aria-hidden />
                {PHONE_DISPLAY}
              </a>
              <Link
                href="/schaden-melden"
                className="inline-flex items-center gap-2 rounded-full border border-claimondo-border bg-white px-6 py-3 text-sm font-semibold text-claimondo-navy transition-all hover:border-claimondo-ondo"
              >
                {t('alternativ_cta')}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <TrustBlock heading={t('trust_heading')} stats={trustStats} />

      <LandingFooter />
      <StickyCallBar quelle="Anspruchs-Prüfung (/check)" />
    </div>
  )
}
