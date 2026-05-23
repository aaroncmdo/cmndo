import type { BrandFakt } from '@/lib/seo/brand-fakten-library'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

/**
 * CitationBox (Stream D / Doc 29 Hebel 1) — Box mit den 4 atomaren, zitierfähigen
 * BGH/§-Faktensätzen am Kopf jeder Spoke (nach AssetHero, vor dem Body). Princeton-
 * GEO: citation-ready Fakten weit oben → höhere AI-Zitier-Wahrscheinlichkeit
 * (Sub-Sentence-Matching). Die Sätze stammen wortgleich aus der Fakten-Library
 * (F1–F56), gemappt per src/data/citation-box-mapping.ts.
 *
 * Die `.citation-box`-Klasse ist der speakable-Schema-Selektor (autoSchemaGraph
 * in jsonld.ts) — Voice-Assistenten lesen genau diese Fakten vor.
 */
export function CitationBox({ sentences }: { sentences: BrandFakt[] }) {
  if (!sentences.length) return null
  return (
    <section className="citation-box mt-8 rounded-ios-lg border border-claimondo-ondo/20 bg-claimondo-bg p-5 sm:p-6">
      <h2 style={HEAD_FONT} className="text-[0.8125rem] font-bold uppercase tracking-[0.04em] text-claimondo-ondo">
        Auf einen Blick — gesicherte Fakten
      </h2>
      <ul className="mt-3 flex flex-col gap-3.5">
        {sentences.map((f) => (
          <li key={f.id} className="border-l-2 border-claimondo-ondo/40 pl-3.5">
            <p className="text-[0.95rem] leading-relaxed text-claimondo-navy">{f.text}</p>
            {f.sources && f.sources.length > 0 && (
              <p className="mt-1 text-xs font-semibold text-claimondo-shield">{f.sources.join(' · ')}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
