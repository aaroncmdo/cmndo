import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { ServiceRealitaetSection } from './ServiceRealitaetSection'
import { PlattformMechanikSection } from './PlattformMechanikSection'

// Phase B1 (21->12 Section-Komponenten): WieEsFunktioniertSection bündelt
// den „Wie es funktioniert"-Strang. Sie komponiert die bestehenden
// ServiceRealitaetSection (#5) und PlattformMechanikSection (#7) sowie die
// vormals Inline-Sektion #11 (Prozess, 5 Schritte). Content/Tokens/t()-Keys
// 1:1 aus HauptseitePremium.tsx.

export async function WieEsFunktioniertSection() {
  const t = await getTranslations('home')

  // Prozess-Steps aus de.json
  const prozessSteps = t.raw('prozess.steps') as {
    nr: number
    titel: string
    text: string
    href: string
  }[]

  return (
    <>
      {/* D4 — Koordinations-/Vor-Ort-Band (cinematisch). Landet die relocatete
          „Sie reden mit niemandem"-Headline (home.koordination) + traegt den §6
          Pruefdienst-Beat (vor Ort statt Online-Pruefdienst) im Sub.
          Foto: sv-vor-ort.webp (SV begutachtet den Schaden vor Ort). */}
      <section
        className="relative isolate flex min-h-[32rem] items-end overflow-hidden bg-claimondo-navy text-white md:min-h-[40rem]"
        aria-labelledby="koordination-heading"
      >
        <div className="absolute inset-0 -z-10">
          <Image
            src="/img/home/sv-vor-ort.webp"
            alt="Claimondo-Sachverständiger begutachtet den Unfallschaden vor Ort am Fahrzeug — kein Online-Prüfdienst"
            fill
            sizes="100vw"
            className="object-cover object-[62%_28%] md:object-center"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-claimondo-navy via-claimondo-navy/75 to-claimondo-navy/10"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/90 via-claimondo-navy/35 to-transparent"
          />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-14 pt-24 md:pb-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue">
              {t('koordination.eyebrow')}
            </p>
            <h2
              id="koordination-heading"
              className="mt-4 text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] [text-shadow:0_1px_24px_rgba(0,0,0,0.25)] sm:text-5xl md:text-[3.2rem]"
            >
              {t('koordination.heading_plain')}<br />
              <span className="text-claimondo-light-blue">{t('koordination.heading_accent')}</span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              {t('koordination.sub')}
            </p>
          </div>
        </div>
      </section>

      {/* 5 — Service-Realität */}
      <ServiceRealitaetSection />

      {/* 7 — Plattform-Mechanik */}
      <PlattformMechanikSection />

      {/* 11 — Prozess */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="prozess-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('prozess.eyebrow')}
            </p>
            <h2 id="prozess-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('prozess.heading')}
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5" role="list">
            {prozessSteps.map((s) => (
              <li
                key={s.nr}
                className="group relative rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-md focus-within:ring-2 focus-within:ring-claimondo-ondo"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t('prozess.schritt_label', { nr: s.nr })}
                </span>
                <h3 className="mt-2 text-lg font-bold text-claimondo-navy">{s.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
                {/* Doc 41 §6.2: Pattern B — Pseudo-Link ueber die ganze Card; Schritt-Badge bleibt visueller Anker. */}
                <Link
                  href={s.href}
                  className="absolute inset-0 z-10 rounded-ios-md focus:outline-none"
                  aria-label={t('prozess.card_aria', { nr: s.nr, titel: s.titel })}
                  data-tracking={`card-prozess-${s.nr}`}
                >
                  <span className="sr-only">{t('prozess.details_sr')}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  )
}
