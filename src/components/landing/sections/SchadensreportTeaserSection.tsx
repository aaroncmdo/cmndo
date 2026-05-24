import Link from 'next/link'
import { ChevronRight, BarChart3 } from 'lucide-react'

// Doc 35 Fix 5: Coup-Asset (Schadensreport 2026, Layer 3) war nur im Footer.
// Teaser auf der Hauptseite — thematisch direkt hinter den Versicherer-Taktiken,
// als Daten-Beleg der dort beschriebenen Kuerzungs-Mechanik.
const STATS = [
  { wert: '30–40 %', label: 'typische Kürzung' },
  { wert: '8', label: 'BGH-Urteile' },
  { wert: '0 €', label: 'für Geschädigte' },
  { wert: '§249', label: 'BGB-Grundlage' },
] as const

export function SchadensreportTeaserSection() {
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
                Schadensreport 2026
              </p>
              <h2
                id="schadensreport-teaser"
                className="mt-4 text-3xl font-bold leading-tight sm:text-4xl"
                style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
              >
                Wie stark Versicherer wirklich kürzen
              </h2>
              <p className="mt-4 leading-relaxed text-white/75">
                Prüfdienste wie ControlExpert und K-Expert kürzen typischerweise
                30–40 % der Ansprüche — UPE-Aufschläge, Verbringung, Beilackierung,
                Wertminderung. Unser Report ordnet die häufigsten Kürzungspositionen
                den BGH-Urteilen zu, die sie aushebeln.
              </p>
              <Link
                href="/schadensreport-2026"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-claimondo-navy transition-all hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
                data-tracking="cta-schadensreport-teaser"
              >
                Report ansehen
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {STATS.map((s) => (
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
