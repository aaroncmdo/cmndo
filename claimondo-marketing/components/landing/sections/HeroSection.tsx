import Link from 'next/link'
import Image from 'next/image'
import { Phone, MessageCircle, ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  serviceSchema, faqPageSchema, jsonLdScript,
  SITE_URL, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { SERVICE_REALITY_BULLETS } from '@/lib/brand/service-pitch'
import { HomeLeadFormClient } from '../HomeLeadFormClient'

// Phase C (Hero-Pilot) — Qualitaets-Muster der Premium-Rework.
// Die vormals ZWEI Hero-Baender (#1 Foto-Band + #2 Hero+Lead-Form) sind zu EINER
// cinematischen Hero-Section verschmolzen (Spec 2026-05-31 §4): full-bleed Foto
// (Paar+App mit echtem Claimondo-Shield) + linear-gradient-Scrim (KEIN Box/Border/
// Blur — section-audit "Scrim beats Box"), Text bottom-left, Lead-Form als Glaspanel
// rechts. Copy 1:1 aus den bestehenden, RDG-sicheren home.hero.*-Keys (Rollentrennung:
// "unsere Partnerkanzlei verhandelt"). Tokens strikt (claimondo-* -> var(--brand-*)),
// kein Inline-Hex; Scrims = Tailwind-Gradient-Utilities auf Token-Farben.
//
// Das HowTo/Service/FAQ-JSON-LD-Schema (vormals am Kopf von HauptseitePremium)
// bleibt als erster DOM-Knoten der Page erhalten und liegt deshalb hier.
// prozessSteps + faqItems werden ausschliesslich fuers Schema gelesen.

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

      {/* Hero — ein cinematisches Band (Foto + Scrim + Text + Lead-Form) */}
      <section
        className="relative isolate flex min-h-[42rem] items-end overflow-hidden bg-claimondo-navy text-white md:min-h-[min(90vh,52rem)]"
        aria-labelledby="hero-heading"
      >
        {/* Full-bleed Foto */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="/img/home/hero-paar.webp"
            alt="Paar nach unverschuldetem Unfall zeigt die Claimondo-App mit Schutzschild — im Hintergrund das beschädigte Fahrzeug"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[68%_18%] md:object-[center_18%]"
          />
          {/* Scrim 1: bottom-up (Grounding + Lesbarkeit unten) */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-claimondo-navy via-claimondo-navy/70 to-claimondo-navy/5"
          />
          {/* Scrim 2: left (Text-Lesbarkeit, Subjekte bleiben rechts sichtbar) */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/90 via-claimondo-navy/30 to-transparent"
          />
        </div>

        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-end gap-y-10 px-5 pb-14 pt-28 md:grid-cols-[1.08fr_0.92fr] md:gap-x-12 md:pb-20 lg:px-8">
          {/* LEFT — Copy + CTAs */}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {t('hero.trust_badge')}
            </div>

            <h1
              id="hero-heading"
              className="mt-5 text-balance text-4xl font-bold leading-[1.02] tracking-[-0.02em] [text-shadow:0_1px_24px_rgba(0,0,0,0.25)] sm:text-5xl md:text-[3.4rem] lg:text-[3.9rem]"
            >
              {t('hero.h1_plain')}{' '}
              <span className="text-claimondo-light-blue">{t('hero.h1_accent')}</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              {t('hero.sub_headline')}
            </p>

            <ul className="mt-7 grid max-w-xl grid-cols-1 gap-x-5 gap-y-2.5 text-sm text-white/85 sm:grid-cols-2">
              {heroBulletLabels.map((label, i) => {
                const Icon = heroBulletIcons[i]
                return (
                  <li key={label} className="flex items-start gap-2">
                    {Icon ? (
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-light-blue" aria-hidden />
                    ) : null}
                    {label}
                  </li>
                )
              })}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/gutachter-finden"
                data-tracking="hero-wizard-cta"
                className="group inline-flex items-center gap-2 rounded-full bg-claimondo-light-blue px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-white"
              >
                {t('hero.cta_primary')}
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
                data-tracking="call-hero"
              >
                <Phone className="h-5 w-5 text-claimondo-light-blue" aria-hidden />
                {t('hero.cta_call')}
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
                data-tracking="whatsapp-hero"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t('hero.cta_whatsapp')}
              </a>
            </div>

            <p className="mt-5 text-xs text-white/60">{t('hero.trust_footer')}</p>
          </div>

          {/* RIGHT — Lead-Form Glaspanel */}
          <div className="w-full md:max-w-sm md:justify-self-end">
            <HomeLeadFormClient />
          </div>
        </div>
      </section>
    </>
  )
}
