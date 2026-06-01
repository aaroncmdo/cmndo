import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { PortalMockupSection } from './PortalMockupSection'

// Phase D6 (section-audit-Loop): ProduktAppSection bekommt das App-Shield-Motiv
// (Spec §5 / §13.2) als cinematisches Lead-Band — echtes Foto "Kundin hält die
// Claimondo-App mit dem Schild" (kundin-app.webp, ultrawide). Danach die
// bestehende PortalMockupSection (realistische Fall-Mock-Card "Wie Uber").
// Text sitzt rechts, weil Frau + Telefon-Shield links im Bild stehen — Scrim
// von rechts/unten haelt den Text lesbar, ohne das Produkt-Motiv zu verdecken.
//
// HINWEIS (Follow-up E3): Ein frischer Screenshot der echten Kunde-Fallakte
// (app.claimondo.de) ersetzt spaeter den CSS-Mock — braucht einen befuellten
// Demo-Fall (ein leer angelegter Fall ergaebe einen unbrauchbaren Screenshot).

export async function ProduktAppSection() {
  const t = await getTranslations('home')

  return (
    <>
      {/* D6 — App-Shield-Band "Alles live verfolgen" */}
      <section
        className="relative isolate flex min-h-[26rem] items-end overflow-hidden bg-claimondo-navy text-white md:min-h-[32rem]"
        aria-labelledby="produkt-app-heading"
      >
        <div className="absolute inset-0 -z-10">
          <Image
            src="/img/home/kundin-app.webp"
            alt="Kundin hält die Claimondo-App mit dem Schild-Logo — den Fall live verfolgen"
            fill
            sizes="100vw"
            className="object-cover object-[28%_center]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-l from-claimondo-navy via-claimondo-navy/70 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-claimondo-navy/85 via-claimondo-navy/20 to-transparent"
          />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-12 pt-28 md:pb-16 lg:px-8">
          <div className="ml-auto max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue">
              {t('produkt_app.eyebrow')}
            </p>
            <h2
              id="produkt-app-heading"
              className="mt-4 text-balance text-4xl font-bold leading-[1.05] tracking-[-0.02em] [text-shadow:0_1px_24px_rgba(0,0,0,0.3)] sm:text-5xl"
            >
              {t('produkt_app.heading')}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/85 sm:text-lg">
              {t('produkt_app.sub')}
            </p>
          </div>
        </div>
      </section>

      {/* Bestehende Portal-/Fall-Mock-Card ("Wie Uber") */}
      <PortalMockupSection />
    </>
  )
}
