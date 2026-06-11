import type { City } from '@/lib/cluster'
import { CASES } from '@/lib/content'
import { CasesCarousel } from './CasesCarousel'

// SERVER-Section "Aus der Praxis" — eigene <section id="praxis"> (Mock v3-praxis-v2
// Z.4402-4436 trennt Reviews und Praxis). Aus der ReviewsSection ausgegliedert.
// Cases-Mechanik bleibt die bewusste LP-Variante (CasesCarousel: Dots + breites
// Multi-Card-Layout, DIFF 2 — NICHT die Mock-Arrows/440px-Einzelspalte).

// Ø Mehr-Auszahlung ueber alle CASES, auf 5er gerundet (Mock-Konvention).
// CASES ist cluster-agnostisch → der Wert ist identisch ueber alle 3 Cluster-LPs.
const praxisAvgDiff =
  Math.round(CASES.reduce((s, c) => s + (c.anspruch - c.erstangebot), 0) / CASES.length / 5) * 5
const eurFmt = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function PraxisSection({ city }: { city: City }) {
  return (
    <section id="praxis" className="py-8 md:py-10 bg-paper">
      <div className="max-w-[1000px] mx-auto px-6">
        <div className="text-center mb-3">
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[.08em] uppercase text-amber">
            <span className="eyebrow-dot" /> Aus der Praxis · {city.name}
          </span>
        </div>
        {/* Section-H2 + Sub + Hero-Stat (Wert build-time aus CASES, 5er-gerundet) */}
        <h2 className="praxis-section-h2">Schnellangebot der Versicherung — oder das, was Ihnen zusteht.</h2>
        <p className="praxis-section-sub">
          Fünf anonymisierte Realfälle, die unser Netzwerk in den letzten 12 Monaten begleitet hat.
        </p>
        <div className="praxis-hero-stat">
          <div className="praxis-stat-big">+ {eurFmt(praxisAvgDiff)}</div>
          <div className="praxis-stat-sub">im Schnitt mehr für unsere Mandanten</div>
          <div className="praxis-stat-source">{CASES.length} anonymisierte Realfälle</div>
        </div>
        <CasesCarousel city={city} />
        {/* Vertrauenszeile (Pflicht §5 UWG) */}
        <p className="mt-5 text-[12px] text-muted leading-relaxed max-w-[820px] mx-auto text-center">
          Alle Fälle beruhen auf real abgerechneten, anonymisierten Schadenvorgängen.
          Auszahlung ist einzelfallabhängig.
        </p>
      </div>
    </section>
  )
}
