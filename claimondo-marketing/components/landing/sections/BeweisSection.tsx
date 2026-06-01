import { getTranslations } from 'next-intl/server'
import { Check, X, MapPin, Monitor } from 'lucide-react'
import { BghAuthorityGrid } from './BghAuthorityGrid'
import { WertminderungSandenDannerSection } from './WertminderungSandenDannerSection'
import { VersichererTaktikenSection } from '../VersichererTaktikenSection'

// Phase D5 (section-audit-Loop): BeweisSection bündelt den Beleg-/Authority-Strang
// zu EINER Beweisführung. Vorher waren BghAuthorityGrid (#9), Wertminderung (#12)
// und VersichererTaktiken (#17) drei gleichrangige Sektionen ohne Rahmen
// ("Authority verstreut", Spec §2.4). Jetzt rahmt ein dunkler §6-Kontrast-Block
// ("So begutachten WIR / so 'prüft' die Versicherung") den Block als eine These;
// die drei (weiterhin auf Stadt-/Conversion-Pages wiederverwendeten) Sub-
// Komponenten bleiben unverändert und werden zur Evidenz. Rhythmus: dunkel-Opener
// + weiße Authority-Mitte + dunkle Taktiken-Tabelle (ABA).

export async function BeweisSection() {
  const t = await getTranslations('home')
  const wirPunkte = t.raw('pruefdienst_kontrast.wir_punkte') as string[]
  const vsPunkte = t.raw('pruefdienst_kontrast.vs_punkte') as string[]

  return (
    <>
      {/* D5 — §6 Prüfdienst-Kontrast (Opener/Frame) */}
      <section
        className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white sm:py-24"
        aria-labelledby="pruefdienst-kontrast-heading"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(123,163,204,.12) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue">
              {t('pruefdienst_kontrast.eyebrow')}
            </p>
            <h2
              id="pruefdienst-kontrast-heading"
              className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl md:text-[2.75rem]"
            >
              {t('pruefdienst_kontrast.heading')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/75">
              {t('pruefdienst_kontrast.sub')}
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {/* So begutachten WIR — unabhängiger SV vor Ort */}
            <div className="rounded-ios-md border border-emerald-400/25 bg-emerald-400/[0.06] p-7">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <MapPin className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    {t('pruefdienst_kontrast.wir_badge')}
                  </p>
                  <p className="text-sm font-bold text-white">
                    {t('pruefdienst_kontrast.wir_label')}
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-3">
                {wirPunkte.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-white/85">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" aria-hidden />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* So "prüft" die Versicherung — Online-Prüfdienst am Schreibtisch */}
            <div className="rounded-ios-md border border-red-400/25 bg-red-500/[0.06] p-7">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                  <Monitor className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-300">
                    {t('pruefdienst_kontrast.vs_badge')}
                  </p>
                  <p className="text-sm font-bold text-white">
                    {t('pruefdienst_kontrast.vs_label')}
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-3">
                {vsPunkte.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-white/70">
                    <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" aria-hidden />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-white/55">
            {t('pruefdienst_kontrast.fussnote')}
          </p>
        </div>
      </section>

      {/* 9 — BGH-Authority */}
      <BghAuthorityGrid headingId="bgh-heading-premium" />

      {/* 12 — Wertminderung Sanden/Danner-Tabelle */}
      <WertminderungSandenDannerSection />

      {/* 17 — Versicherer-Taktiken (detaillierte Kürzungs-Mechanik) */}
      <VersichererTaktikenSection />
    </>
  )
}
