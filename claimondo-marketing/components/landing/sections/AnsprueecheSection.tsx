import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { SiebenFehlerSection } from '../SiebenFehlerSection'
import { TeslaEAutoSection } from './TeslaEAutoSection'

// Phase B1 (21->12 Section-Komponenten): AnsprueecheSection bündelt den
// „Was Ihnen zusteht"-Block. Sie komponiert die vormals Inline-Sektion #4
// (Ansprüche-Cards) + Inline-Sektion #8 (Misstrauens-Trio) sowie die
// bestehenden SiebenFehlerSection (#19) und TeslaEAutoSection (#14, als
// Sub-Block). Content/Tokens/t()-Keys 1:1 aus HauptseitePremium.tsx.

export async function AnsprueecheSection() {
  const t = await getTranslations('home')

  // Ansprüche-Cards aus de.json
  const ansprucheCards = t.raw('ansprueche.cards') as {
    titel: string
    text: string
    href: string
  }[]

  // Misstrauen-Cards aus de.json
  const misstrauenCards = t.raw('misstrauen.cards') as {
    href: string
    titel: string
    text: string
    cta: string
  }[]

  return (
    <>
      {/* 4 — Was Ihnen zusteht: Vier Gespraeche (premium, nummeriert 1-4) */}
      <section className="bg-claimondo-bg py-20 sm:py-28" aria-labelledby="ansprueche-heading">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('ansprueche.eyebrow')}
            </p>
            <h2 id="ansprueche-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-claimondo-navy sm:text-4xl">
              {t('ansprueche.heading')}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-claimondo-shield">
              {t('ansprueche.sub')}
            </p>
          </div>
          <ol className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2" role="list">
            {ansprucheCards.map((a, i) => (
              <li key={a.titel}>
                <Link
                  href={a.href}
                  data-tracking={`card-anspruch-${a.titel.split(' ')[0].toLowerCase()}`}
                  className="group relative flex h-full gap-5 rounded-ios-lg border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-md sm:p-7"
                >
                  <span
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-lg font-extrabold text-claimondo-light-blue"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold leading-snug text-claimondo-navy">{a.titel}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{a.text}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-claimondo-ondo group-hover:text-claimondo-navy">
                      {t('ansprueche.card_cta')}
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 8 — Misstrauens-Trio (verschoben, Doc 35 Fix 4b/c) */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="sorgen-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              {t('misstrauen.eyebrow')}
            </p>
            <h2 id="sorgen-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              {t('misstrauen.heading')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
              {t('misstrauen.sub')}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {misstrauenCards.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group flex flex-col rounded-ios-md border border-claimondo-border bg-claimondo-bg p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-md"
              >
                <h3 className="text-lg font-bold text-claimondo-navy">{m.titel}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-claimondo-shield">{m.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-claimondo-ondo">
                  {m.cta}
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/unfall-was-tun-als-geschaedigter"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3.5 text-sm font-semibold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
            >
              {t('misstrauen.leitfaden_cta')}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* 19 — Sieben Fehler (Wissensdatenbank §12) */}
      <SiebenFehlerSection />

      {/* 14 — Tesla / E-Auto (Sub-Block) */}
      <TeslaEAutoSection />
    </>
  )
}
