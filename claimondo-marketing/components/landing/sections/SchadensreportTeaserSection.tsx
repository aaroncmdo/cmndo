import Link from 'next/link'
import { ChevronRight, BarChart3 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

// Doc 35 Fix 5: Coup-Asset (Schadensreport 2026, Layer 3) war nur im Footer.
// Teaser auf der Hauptseite — gedacht als Daten-Beleg der Kuerzungs-Mechanik,
// die die VersichererTaktikenSection beschreibt, und deshalb urspruenglich
// "direkt dahinter" platziert.
//
// ⚠ IST-ZUSTAND WEICHT AB (gemessen 28.08.2026 auf prod): Seit dem
// B1-Schnitt (21 -> 12 Section-Komponenten) liegen zwischen den Taktiken und
// diesem Teaser DREI Sektionen — ProduktApp, Menschen, SvFinder. In
// LandingPage.tsx steht <SchadensreportSection /> an Position 10 von 14, auf
// Bildschirm 27,4 von 34,3 (mobil) bzw. 17,6 von 22 (Desktop).
//
// Bewusst NICHT eigenmaechtig zurueckverschoben, aus zwei Gruenden:
//   1. Der Nutzen waere gering. Die Kernaussage steht laengst weiter vorne:
//      "32 Tage Ø Auszahlung statt 4–6 Monate Branchen-Durchschnitt" in der
//      Hero-Subheadline (Bildschirm 0,5) und nochmal in PlattformMechanik
//      (10,7) — insgesamt 10x im ausgelieferten HTML. Dieser Teaser ist die
//      Vertiefung, nicht der erste Beweis.
//   2. Es gaebe ein Rhythmus-Risiko. Diese Sektion und ProduktAppSection sind
//      beide `bg-claimondo-bg`; direkt hintereinander stuenden zwei helle
//      Blocks, unmittelbar hinter dem dunklen Abschluss der BeweisSection,
//      deren ABA-Rhythmus im eigenen Header ausdruecklich festgehalten ist.
//
// Wer die urspruengliche Absicht wiederherstellen will, verschiebt in
// LandingPage.tsx <SchadensreportSection /> vor <ProduktAppSection /> UND
// prueft dabei den Hell/Dunkel-Wechsel der drei betroffenen Sektionen.

export async function SchadensreportTeaserSection() {
  const t = await getTranslations('home')

  type StatItem = { wert: string; label: string }
  const stats = t.raw('schadensreport_teaser.stats') as StatItem[]

  return (
    <section className="bg-claimondo-bg py-16 sm:py-20" aria-labelledby="schadensreport-teaser">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="relative isolate overflow-hidden rounded-ios-lg bg-claimondo-navy p-8 text-white sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 85% 20%, rgba(69,115,162,0.35), transparent 55%)',
            }}
          />
          <div className="relative grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue">
                <BarChart3 className="h-4 w-4" aria-hidden />
                {t('schadensreport_teaser.eyebrow')}
              </p>
              <h2
                id="schadensreport-teaser"
                className="mt-4 text-3xl font-bold leading-tight sm:text-4xl"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              >
                {t('schadensreport_teaser.heading')}
              </h2>
              <p className="mt-4 leading-relaxed text-white/75">
                {t('schadensreport_teaser.body')}
              </p>
              <Link
                href="/schadensreport-2026"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-claimondo-navy transition-all hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
                data-tracking="cta-schadensreport-teaser"
              >
                {t('schadensreport_teaser.cta')}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-ios-md bg-white/5 p-4 text-center backdrop-blur-sm"
                >
                  <div className="text-2xl font-extrabold text-white">{s.wert}</div>
                  <div className="mt-1 text-xs text-claimondo-light-blue">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
