import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { BeraterSection } from './BeraterSection'
import { FounderSection } from '../FounderSection'

// Phase D7 (section-audit-Loop): MenschenSection = "Ein Team hinter Ihrem Fall"
// (Aaron-locked Section #7). Lead = cinematisches Team-Band (team-band.webp,
// 16:9, Scrim-beats-Box wie das D4-Vor-Ort-Band), danach Founder (E-E-A-T,
// shared, schon i18n) + Berater (persönliche Begleitung, in D7 i18n+RDG-clean
// gemacht). Rhythmus dunkel-Band → helle Founder-Mitte → dunkler Berater-Abschluss
// (endet auf der Telefon-CTA).

export async function MenschenSection() {
  const t = await getTranslations('home')

  return (
    <>
      {/* D7 — Team-Band Lead "Ein Team hinter Ihrem Fall" */}
      <section
        className="relative isolate flex min-h-[28rem] items-end overflow-hidden bg-claimondo-navy text-white md:min-h-[34rem]"
        aria-labelledby="team-band-heading"
      >
        <div className="absolute inset-0 -z-10">
          <Image
            src="/img/home/team-band.webp"
            alt="Das Claimondo-Team — Ihre Ansprechpartner für die Schadenregulierung"
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-claimondo-navy via-claimondo-navy/70 to-claimondo-navy/10"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/30 to-transparent"
          />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-14 pt-24 md:pb-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue">
              {t('team_band.eyebrow')}
            </p>
            <h2
              id="team-band-heading"
              className="mt-4 text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] [text-shadow:0_1px_24px_rgba(0,0,0,0.25)] sm:text-5xl md:text-[3.2rem]"
            >
              {t('team_band.heading')}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              {t('team_band.sub')}
            </p>
          </div>
        </div>
      </section>

      {/* 20 — Founder (E-E-A-T) */}
      <FounderSection />

      {/* 6 — Berater (persönliche Begleitung) */}
      <BeraterSection />
    </>
  )
}
