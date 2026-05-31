import Link from 'next/link'
import Image from 'next/image'
import { Phone, MessageCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  serviceSchema, faqPageSchema, jsonLdScript,
  SITE_URL, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { SERVICE_REALITY_BULLETS } from '@/lib/brand/service-pitch'
import { HomeLeadFormClient } from '../HomeLeadFormClient'

// Phase B1 (21->12 Section-Komponenten): HeroSection bündelt die vormals
// nummerierten Inline-Sektionen #1 (Hero-Foto-Band) und #2 (Hero + Lead-Form)
// aus HauptseitePremium.tsx. Content/Tokens/t()-Keys 1:1 übernommen — der
// visuelle Merge beider Bänder ist ein späterer Task.
//
// Das HowTo/Service/FAQ-JSON-LD-Schema (vormals am Kopf von HauptseitePremium
// gerendert) bleibt als erster DOM-Knoten der Page erhalten und wandert
// deshalb hierher (erste Section). prozessSteps + faqItems werden ausschließlich
// fürs Schema gelesen; die sichtbaren Prozess-/FAQ-Sektionen rendern eigene
// Komponenten.

export async function HeroSection() {
  const t = await getTranslations('home')

  // Hero-Bullets: Icons aus service-pitch.ts (unveraendert), Labels aus de.json.
  const heroBulletIcons = SERVICE_REALITY_BULLETS.map(({ Icon }) => Icon)
  const heroBulletLabels = t.raw('hero_bullets') as string[]

  // Prozess-Steps + FAQ-Items werden hier nur fuer das JSON-LD-Schema gelesen.
  const prozessSteps = t.raw('prozess.steps') as {
    nr: number
    titel: string
    text: string
    href: string
  }[]
  const faqItems = t.raw('faq.items') as { frage: string; antwort: string }[]

  const SCHEMA_BLOCK = jsonLdScript([
    serviceSchema({
      name: 'Kfz-Schadensregulierung mit unabhängigem Sachverständigen',
      description:
        'Vermittlung an zertifizierte Kfz-Sachverständige, Anwaltliche Durchsetzung der Ansprüche, vollständige digitale Fallakte. Bundesweit verfügbar. 0 € für unverschuldet Geschädigte nach §249 BGB.',
      url: SITE_URL,
    }),
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Kfz-Schaden vollständig regulieren — vom Unfall bis zur Auszahlung',
      description:
        'In fünf Schritten vom unverschuldeten Unfall zur vollständigen Auszahlung — durchschnittlich 32 Tage, ohne Eigenanteil bei unverschuldetem Unfall.',
      totalTime: 'P32D',
      step: prozessSteps.map((s) => ({
        '@type': 'HowToStep',
        position: s.nr,
        name: s.titel,
        text: s.text,
      })),
    },
    faqPageSchema(faqItems),
  ])

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={SCHEMA_BLOCK} />

      {/* 1 — Hero Image Band */}
      <section className="relative h-[280px] overflow-hidden sm:h-[360px]" aria-labelledby="hero-band-quote">
        <Image
          src="/marketing-landing-koeln/hero-woman.png"
          alt="Geschädigte ruft Claimondo direkt nach unverschuldetem Verkehrsunfall an"
          fill priority sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/55 to-transparent" aria-hidden />
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-5">
          <div className="max-w-xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              {t('hero_band.eyebrow')}
            </p>
            <p id="hero-band-quote" className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
              {t('hero_band.quote_plain')}{' '}
              <span className="text-claimondo-light-blue">{t('hero_band.quote_accent')}</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Hero + Lead-Form */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="hero-heading">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('hero.trust_badge')}
            </div>
            <h1 id="hero-heading" className="mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
              {t('hero.h1_plain')}<br />
              <span className="text-claimondo-light-blue">{t('hero.h1_accent')}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              {t('hero.sub_headline')}
            </p>
            <ul className="mt-7 grid grid-cols-1 gap-x-4 gap-y-3 text-sm text-white/80 sm:grid-cols-2">
              {heroBulletLabels.map((label, i) => {
                const Icon = heroBulletIcons[i]
                return (
                  <li key={label} className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-light-blue" aria-hidden />
                    {label}
                  </li>
                )
              })}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/gutachter-finden"
                data-tracking="hero-wizard-cta"
                className="inline-flex items-center gap-2 rounded-full bg-claimondo-light-blue px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-white"
              >
                {t('hero.cta_primary')}
              </Link>
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
                data-tracking="call-hero"
              >
                <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                {t('hero.cta_call')}
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
                data-tracking="whatsapp-hero"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t('hero.cta_whatsapp')}
              </a>
            </div>
            <p className="mt-5 text-xs text-white/55">
              {t('hero.trust_footer')}
            </p>
          </div>
          <HomeLeadFormClient />
        </div>
      </section>
    </>
  )
}
