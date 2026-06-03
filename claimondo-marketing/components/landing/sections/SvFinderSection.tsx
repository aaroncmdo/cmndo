import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { GutachterFindenSection } from '@/components/gutachter-finden/GutachterFindenSection'

// Phase D8 (section-audit-Loop / E2): SvFinderSection ersetzt das statische
// NRW-PNG (#13) durch die ECHTE interaktive Mapbox-Karte — wiederverwendet die
// bestehende GutachterFindenSection (variant='full', kompakte Höhe).
//
// Robustheit: Der Full-Finder lädt SV-Daten über den Service-Role-Admin-Client
// (gutachter-finder-actions). Fehlt SUPABASE_SERVICE_ROLE_KEY in der Umgebung,
// wirft der Admin-Client — das DARF die Flagship-Home nicht 500en. Darum gaten
// wir auf Key-Presence und fallen sonst auf die statische NRW-Karte zurück.
// (Prod-VPS hat den Key — dort rendert die interaktive Karte; identischer Pfad
// wie /gutachter-finden.) Der Geolocation-Prompt des Map-Clients wird durch ein
// gesetztes initialCenter (Deutschland-Überblick) unterdrückt — sonst würde die
// Home bei jedem Load nach dem Standort fragen. City-Pills bleiben als
// SEO-Deep-Links auf die /kfz-gutachter/[stadt]-Spokes.

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
  const hasFinder = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  return (
    <section className="bg-white py-16 sm:py-24" aria-labelledby="einsatzgebiet-heading">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
          {t('einsatzgebiet.eyebrow')}
        </p>
        <h2 id="einsatzgebiet-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
          {t('einsatzgebiet.heading')}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-claimondo-shield">
          {t('einsatzgebiet.sub')}
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-7xl px-5">
        <div className="overflow-hidden rounded-ios-lg border border-claimondo-border shadow-claimondo-md">
          {hasFinder ? (
            <GutachterFindenSection
              variant="full"
              height="70vh"
              initialCenter={{ lat: 51.1, lng: 10.2 }}
              initialZoom={5.3}
            />
          ) : (
            <Image
              src="/marketing-landing-koeln/nrw-karte.png"
              alt={t('einsatzgebiet.map_alt')}
              width={1200}
              height={620}
              className="h-auto w-full"
            />
          )}
        </div>
      </div>

      {/* CTA in die Vollbild-Suche + City-Pills (SEO-Deep-Links) */}
      <div className="mx-auto mt-8 max-w-6xl px-5">
        <div className="flex flex-col items-center gap-5 text-center">
          <Link
            href="/gutachter-finden"
            className="inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-7 py-3.5 text-sm font-bold text-white shadow-claimondo-md transition-all hover:bg-claimondo-shield"
            data-tracking="cta-home-svfinder-fullscreen"
          >
            {t('einsatzgebiet.finder_cta')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          <div>
            <p className="text-sm font-semibold text-claimondo-shield">
              {t('einsatzgebiet.city_intro')}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
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
