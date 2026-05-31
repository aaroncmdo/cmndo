import Link from 'next/link'
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
