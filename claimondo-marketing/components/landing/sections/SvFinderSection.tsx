import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'

// Phase B1 (21->12 Section-Komponenten): SvFinderSection ist die vormals
// Inline-Sektion #13 (Einsatzgebiet: NRW-Karte + City-Pills) aus
// HauptseitePremium.tsx, 1:1 extrahiert. Content/Tokens/t()-Keys unverändert.
// Der Mapbox-Embed (Ersatz des statischen NRW-PNGs) ist ein späterer Task (E2).

// AAR-UWG-Fix 14.05.2026: SV-Zählung pro Stadt entfernt — Zahlen waren nicht
// belegbar (Phantom). Bis echte Counts aus `sachverstaendige` (status='aktiv')
// per Server-Component nachgezogen werden, listen wir die Einsatz-Städte als
// reine Pills. Anker-Stadt Köln bleibt als `primary` markiert.
const CITY_PILLS = [
  { slug: 'koeln',        label: 'Köln',         primary: true as const },
  { slug: 'duesseldorf',  label: 'Düsseldorf' },
  { slug: 'dortmund',     label: 'Dortmund' },
  { slug: 'essen',        label: 'Essen' },
  { slug: 'bonn',         label: 'Bonn' },
  { slug: 'aachen',       label: 'Aachen' },
  { slug: 'hannover',     label: 'Hannover' },
  { slug: 'berlin',       label: 'Berlin' },
  { slug: 'hamburg',      label: 'Hamburg' },
  { slug: 'leipzig',      label: 'Leipzig' },
] as const

export async function SvFinderSection() {
  const t = await getTranslations('home')

  return (
    <section className="bg-white py-16 sm:py-24" aria-labelledby="einsatzgebiet-heading">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            {t('einsatzgebiet.eyebrow')}
          </p>
          <h2 id="einsatzgebiet-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
            {t('einsatzgebiet.heading')}
          </h2>
        </div>
        <div className="mt-12 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div className="overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg shadow-claimondo-sm">
            <Image
              src="/marketing-landing-koeln/nrw-karte.png"
              alt={t('einsatzgebiet.map_alt')}
              width={900} height={650}
              className="h-auto w-full"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-claimondo-shield">
              {t('einsatzgebiet.city_intro')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CITY_PILLS.map((c) => (
                <Link
                  key={c.slug}
                  href={`/kfz-gutachter/${c.slug}`}
                  className={
                    'primary' in c && c.primary
                      ? 'rounded-full bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield'
                      : 'rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy'
                  }
                >
                  {c.label}
                </Link>
              ))}
              <Link
                href="/kfz-gutachter"
                className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield"
              >
                {t('einsatzgebiet.alle_staedte_cta')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
