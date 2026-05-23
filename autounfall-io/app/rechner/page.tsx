import type { Metadata } from 'next'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph, toolGraph } from '@/lib/jsonld'
import { ToolPageHeader } from '@/components/tools/ToolPageHeader'
import { Rechner, type RechnerType } from '@/components/tools/Rechner'

export const metadata: Metadata = {
  title: 'Schaden-Rechner: Nutzungsausfall, Schmerzensgeld, Totalschaden & mehr',
  description:
    'Sechs kostenlose Orientierungs-Rechner rund um den Kfz-Unfallschaden: Nutzungsausfall, Schmerzensgeld, SF-Rückstufung, Totalschaden, Wertminderung und Verzugszinsen.',
  alternates: { canonical: '/rechner' },
}

// 6-in-1-Rechner-Übersicht. Mountpoint + indexierbarer Einstieg für die
// typ-parametrisierte <Rechner/>-Component (au-rechner.js). Jeder Rechner hat
// einen eigenen Anker (#nutzungsausfall …) für Deep-Links aus Artikeln/Hubs (WP-7).
const RECHNER: { type: RechnerType; anchor: string; title: string }[] = [
  { type: 'nutzungsausfall', anchor: 'nutzungsausfall', title: 'Nutzungsausfall' },
  { type: 'schmerzensgeld', anchor: 'schmerzensgeld', title: 'Schmerzensgeld' },
  { type: 'sf', anchor: 'sf', title: 'SF-Rückstufung (Schnell-Check)' },
  { type: 'totalschaden', anchor: 'totalschaden', title: 'Reparatur oder Totalschaden' },
  { type: 'wertminderung', anchor: 'wertminderung', title: 'Merkantile Wertminderung' },
  { type: 'verzugszinsen', anchor: 'verzugszinsen', title: 'Verzugszinsen' },
]

export default function RechnerPage() {
  return (
    <>
      <JsonLd
        data={siteGraph(
          toolGraph({
            slug: 'rechner',
            name: 'Kfz-Schaden-Rechner',
            description:
              'Orientierungs-Rechner: Nutzungsausfall, Schmerzensgeld, SF-Rückstufung, Totalschaden, Wertminderung, Verzugszinsen.',
          }),
        )}
      />
      <div className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <ToolPageHeader
          eyebrow="Kostenlose Rechner"
          title="Schaden-Rechner"
          intro="Sechs ehrliche Orientierungs-Schätzer — Spannen statt Scheingenauigkeit, mit Paragraf und Disclaimer. Den belastbaren Betrag liefert immer das Gutachten."
        />
        <div className="space-y-12">
          {RECHNER.map((r) => (
            <section key={r.anchor} id={r.anchor} className="scroll-mt-24">
              <h2 className="mb-1 font-display text-2xl font-bold text-au-ink">{r.title}</h2>
              <Rechner type={r.type} />
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
