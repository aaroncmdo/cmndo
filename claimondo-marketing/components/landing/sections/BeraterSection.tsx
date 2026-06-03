// components/landing/sections/BeraterSection.tsx
//
// Phase D7 (section-audit-Loop): i18n-Lücke geschlossen — Berater-Block war
// hardgecodetes Deutsch (Bestand vor dem Rework). Jetzt home.berater.* in 6
// Sprachen. Copy zugleich RDG-clean gemacht: der vormalige Quote endete mit
// "holen jeden Euro zurück" (= LexDrive-Rolle, Rollentrennung-Verstoß) und
// dupliziert den ControlExpert-Prüfdienst-Beat, der jetzt in D5 lebt. Neuer
// Quote = reine Koordination (Claimondo koordiniert, niemand muss verhandeln).

import Image from 'next/image'
import Link from 'next/link'
import { Phone, ChevronRight, Quote } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

export async function BeraterSection() {
  const t = await getTranslations('home')

  return (
    <section className="bg-claimondo-navy py-16 text-white sm:py-20" aria-labelledby="berater-heading">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-ios-lg border border-white/10 shadow-claimondo-lg">
          <Image
            src="/marketing-landing-koeln/berater.png"
            alt={t('berater.foto_alt')}
            fill
            sizes="(max-width: 768px) 100vw, 40vw"
            className="object-cover"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            {t('berater.eyebrow')}
          </p>
          <h2 id="berater-heading" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            {t('berater.heading')}
          </h2>
          <Quote className="mt-6 h-8 w-8 text-claimondo-light-blue/60" aria-hidden />
          <blockquote className="mt-3 text-lg leading-relaxed text-white/85">
            {t('berater.quote')}
          </blockquote>
          <p className="mt-4 text-sm font-semibold text-claimondo-light-blue">
            {t('berater.quote_attribution')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="call-berater"
            >
              <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <Link
              href="/wie-es-funktioniert"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
            >
              {t('berater.cta_ablauf')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
