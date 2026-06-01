import Image from 'next/image'
import { Lock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

// Phase D6 + E3 (section-audit-Loop): ProduktAppSection = App-Shield-Motiv
// (Spec §5/§13.2) als cinematisches Lead-Band (kundin-app.webp, "Kundin haelt
// die Claimondo-App mit dem Schild") + ECHTER Portal-Screenshot (E3) statt
// CSS-Mock: die reale Kunde-Fallakte (app.claimondo.de/kunde) — Phasen-Strip,
// "Mein Geld" (echte Forderung), Betreuer/SV-Cards, Fortschritt, Chat. Shot aus
// einem synthetischen Demo-Fall (PII-safe, kein echter SV-/Kundenname).
//
// PortalMockupSection (CSS-Mock) wird hier NICHT mehr gerendert, bleibt aber als
// Component bestehen — sie ist auf /wie-es-funktioniert + /kfz-gutachter/[stadt]
// weiterhin im Einsatz (shared, kein Dead-Code).

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

      {/* E3 — echter Portal-Screenshot (statt CSS-Mock) */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-label="Echtzeit-Fallakte im Claimondo-Kundenportal">
        <div className="mx-auto max-w-5xl px-5">
          {/* Desktop: Browser-Frame */}
          <div className="hidden overflow-hidden rounded-ios-lg border border-claimondo-border bg-white shadow-claimondo-lg md:block">
            <div className="flex items-center gap-2 border-b border-claimondo-border bg-claimondo-bg px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-red-400/70" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-amber-400/70" aria-hidden />
              <span className="h-3 w-3 rounded-full bg-emerald-400/70" aria-hidden />
              <span className="ml-3 inline-flex items-center gap-1.5 rounded-full border border-claimondo-border bg-white px-3 py-1 text-[11px] font-medium text-claimondo-shield">
                <Lock className="h-3 w-3 text-emerald-600" aria-hidden />
                app.claimondo.de/kunde
              </span>
            </div>
            <Image
              src="/img/home/portal-fallakte.webp"
              alt="Echtzeit-Fallakte im Claimondo-Kundenportal — Phasen, Mein Geld, Betreuer und Chat live verfolgen"
              width={1600}
              height={1265}
              className="h-auto w-full"
            />
          </div>
          {/* Mobile: gerahmter Portrait-Screenshot, oben angeschnitten */}
          <div className="mx-auto max-w-[20rem] overflow-hidden rounded-ios-lg border border-claimondo-border bg-white shadow-claimondo-md md:hidden">
            <Image
              src="/img/home/portal-fallakte-mobile.webp"
              alt="Echtzeit-Fallakte im Claimondo-Kundenportal (mobil) — Phasen, Mein Geld, Betreuer und Chat"
              width={600}
              height={2617}
              className="h-auto w-full"
            />
          </div>
        </div>
      </section>
    </>
  )
}
