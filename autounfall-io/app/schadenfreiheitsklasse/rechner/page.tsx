import type { Metadata } from 'next'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph, toolGraph } from '@/lib/jsonld'
import { ToolPageHeader } from '@/components/tools/ToolPageHeader'
import { SfRechner } from '@/components/tools/SfRechner'

// Aus WP-3 zurückgestellt (ARTICLE-sf-klasse-rechner = WebApplication).
// Eigene Route trotz noch fehlendem /schadenfreiheitsklasse-Hub (WP-7) — der
// Breadcrumb nennt den Hub bereits (Ziel-URL, transienter 404 bis WP-7).
export const metadata: Metadata = {
  title: 'SF-Rückstufungs-Rechner: Was ein Unfall Ihre Versicherung kostet',
  description:
    'Versicherer-spezifischer SF-Rückstufungs-Rechner: Mehrkosten über die Wiederaufstiegs-Jahre schätzen und entscheiden — selbst zahlen oder der Versicherung melden.',
  alternates: { canonical: '/schadenfreiheitsklasse/rechner' },
}

export default function SfRechnerPage() {
  return (
    <>
      <JsonLd
        data={siteGraph(
          toolGraph({
            slug: 'schadenfreiheitsklasse/rechner',
            name: 'SF-Rückstufungs-Rechner',
            description:
              'Versicherer-spezifischer Rechner für die Beitrags-Mehrkosten nach einer SF-Rückstufung — selbst zahlen vs. Versicherung melden.',
            trail: [{ name: 'Schadenfreiheitsklasse', slug: 'schadenfreiheitsklasse' }],
          }),
        )}
      />
      <div className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <ToolPageHeader
          eyebrow="Kostenloser Rechner"
          title="SF-Rückstufungs-Rechner"
          intro="Ein gemeldeter Schaden stuft Sie zurück — und der höhere Beitrag läuft Jahre nach. Wählen Sie Ihren Versicherer und Ihre SF-Klasse: Der Rechner schätzt die Mehrkosten über den Wiederaufstieg und sagt, ob sich Selbstzahlen lohnt."
        />
        <SfRechner />
      </div>
    </>
  )
}
